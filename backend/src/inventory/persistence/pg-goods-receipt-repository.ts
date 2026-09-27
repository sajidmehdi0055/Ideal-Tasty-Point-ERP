import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AuthContext } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import type { GoodsReceiptRepository } from '../application/goods-receipt-repository.js';
import type { GoodsReceipt, GoodsReceiptInput, GoodsReceiptLine, GoodsReceiptSummary } from '../domain/goods-receipt.js';
import type { PurchaseRecord } from '../domain/purchase-record.js';
import type { StockMovement } from '../domain/stock.js';
import { appendGoodsReceiptAudit } from './goods-receipt-audit.js';
import { appendPurchaseRecordAudit } from './purchase-record-audit.js';
import { appendStockMovementAudit } from './stock-audit.js';
import { withTransaction } from './transaction.js';
import {
  loadPurchaseOrderDetail, refreshPurchaseOrderAfterReceipt, selectPurchaseOrderHeader,
} from './pg-purchase-order-repository.js';
import type { PurchaseOrder } from '../domain/purchase-order.js';

/**
 * Business date for "not in the future" and "not before opening stock"
 * (ADR-0009 A-01): the restaurant operates in Pakistan, so a receipt entered
 * at 01:00 local time must count as that local day, not the previous UTC day.
 */
const BUSINESS_TIME_ZONE = 'Asia/Karachi';

const HEADER_COLUMNS = `gr.id, gr.supplier_id, gr.location_id, to_char(gr.receipt_date, 'YYYY-MM-DD') AS receipt_date, gr.supplier_bill_no, gr.purchase_order_id, gr.created_at`;
const LINE_COLUMNS = 'id, line_no, item_id, brand_id, pack_variant_id, pack_quantity, conversion_factor, base_quantity, rate, purchase_record_id, stock_movement_id, purchase_order_line_id';

type HeaderRow = Omit<GoodsReceipt, 'created_at' | 'lines'> & { created_at: Date };
type SummaryRow = Omit<GoodsReceiptSummary, 'created_at'> & { created_at: Date };
type TimestampRow<T> = Omit<T, 'created_at'> & { created_at: Date };

function iso<T extends { created_at: Date }>(row: T): Omit<T, 'created_at'> & { created_at: string } {
  return { ...row, created_at: row.created_at.toISOString() };
}

async function loadLines(client: Pool | PoolClient, receiptId: string): Promise<GoodsReceiptLine[]> {
  const result = await client.query<GoodsReceiptLine>(
    `SELECT ${LINE_COLUMNS} FROM goods_receipt_line WHERE goods_receipt_id = $1 ORDER BY line_no`, [receiptId],
  );
  return result.rows;
}

