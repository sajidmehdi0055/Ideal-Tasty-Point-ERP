import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AuthContext } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import type { StockTransferRepository } from '../application/stock-transfer-repository.js';
import type {
  StockTransfer, StockTransferInput, StockTransferLine, StockTransferListQuery, StockTransferReceiveInput, StockTransferSummary,
} from '../domain/stock-transfer.js';
import type { StockMovement } from '../domain/stock.js';
import { appendStockMovementAudit } from './stock-audit.js';
import { appendStockTransferAudit } from './stock-transfer-audit.js';
import { withTransaction } from './transaction.js';

type Queryable = Pool | PoolClient;
type HeaderRow = Omit<StockTransfer, 'created_at' | 'updated_at' | 'lines'> & { created_at: Date; updated_at: Date };
type SummaryRow = Omit<StockTransferSummary, 'created_at' | 'updated_at'> & { created_at: Date; updated_at: Date };
type MovementRow = Omit<StockMovement, 'created_at'> & { created_at: Date };

const HEADER_COLUMNS = `st.id, st.transfer_number, sl.branch_id, st.from_location_id, st.to_location_id,
  st.status, st.status_reason, st.created_at, st.updated_at`;

const statusConflict = (header: HeaderRow, action: string) => new AppError(409, 'TRANSFER_STATUS_CONFLICT',
  `Transfer ${header.transfer_number} is ${header.status} and cannot be ${action}`);

function isoHeader<T extends { created_at: Date; updated_at: Date }>(row: T) {
  return { ...row, created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString() };
}

const advisoryLock = (client: PoolClient, itemId: string, locationId: string) =>
  client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2::text, 0))", [itemId, locationId]);

/** Branch-scoped header (branch inherited from the source location); optionally row-locked. */
async function selectHeader(client: Queryable, id: string, branchId: string, lock: boolean): Promise<HeaderRow | null> {
  const result = await client.query<HeaderRow>(
    `SELECT ${HEADER_COLUMNS} FROM stock_transfer st JOIN stock_location sl ON sl.id = st.from_location_id
     WHERE st.id = $1 AND sl.branch_id = $2${lock ? ' FOR UPDATE OF st' : ''}`,
    [id, branchId],
  );
  return result.rows[0] ?? null;
}

async function loadLines(client: Queryable, transferId: string): Promise<StockTransferLine[]> {
  const result = await client.query<StockTransferLine>(
    `SELECT l.id, l.line_no, l.item_id, l.sent_quantity, l.out_movement_id,
            s.received_quantity, s.variance_quantity, s.variance_reason,
            CASE WHEN s.kind = 'RECEIVE' THEN s.movement_id END AS in_movement_id,
            CASE WHEN s.kind = 'CANCEL' THEN s.movement_id END AS return_movement_id
     FROM stock_transfer_line l LEFT JOIN stock_transfer_settlement s ON s.stock_transfer_line_id = l.id
     WHERE l.stock_transfer_id = $1 ORDER BY l.line_no`,
    [transferId],
  );
  return result.rows;
}

async function detail(client: Queryable, header: HeaderRow): Promise<StockTransfer> {
  return { ...isoHeader(header), lines: await loadLines(client, header.id) };
}

