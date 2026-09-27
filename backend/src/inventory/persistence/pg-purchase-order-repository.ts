import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AuthContext } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import type { PurchaseOrderRepository } from '../application/purchase-order-repository.js';
import type {
  PurchaseOrder, PurchaseOrderInput, PurchaseOrderLine, PurchaseOrderLineInput, PurchaseOrderListQuery, PurchaseOrderPatch,
  PurchaseOrderReceiptRef, PurchaseOrderStatus, PurchaseOrderSummary,
} from '../domain/purchase-order.js';
import { appendPurchaseOrderAudit } from './purchase-order-audit.js';
import { withTransaction } from './transaction.js';

/** Business date for "order date not in the future" (ADR-0010 A-01, same as ADR-0009 A-01). */
const BUSINESS_TIME_ZONE = 'Asia/Karachi';

const HEADER_COLUMNS = `po.id, po.po_number, po.branch_id, po.supplier_id, to_char(po.order_date, 'YYYY-MM-DD') AS order_date,
  po.status, po.status_reason, po.revision, po.created_at, po.updated_at`;

export interface PurchaseOrderHeaderRow {
  id: string;
  po_number: string;
  branch_id: string;
  supplier_id: string;
  order_date: string;
  status: PurchaseOrderStatus;
  status_reason: string | null;
  revision: number;
  created_at: Date;
  updated_at: Date;
}

type Queryable = Pool | PoolClient;