export class PgGoodsReceiptRepository implements GoodsReceiptRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: GoodsReceiptInput, auth: AuthContext): Promise<GoodsReceipt | null> {
    return withTransaction(this.pool, async (client) => {
      // 1. Branch ownership first (404 before any other signal, nothing leaked).
      const location = await client.query<{ branch_id: string; active: boolean }>(
        'SELECT branch_id, active FROM stock_location WHERE id = $1 FOR SHARE', [input.location_id],
      );
      const locationRow = location.rows[0];
      if (!locationRow || locationRow.branch_id !== auth.branchId) return null;
      const itemIds = [...new Set(input.lines.map(l => l.item_id))].sort();
      const items = await client.query<{ id: string; branch_id: string; active: boolean }>(
        'SELECT id, branch_id, active FROM item_master WHERE id = ANY($1::uuid[])', [itemIds],
      );
      const itemById = new Map(items.rows.map(r => [r.id, r]));
      if (itemIds.some(id => itemById.get(id)?.branch_id !== auth.branchId)) return null;

      // 1b. Optional Purchase Order link (ADR-0010 O-02). The PO row lock
      // serialises this receipt with other receipts, edits, cancel and close.
      const po = input.purchase_order_id === undefined
        ? null
        : await selectPurchaseOrderHeader(client, input.purchase_order_id, auth.branchId, true);
      let poBefore: PurchaseOrder | null = null;
      if (input.purchase_order_id !== undefined) {
        if (!po) throw new AppError(404, 'PURCHASE_ORDER_NOT_FOUND', 'Purchase order not found');
        if (po.status !== 'ISSUED' && po.status !== 'PARTIALLY_RECEIVED') {
          throw new AppError(409, 'PO_NOT_OPEN', `Purchase order ${po.po_number} is ${po.status} and cannot receive goods`);
        }
        if (po.supplier_id !== input.supplier_id) {
          throw new AppError(400, 'PO_SUPPLIER_MISMATCH', 'supplier_id must be the supplier of the purchase order');
        }
        poBefore = await loadPurchaseOrderDetail(client, po);
        const poLineById = new Map(poBefore.lines.map(l => [l.id, l]));
        input.lines.forEach((line, i) => {
          const poLine = line.purchase_order_line_id === undefined ? undefined : poLineById.get(line.purchase_order_line_id);
          if (!poLine || poLine.item_id !== line.item_id || poLine.brand_id !== line.brand_id || poLine.pack_variant_id !== line.pack_variant_id) {
            throw new AppError(400, 'PO_LINE_MISMATCH',
              `lines[${i}]: purchase_order_line_id must be a current line of this purchase order with the same item, brand and pack variant`);
          }
        });
      }

      // 2. Reference and status checks.
      if (!locationRow.active) throw new AppError(409, 'LOCATION_INACTIVE', 'Stock cannot be received into an inactive location');
      input.lines.forEach((line, i) => {
        if (!itemById.get(line.item_id)?.active) throw new AppError(409, 'ITEM_INACTIVE', `lines[${i}]: item is inactive`);
      });
      const supplier = await client.query<{ active: boolean }>('SELECT active FROM supplier_master WHERE id = $1 FOR SHARE', [input.supplier_id]);
      if (!supplier.rows[0]) throw new AppError(400, 'INVALID_REFERENCE', 'supplier_id does not reference an existing supplier');
      if (!supplier.rows[0].active) throw new AppError(409, 'SUPPLIER_INACTIVE', 'Goods cannot be received from an inactive supplier');
      const packIds = [...new Set(input.lines.map(l => l.pack_variant_id))];
      const packs = await client.query<{ id: string; item_id: string; brand_id: string; conversion_factor: string; active: boolean }>(
        'SELECT id, item_id, brand_id, conversion_factor, active FROM pack_variant WHERE id = ANY($1::uuid[]) FOR SHARE', [packIds],
      );
      const packById = new Map(packs.rows.map(r => [r.id, r]));
      const factors = input.lines.map((line, i) => {
        const pack = packById.get(line.pack_variant_id);
        if (!pack || pack.item_id !== line.item_id || pack.brand_id !== line.brand_id) {
          throw new AppError(400, 'INVALID_REFERENCE', `lines[${i}]: pack_variant_id does not belong to the given item_id/brand_id combination`);
        }
        if (!pack.active) throw new AppError(409, 'PACK_VARIANT_INACTIVE', `lines[${i}]: pack variant is inactive`);
        return pack.conversion_factor;
      });

      // 3. Receipt date: not after today's business date.
      const dateCheck = await client.query<{ future: boolean }>(
        `SELECT $1::date > (now() AT TIME ZONE '${BUSINESS_TIME_ZONE}')::date AS future`, [input.receipt_date],
      );
      if (dateCheck.rows[0]?.future) throw new AppError(400, 'INVALID_RECEIPT_DATE', 'receipt_date cannot be in the future');
      if (po && input.receipt_date < po.order_date) {
        throw new AppError(409, 'RECEIPT_BEFORE_ORDER', `receipt_date is before the purchase order date (${po.order_date})`);
      }

      // 4. Base quantities, NUMERIC arithmetic in PostgreSQL (never JS floats).
      const quantities = await client.query<{ base: string; positive: boolean; fits: boolean }>(
        `SELECT round(p::numeric * c::numeric, 6)::text AS base,
                round(p::numeric * c::numeric, 6) > 0 AS positive,
                round(p::numeric * c::numeric, 6) < 1000000000000 AS fits
         FROM unnest($1::text[], $2::text[]) WITH ORDINALITY AS t(p, c, n) ORDER BY n`,
        [input.lines.map(l => l.pack_quantity), factors],
      );
      quantities.rows.forEach((q, i) => {
        if (!q.positive || !q.fits) throw new AppError(400, 'INVALID_QUANTITY', `lines[${i}]: base quantity must be greater than 0 and below 1,000,000,000,000`);
      });

      // 5. Serialise against every other writer of these item+location pairs
      // (same advisory lock as S-04 and the ledger trigger), in a fixed order.
      for (const itemId of itemIds) {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2::text, 0))", [itemId, input.location_id]);
      }
      const openings = await client.query<{ item_id: string; opening_date: string }>(
        `SELECT item_id, to_char((created_at AT TIME ZONE '${BUSINESS_TIME_ZONE}')::date, 'YYYY-MM-DD') AS opening_date
         FROM stock_movement WHERE location_id = $1 AND item_id = ANY($2::uuid[]) AND movement_type = 'OPENING'`,
        [input.location_id, itemIds],
      );
      for (const opening of openings.rows) {
        if (input.receipt_date < opening.opening_date) {
          throw new AppError(409, 'RECEIPT_BEFORE_OPENING', `receipt_date is before the opening stock date (${opening.opening_date}) for item ${opening.item_id}`);
        }
      }