async function insertMovement(
  client: PoolClient, auth: AuthContext, itemId: string, locationId: string,
  type: 'TRANSFER_OUT' | 'TRANSFER_IN' | 'TRANSFER_RETURN', quantityDelta: string,
): Promise<StockMovement> {
  const result = await client.query<MovementRow>(
    `INSERT INTO stock_movement (id, item_id, location_id, movement_type, quantity_delta, reason)
     VALUES ($1, $2, $3, $4, $5::numeric, NULL)
     RETURNING id, item_id, location_id, movement_type, quantity_delta, reason, created_at`,
    [randomUUID(), itemId, locationId, type, quantityDelta],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Stock movement insert did not return a record');
  const movement: StockMovement = { ...row, created_at: row.created_at.toISOString() };
  await appendStockMovementAudit(client, auth, movement);
  return movement;
}

async function insertSettlement(
  client: PoolClient, lineId: string, kind: 'RECEIVE' | 'CANCEL', received: string | null,
  variance: string | null, reason: string | null, movementId: string | null,
): Promise<void> {
  await client.query(
    `INSERT INTO stock_transfer_settlement
       (id, stock_transfer_line_id, kind, received_quantity, variance_quantity, variance_reason, movement_id)
     VALUES ($1, $2, $3, $4::numeric, $5::numeric, $6, $7)`,
    [randomUUID(), lineId, kind, received, variance, reason, movementId],
  );
}

async function finish(client: PoolClient, id: string, status: 'RECEIVED' | 'CANCELLED', reason: string | null): Promise<void> {
  await client.query(
    'UPDATE stock_transfer SET status = $2, status_reason = $3, updated_at = clock_timestamp() WHERE id = $1',
    [id, status, reason],
  );
}

export class PgStockTransferRepository implements StockTransferRepository {
  constructor(private readonly pool: Pool) {}

  async send(input: StockTransferInput, auth: AuthContext): Promise<StockTransfer | null> {
    return withTransaction(this.pool, async (client) => {
      // 1. Branch ownership first (404 before any other signal, nothing leaked).
      // FOR SHARE: neither location can be deactivated while this send is in flight.
      const locations = await client.query<{ id: string; branch_id: string; active: boolean }>(
        'SELECT id, branch_id, active FROM stock_location WHERE id = ANY($1::uuid[]) ORDER BY id FOR SHARE',
        [[input.from_location_id, input.to_location_id]],
      );
      const locationById = new Map(locations.rows.map(r => [r.id, r]));
      const from = locationById.get(input.from_location_id);
      const to = locationById.get(input.to_location_id);
      if (!from || !to || from.branch_id !== auth.branchId || to.branch_id !== auth.branchId) return null;
      const itemIds = [...new Set(input.lines.map(l => l.item_id))].sort();
      const items = await client.query<{ id: string; branch_id: string; active: boolean }>(
        'SELECT id, branch_id, active FROM item_master WHERE id = ANY($1::uuid[])', [itemIds],
      );
      const itemById = new Map(items.rows.map(r => [r.id, r]));
      if (itemIds.some(id => itemById.get(id)?.branch_id !== auth.branchId)) return null;

      // 2. Status checks (ADR-0011 A-02).
      if (!from.active) throw new AppError(409, 'LOCATION_INACTIVE', 'Stock cannot be sent from an inactive location');
      if (!to.active) throw new AppError(409, 'LOCATION_INACTIVE', 'Stock cannot be sent to an inactive location');
      input.lines.forEach((line, i) => {
        if (!itemById.get(line.item_id)?.active) throw new AppError(409, 'ITEM_INACTIVE', `lines[${i}]: item is inactive`);
      });

      // 3. Serialise with every other writer of these item+source pairs (same
      // advisory lock as S-04/S-05 and the ledger trigger), in a fixed order,
      // then check the source balance in PostgreSQL NUMERIC.
      for (const itemId of itemIds) await advisoryLock(client, itemId, input.from_location_id);
      const balances = await client.query<{ ok: boolean; available: string }>(
        `SELECT COALESCE(b.balance, 0) >= t.q::numeric AS ok, COALESCE(b.balance, 0)::text AS available
         FROM unnest($2::uuid[], $3::text[]) WITH ORDINALITY AS t(item_id, q, n)
         LEFT JOIN (SELECT item_id, sum(quantity_delta) AS balance FROM stock_movement
                    WHERE location_id = $1 GROUP BY item_id) b ON b.item_id = t.item_id
         ORDER BY t.n`,
        [input.from_location_id, input.lines.map(l => l.item_id), input.lines.map(l => l.quantity)],
      );
      balances.rows.forEach((row, i) => {
        if (!row.ok) {
          throw new AppError(409, 'INSUFFICIENT_STOCK', `lines[${i}]: only ${row.available} available at the source location`);
        }
      });

      // 4. Header, then per line: TRANSFER_OUT movement (audited) + line.
      const inserted = await client.query<{ id: string }>(
        'INSERT INTO stock_transfer (id, from_location_id, to_location_id) VALUES ($1, $2, $3) RETURNING id',
        [randomUUID(), input.from_location_id, input.to_location_id],
      );
      const transferId = inserted.rows[0]!.id;
      for (const [i, line] of input.lines.entries()) {
        const movement = await insertMovement(client, auth, line.item_id, input.from_location_id, 'TRANSFER_OUT', `-${line.quantity}`);
        await client.query(
          `INSERT INTO stock_transfer_line (id, stock_transfer_id, line_no, item_id, sent_quantity, out_movement_id)
           VALUES ($1, $2, $3, $4, $5::numeric, $6)`,
          [randomUUID(), transferId, i + 1, line.item_id, line.quantity, movement.id],
        );
      }
      const header = await selectHeader(client, transferId, auth.branchId, false);
      const transfer = await detail(client, header!);
      await appendStockTransferAudit(client, auth, 'CREATE', null, transfer);
      return transfer;
    });
  }

  async receive(id: string, input: StockTransferReceiveInput, auth: AuthContext): Promise<StockTransfer | null> {
    return withTransaction(this.pool, async (client) => {
      // Row lock first: a concurrent receive/cancel of this transfer waits here.
      const header = await selectHeader(client, id, auth.branchId, true);
      if (!header) return null;
      if (header.status !== 'SENT') throw statusConflict(header, 'received');
      const before = await detail(client, header);

      const inputById = new Map(input.lines.map(l => [l.line_id, l]));
      if (input.lines.length !== before.lines.length || before.lines.some(l => !inputById.has(l.id))) {
        throw new AppError(400, 'RECEIVE_LINES_MISMATCH', 'lines must list every line of the transfer exactly once');
      }
      const ordered = before.lines.map(l => ({ line: l, entry: inputById.get(l.id)! }));
      const quantities = await client.query<{ exceeds: boolean; variance: string; has_variance: boolean; positive: boolean }>(
        `SELECT r::numeric > s::numeric AS exceeds, (s::numeric - r::numeric)::text AS variance,
                s::numeric - r::numeric > 0 AS has_variance, r::numeric > 0 AS positive
         FROM unnest($1::text[], $2::text[]) WITH ORDINALITY AS t(r, s, n) ORDER BY n`,
        [ordered.map(o => o.entry.received_quantity), ordered.map(o => o.line.sent_quantity)],
      );
      ordered.forEach(({ line, entry }, i) => {
        const q = quantities.rows[i]!;
        const ref = `line ${line.line_no}`;
        if (q.exceeds) throw new AppError(400, 'RECEIVED_EXCEEDS_SENT', `${ref}: received_quantity cannot be more than the sent quantity (${line.sent_quantity})`);
        if (q.has_variance && entry.variance_reason === undefined) {
          throw new AppError(400, 'VARIANCE_REASON_REQUIRED', `${ref}: variance_reason is required when less than the sent quantity is received`);
        }
        if (!q.has_variance && entry.variance_reason !== undefined) {
          throw new AppError(400, 'VARIANCE_REASON_NOT_ALLOWED', `${ref}: variance_reason is only allowed when less than the sent quantity is received`);
        }
      });

      await client.query('SELECT 1 FROM stock_location WHERE id = $1 FOR SHARE', [header.to_location_id]);
      const sorted = [...ordered].sort((a, b) => (a.line.item_id < b.line.item_id ? -1 : 1));
      for (const { line } of sorted) await advisoryLock(client, line.item_id, header.to_location_id);
      for (const [i, { line, entry }] of ordered.entries()) {
        const q = quantities.rows[i]!;
        const movement = q.positive
          ? await insertMovement(client, auth, line.item_id, header.to_location_id, 'TRANSFER_IN', entry.received_quantity)
          : null;
        await insertSettlement(client, line.id, 'RECEIVE', entry.received_quantity, q.variance,
          q.has_variance ? entry.variance_reason! : null, movement?.id ?? null);
      }
      await finish(client, id, 'RECEIVED', null);
      const after = await detail(client, (await selectHeader(client, id, auth.branchId, false))!);
      await appendStockTransferAudit(client, auth, 'RECEIVE', before, after);
      return after;
    });
  }

  async cancel(id: string, reason: string, auth: AuthContext): Promise<StockTransfer | null> {
    return withTransaction(this.pool, async (client) => {
      const header = await selectHeader(client, id, auth.branchId, true);
      if (!header) return null;
      if (header.status !== 'SENT') throw statusConflict(header, 'cancelled');
      const before = await detail(client, header);
      await client.query('SELECT 1 FROM stock_location WHERE id = $1 FOR SHARE', [header.from_location_id]);
      for (const itemId of before.lines.map(l => l.item_id).sort()) await advisoryLock(client, itemId, header.from_location_id);
      for (const line of before.lines) {
        const movement = await insertMovement(client, auth, line.item_id, header.from_location_id, 'TRANSFER_RETURN', line.sent_quantity);
        await insertSettlement(client, line.id, 'CANCEL', null, null, null, movement.id);
      }
      await finish(client, id, 'CANCELLED', reason);
      const after = await detail(client, (await selectHeader(client, id, auth.branchId, false))!);
      await appendStockTransferAudit(client, auth, 'CANCEL', before, after);
      return after;
    });
  }

  async list(query: StockTransferListQuery, auth: AuthContext): Promise<StockTransferSummary[]> {
    const result = await this.pool.query<SummaryRow>(
      `SELECT st.id, st.transfer_number, st.from_location_id, sl.name AS from_location_name,
              st.to_location_id, tl.name AS to_location_name, st.status,
              (SELECT count(*) FROM stock_transfer_line l WHERE l.stock_transfer_id = st.id)::int AS line_count,
              st.created_at, st.updated_at
       FROM stock_transfer st
       JOIN stock_location sl ON sl.id = st.from_location_id
       JOIN stock_location tl ON tl.id = st.to_location_id
       WHERE sl.branch_id = $1 AND tl.branch_id = $1 AND ($2::text IS NULL OR st.status = $2)
       ORDER BY st.created_at DESC, st.id`,
      [auth.branchId, query.status ?? null],
    );
    return result.rows.map(r => isoHeader(r));
  }

  async get(id: string, auth: AuthContext): Promise<StockTransfer | null> {
    const header = await selectHeader(this.pool, id, auth.branchId, false);
    return header ? detail(this.pool, header) : null;
  }
}