/** Header in the caller's branch; `forUpdate` serialises edits, cancel/close and receipts (ADR-0010 D-05). */
export async function selectPurchaseOrderHeader(
  client: Queryable, id: string, branchId: string, forUpdate: boolean,
): Promise<PurchaseOrderHeaderRow | null> {
  const result = await client.query<PurchaseOrderHeaderRow>(
    `SELECT ${HEADER_COLUMNS} FROM purchase_order po WHERE po.id = $1 AND po.branch_id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
    [id, branchId],
  );
  return result.rows[0] ?? null;
}

/** Current-revision lines with received/pending/excess derived in NUMERIC (ADR-0010 D-04), plus linked receipts. */
export async function loadPurchaseOrderDetail(client: Queryable, header: PurchaseOrderHeaderRow): Promise<PurchaseOrder> {
  const lines = await client.query<PurchaseOrderLine>(
    `SELECT l.id, l.line_no, l.item_id, l.brand_id, l.pack_variant_id, l.ordered_quantity, l.rate,
            round(r.received, 6)::text AS received_quantity,
            round(greatest(l.ordered_quantity - r.received, 0), 6)::text AS pending_quantity,
            round(greatest(r.received - l.ordered_quantity, 0), 6)::text AS excess_quantity
     FROM purchase_order_line l
     CROSS JOIN LATERAL (SELECT COALESCE(sum(grl.pack_quantity), 0)::numeric AS received
                         FROM goods_receipt_line grl WHERE grl.purchase_order_line_id = l.id) r
     WHERE l.purchase_order_id = $1 AND l.revision = $2
     ORDER BY l.line_no`,
    [header.id, header.revision],
  );
  const receipts = await client.query<Omit<PurchaseOrderReceiptRef, 'created_at'> & { created_at: Date }>(
    `SELECT id, to_char(receipt_date, 'YYYY-MM-DD') AS receipt_date, supplier_bill_no, created_at
     FROM goods_receipt WHERE purchase_order_id = $1 ORDER BY receipt_date, created_at, id`,
    [header.id],
  );
  return {
    ...header,
    created_at: header.created_at.toISOString(),
    updated_at: header.updated_at.toISOString(),
    lines: lines.rows,
    receipts: receipts.rows.map(r => ({ ...r, created_at: r.created_at.toISOString() })),
  };
}

/**
 * Called inside the goods receipt transaction after the receipt lines are
 * written. The PO row is already locked FOR UPDATE and `before` was loaded
 * before the receipt was inserted. Status becomes RECEIVED when every current
 * line has received at least its ordered quantity, otherwise
 * PARTIALLY_RECEIVED (owner decisions O-03/O-06); audited as action RECEIPT.
 */
export async function refreshPurchaseOrderAfterReceipt(
  client: PoolClient, header: PurchaseOrderHeaderRow, before: PurchaseOrder, goodsReceiptId: string, auth: AuthContext,
): Promise<void> {
  const complete = await client.query<{ complete: boolean }>(
    `SELECT COALESCE(bool_and(r.received >= l.ordered_quantity), false) AS complete
     FROM purchase_order_line l
     CROSS JOIN LATERAL (SELECT COALESCE(sum(grl.pack_quantity), 0) AS received
                         FROM goods_receipt_line grl WHERE grl.purchase_order_line_id = l.id) r
     WHERE l.purchase_order_id = $1 AND l.revision = $2`,
    [header.id, header.revision],
  );
  const status: PurchaseOrderStatus = complete.rows[0]?.complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
  const updated = await client.query<PurchaseOrderHeaderRow>(
    `UPDATE purchase_order po SET status = $2, updated_at = clock_timestamp() WHERE po.id = $1 RETURNING ${HEADER_COLUMNS}`,
    [header.id, status],
  );
  const after = await loadPurchaseOrderDetail(client, updated.rows[0]!);
  await appendPurchaseOrderAudit(client, auth, 'RECEIPT', before, after, goodsReceiptId);
}

async function assertOrderDateNotFuture(client: PoolClient, orderDate: string): Promise<void> {
  const check = await client.query<{ future: boolean }>(
    `SELECT $1::date > (now() AT TIME ZONE '${BUSINESS_TIME_ZONE}')::date AS future`, [orderDate],
  );
  if (check.rows[0]?.future) throw new AppError(400, 'INVALID_ORDER_DATE', 'order_date cannot be in the future');
}

async function assertSupplierUsable(client: PoolClient, supplierId: string): Promise<void> {
  const supplier = await client.query<{ active: boolean }>('SELECT active FROM supplier_master WHERE id = $1 FOR SHARE', [supplierId]);
  if (!supplier.rows[0]) throw new AppError(400, 'INVALID_REFERENCE', 'supplier_id does not reference an existing supplier');
  if (!supplier.rows[0].active) throw new AppError(409, 'SUPPLIER_INACTIVE', 'A purchase order cannot be placed with an inactive supplier');
}

/**
 * Branch ownership first (false = some item is missing or in another branch,
 * reported as 404 without leaking), then active items and matching, active
 * pack variants (ADR-0010 A-02).
 */
async function checkLines(client: PoolClient, lines: PurchaseOrderLineInput[], auth: AuthContext): Promise<boolean> {
  const itemIds = [...new Set(lines.map(l => l.item_id))];
  const items = await client.query<{ id: string; branch_id: string; active: boolean }>(
    'SELECT id, branch_id, active FROM item_master WHERE id = ANY($1::uuid[])', [itemIds],
  );
  const itemById = new Map(items.rows.map(r => [r.id, r]));
  if (itemIds.some(id => itemById.get(id)?.branch_id !== auth.branchId)) return false;
  lines.forEach((line, i) => {
    if (!itemById.get(line.item_id)?.active) throw new AppError(409, 'ITEM_INACTIVE', `lines[${i}]: item is inactive`);
  });
  const packIds = [...new Set(lines.map(l => l.pack_variant_id))];
  const packs = await client.query<{ id: string; item_id: string; brand_id: string; active: boolean }>(
    'SELECT id, item_id, brand_id, active FROM pack_variant WHERE id = ANY($1::uuid[]) FOR SHARE', [packIds],
  );
  const packById = new Map(packs.rows.map(r => [r.id, r]));
  lines.forEach((line, i) => {
    const pack = packById.get(line.pack_variant_id);
    if (!pack || pack.item_id !== line.item_id || pack.brand_id !== line.brand_id) {
      throw new AppError(400, 'INVALID_REFERENCE', `lines[${i}]: pack_variant_id does not belong to the given item_id/brand_id combination`);
    }
    if (!pack.active) throw new AppError(409, 'PACK_VARIANT_INACTIVE', `lines[${i}]: pack variant is inactive`);
  });
  return true;
}

async function insertLines(client: PoolClient, orderId: string, revision: number, lines: PurchaseOrderLineInput[]): Promise<void> {
  for (const [i, line] of lines.entries()) {
    await client.query(
      `INSERT INTO purchase_order_line (id, purchase_order_id, revision, line_no, item_id, brand_id, pack_variant_id, ordered_quantity, rate)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [randomUUID(), orderId, revision, i + 1, line.item_id, line.brand_id, line.pack_variant_id, line.ordered_quantity, line.rate ?? null],
    );
  }
}