      // 6. Write header, then per line: purchase record + stock movement + line, each audited.
      const header = await client.query<HeaderRow>(
        `INSERT INTO goods_receipt AS gr (id, supplier_id, location_id, receipt_date, supplier_bill_no, purchase_order_id)
         VALUES ($1, $2, $3, $4::date, $5, $6) RETURNING ${HEADER_COLUMNS}`,
        [randomUUID(), input.supplier_id, input.location_id, input.receipt_date, input.supplier_bill_no ?? null, input.purchase_order_id ?? null],
      );
      const headerRow = header.rows[0];
      if (!headerRow) throw new Error('Goods receipt insert did not return a record');
      const lines: GoodsReceiptLine[] = [];
      for (const [i, line] of input.lines.entries()) {
        const pr = await client.query<TimestampRow<PurchaseRecord>>(
          `INSERT INTO purchase_record (id, supplier_id, item_id, brand_id, pack_variant_id, quantity, rate, purchase_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date)
           RETURNING id, supplier_id, item_id, brand_id, pack_variant_id, quantity, rate, to_char(purchase_date, 'YYYY-MM-DD') AS purchase_date, created_at`,
          [randomUUID(), input.supplier_id, line.item_id, line.brand_id, line.pack_variant_id, line.pack_quantity, line.rate, input.receipt_date],
        );
        const purchaseRecord = iso(pr.rows[0]!) as PurchaseRecord;
        await appendPurchaseRecordAudit(client, auth, purchaseRecord);
        const mv = await client.query<TimestampRow<StockMovement>>(
          `INSERT INTO stock_movement (id, item_id, location_id, movement_type, quantity_delta, reason)
           VALUES ($1, $2, $3, 'RECEIPT', $4, NULL)
           RETURNING id, item_id, location_id, movement_type, quantity_delta, reason, created_at`,
          [randomUUID(), line.item_id, input.location_id, quantities.rows[i]!.base],
        );
        const movement = iso(mv.rows[0]!) as StockMovement;
        await appendStockMovementAudit(client, auth, movement);
        const saved = await client.query<GoodsReceiptLine>(
          `INSERT INTO goods_receipt_line (id, goods_receipt_id, line_no, item_id, brand_id, pack_variant_id,
             pack_quantity, conversion_factor, base_quantity, rate, purchase_record_id, stock_movement_id, purchase_order_line_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING ${LINE_COLUMNS}`,
          [randomUUID(), headerRow.id, i + 1, line.item_id, line.brand_id, line.pack_variant_id,
            line.pack_quantity, factors[i], quantities.rows[i]!.base, line.rate, purchaseRecord.id, movement.id,
            line.purchase_order_line_id ?? null],
        );
        lines.push(saved.rows[0]!);
      }
      const receipt: GoodsReceipt = { ...iso(headerRow), lines };
      if (po && poBefore) await refreshPurchaseOrderAfterReceipt(client, po, poBefore, receipt.id, auth);
      await appendGoodsReceiptAudit(client, auth, receipt);
      return receipt;
    });
  }

  async list(auth: AuthContext): Promise<GoodsReceiptSummary[]> {
    const result = await this.pool.query<SummaryRow>(
      `SELECT ${HEADER_COLUMNS}, sm.name AS supplier_name, sl.name AS location_name, po.po_number,
              (SELECT count(*) FROM goods_receipt_line l WHERE l.goods_receipt_id = gr.id)::int AS line_count
       FROM goods_receipt gr
       JOIN stock_location sl ON sl.id = gr.location_id
       JOIN supplier_master sm ON sm.id = gr.supplier_id
       LEFT JOIN purchase_order po ON po.id = gr.purchase_order_id
       WHERE sl.branch_id = $1
       ORDER BY gr.receipt_date DESC, gr.created_at DESC`,
      [auth.branchId],
    );
    return result.rows.map(r => iso(r));
  }

  async get(id: string, auth: AuthContext): Promise<GoodsReceipt | null> {
    const result = await this.pool.query<HeaderRow>(
      `SELECT ${HEADER_COLUMNS} FROM goods_receipt gr JOIN stock_location sl ON sl.id = gr.location_id
       WHERE gr.id = $1 AND sl.branch_id = $2`,
      [id, auth.branchId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return { ...iso(row), lines: await loadLines(this.pool, row.id) };
  }
}