export class PgPurchaseOrderRepository implements PurchaseOrderRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: PurchaseOrderInput, auth: AuthContext): Promise<PurchaseOrder | null> {
    return withTransaction(this.pool, async (client) => {
      if (!await checkLines(client, input.lines, auth)) return null;
      await assertSupplierUsable(client, input.supplier_id);
      await assertOrderDateNotFuture(client, input.order_date);
      const inserted = await client.query<PurchaseOrderHeaderRow>(
        `INSERT INTO purchase_order AS po (id, branch_id, supplier_id, order_date)
         VALUES ($1, $2, $3, $4::date) RETURNING ${HEADER_COLUMNS}`,
        [randomUUID(), auth.branchId, input.supplier_id, input.order_date],
      );
      const header = inserted.rows[0];
      if (!header) throw new Error('Purchase order insert did not return a record');
      await insertLines(client, header.id, header.revision, input.lines);
      const order = await loadPurchaseOrderDetail(client, header);
      await appendPurchaseOrderAudit(client, auth, 'CREATE', null, order);
      return order;
    });
  }

  async update(id: string, patch: PurchaseOrderPatch, auth: AuthContext): Promise<PurchaseOrder | null> {
    return withTransaction(this.pool, async (client) => {
      const header = await selectPurchaseOrderHeader(client, id, auth.branchId, true);
      if (!header) return null;
      if (header.status !== 'ISSUED') {
        throw new AppError(409, 'PO_NOT_EDITABLE', `Purchase order ${header.po_number} is ${header.status}; it can only be edited before its first receipt`);
      }
      const before = await loadPurchaseOrderDetail(client, header);
      if (patch.lines && !await checkLines(client, patch.lines, auth)) {
        throw new AppError(404, 'NOT_FOUND', 'Referenced item not found');
      }
      const supplierId = patch.supplier_id ?? header.supplier_id;
      await assertSupplierUsable(client, supplierId);
      if (patch.order_date !== undefined) await assertOrderDateNotFuture(client, patch.order_date);
      const revision = patch.lines ? header.revision + 1 : header.revision;
      const updated = await client.query<PurchaseOrderHeaderRow>(
        `UPDATE purchase_order po SET supplier_id = $2, order_date = $3::date, revision = $4, updated_at = clock_timestamp()
         WHERE po.id = $1 RETURNING ${HEADER_COLUMNS}`,
        [id, supplierId, patch.order_date ?? header.order_date, revision],
      );
      const updatedHeader = updated.rows[0]!;
      if (patch.lines) await insertLines(client, id, revision, patch.lines);
      const after = await loadPurchaseOrderDetail(client, updatedHeader);
      await appendPurchaseOrderAudit(client, auth, 'UPDATE', before, after);
      return after;
    });
  }

  async cancel(id: string, reason: string, auth: AuthContext): Promise<PurchaseOrder | null> {
    return this.finish(id, reason, auth, 'ISSUED', 'CANCELLED', 'CANCEL',
      'Only a purchase order without receipts (ISSUED) can be cancelled; a partly received one is closed instead');
  }

  async close(id: string, reason: string, auth: AuthContext): Promise<PurchaseOrder | null> {
    return this.finish(id, reason, auth, 'PARTIALLY_RECEIVED', 'CLOSED', 'CLOSE',
      'Only a partly received purchase order can be closed; one without receipts is cancelled instead');
  }

  private async finish(
    id: string, reason: string, auth: AuthContext,
    from: PurchaseOrderStatus, to: PurchaseOrderStatus, action: 'CANCEL' | 'CLOSE', conflictMessage: string,
  ): Promise<PurchaseOrder | null> {
    return withTransaction(this.pool, async (client) => {
      const header = await selectPurchaseOrderHeader(client, id, auth.branchId, true);
      if (!header) return null;
      if (header.status !== from) {
        throw new AppError(409, 'PO_STATUS_CONFLICT', `Purchase order ${header.po_number} is ${header.status}. ${conflictMessage}`);
      }
      const before = await loadPurchaseOrderDetail(client, header);
      const updated = await client.query<PurchaseOrderHeaderRow>(
        `UPDATE purchase_order po SET status = $2, status_reason = $3, updated_at = clock_timestamp()
         WHERE po.id = $1 RETURNING ${HEADER_COLUMNS}`,
        [id, to, reason],
      );
      const after = await loadPurchaseOrderDetail(client, updated.rows[0]!);
      await appendPurchaseOrderAudit(client, auth, action, before, after);
      return after;
    });
  }

  async list(query: PurchaseOrderListQuery, auth: AuthContext): Promise<PurchaseOrderSummary[]> {
    const result = await this.pool.query<Omit<PurchaseOrderSummary, 'created_at' | 'updated_at'> & { created_at: Date; updated_at: Date }>(
      `SELECT po.id, po.po_number, po.supplier_id, sm.name AS supplier_name, to_char(po.order_date, 'YYYY-MM-DD') AS order_date,
              po.status,
              (SELECT count(*) FROM purchase_order_line l WHERE l.purchase_order_id = po.id AND l.revision = po.revision)::int AS line_count,
              (SELECT count(*) FROM goods_receipt gr WHERE gr.purchase_order_id = po.id)::int AS receipt_count,
              po.created_at, po.updated_at
       FROM purchase_order po JOIN supplier_master sm ON sm.id = po.supplier_id
       WHERE po.branch_id = $1 AND ($2::text IS NULL OR po.status = $2)
       ORDER BY po.order_date DESC, po.created_at DESC`,
      [auth.branchId, query.status ?? null],
    );
    return result.rows.map(r => ({ ...r, created_at: r.created_at.toISOString(), updated_at: r.updated_at.toISOString() }));
  }

  async get(id: string, auth: AuthContext): Promise<PurchaseOrder | null> {
    // One snapshot for header, lines and receipts, so a concurrent receipt or
    // edit can never produce a mixed view.
    const client = await this.pool.connect();
    let rollbackFailed = false;
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const header = await selectPurchaseOrderHeader(client, id, auth.branchId, false);
      const order = header ? await loadPurchaseOrderDetail(client, header) : null;
      await client.query('COMMIT');
      return order;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        rollbackFailed = true;
        throw new AggregateError([error, rollbackError], 'Read and rollback failed');
      }
      throw error;
    } finally {
      client.release(rollbackFailed);
    }
  }
}
