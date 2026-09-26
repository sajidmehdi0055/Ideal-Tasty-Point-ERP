import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AuthContext } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import type { StockRepository } from '../application/stock-repository.js';
import type {
  OpeningStockInput, StockAdjustmentInput, StockBalance, StockMovement, StockQuery,
} from '../domain/stock.js';
import { appendStockMovementAudit } from './stock-audit.js';
import { withTransaction } from './transaction.js';

const MOVEMENT_COLUMNS = 'id, item_id, location_id, movement_type, quantity_delta, reason, created_at';
const UNIQUE_VIOLATION = '23505';

type MovementRow = Omit<StockMovement, 'created_at'> & { created_at: Date };

function toMovement(row: MovementRow): StockMovement {
  return { ...row, created_at: row.created_at.toISOString() };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;
}

const openingExists = () => new AppError(409, 'OPENING_ALREADY_EXISTS',
  'Opening stock already exists for this item and location; use an adjustment to correct it');

/**
 * Validates branch ownership and active status of the item and location,
 * then takes the same per item+location advisory lock the database trigger
 * uses, so every check below runs serialised against concurrent writers.
 * Returns false when either reference is missing or in another branch.
 */
async function lockPair(client: PoolClient, itemId: string, locationId: string, auth: AuthContext): Promise<boolean> {
  const item = await client.query<{ branch_id: string; active: boolean }>(
    'SELECT branch_id, active FROM item_master WHERE id = $1', [itemId],
  );
  const itemRow = item.rows[0];
  if (!itemRow || itemRow.branch_id !== auth.branchId) return false;
  // FOR SHARE: a location cannot be deactivated while a movement into it is in flight.
  const location = await client.query<{ branch_id: string; active: boolean }>(
    'SELECT branch_id, active FROM stock_location WHERE id = $1 FOR SHARE', [locationId],
  );
  const locationRow = location.rows[0];
  if (!locationRow || locationRow.branch_id !== auth.branchId) return false;
  if (!itemRow.active) throw new AppError(409, 'ITEM_INACTIVE', 'Stock cannot be recorded for an inactive item');
  if (!locationRow.active) throw new AppError(409, 'LOCATION_INACTIVE', 'Stock cannot be recorded in an inactive location');
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text || ':' || $2::text, 0))", [itemId, locationId]);
  return true;
}

async function insertMovement(
  client: PoolClient, auth: AuthContext, itemId: string, locationId: string,
  type: 'OPENING' | 'ADJUSTMENT', quantityDelta: string, reason: string | null,
): Promise<StockMovement> {
  const result = await client.query<MovementRow>(
    `INSERT INTO stock_movement (id, item_id, location_id, movement_type, quantity_delta, reason)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${MOVEMENT_COLUMNS}`,
    [randomUUID(), itemId, locationId, type, quantityDelta, reason],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Stock movement insert did not return a record');
  const movement = toMovement(row);
  await appendStockMovementAudit(client, auth, movement);
  return movement;
}

async function hasOpening(client: PoolClient, itemId: string, locationId: string): Promise<boolean> {
  const result = await client.query(
    "SELECT 1 FROM stock_movement WHERE item_id = $1 AND location_id = $2 AND movement_type = 'OPENING'",
    [itemId, locationId],
  );
  return (result.rowCount ?? 0) > 0;
}

export class PgStockRepository implements StockRepository {
  constructor(private readonly pool: Pool) {}

  async createOpening(input: OpeningStockInput, auth: AuthContext): Promise<StockMovement | null> {
    try {
      return await withTransaction(this.pool, async (client) => {
        if (!await lockPair(client, input.item_id, input.location_id, auth)) return null;
        if (await hasOpening(client, input.item_id, input.location_id)) throw openingExists();
        return insertMovement(client, auth, input.item_id, input.location_id, 'OPENING', input.quantity, null);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw openingExists();
      throw error;
    }
  }

  async createAdjustment(input: StockAdjustmentInput, auth: AuthContext): Promise<StockMovement | null> {
    return withTransaction(this.pool, async (client) => {
      if (!await lockPair(client, input.item_id, input.location_id, auth)) return null;
      if (!await hasOpening(client, input.item_id, input.location_id)) {
        throw new AppError(409, 'OPENING_REQUIRED', 'Record opening stock for this item and location before adjusting it');
      }
      // NUMERIC arithmetic in PostgreSQL, never JS floats.
      const check = await client.query<{ negative: boolean }>(
        `SELECT (COALESCE(sum(quantity_delta), 0) + $3::numeric) < 0 AS negative
         FROM stock_movement WHERE item_id = $1 AND location_id = $2`,
        [input.item_id, input.location_id, input.quantity_delta],
      );
      if (check.rows[0]?.negative) {
        throw new AppError(409, 'NEGATIVE_BALANCE', 'This adjustment would make the stock balance negative');
      }
      return insertMovement(client, auth, input.item_id, input.location_id, 'ADJUSTMENT', input.quantity_delta, input.reason);
    });
  }

  async listBalances(query: StockQuery, auth: AuthContext): Promise<StockBalance[]> {
    const result = await this.pool.query<StockBalance>(
      `SELECT sm.item_id, im.item_code, im.item_name, um.name AS base_uom,
              sm.location_id, sl.name AS location_name, sum(sm.quantity_delta)::text AS quantity
       FROM stock_movement sm
       JOIN stock_location sl ON sl.id = sm.location_id
       JOIN item_master im ON im.id = sm.item_id
       JOIN uom_master um ON um.id = im.base_uom_id
       WHERE sl.branch_id = $1 AND im.branch_id = $1
         AND ($2::uuid IS NULL OR sm.item_id = $2) AND ($3::uuid IS NULL OR sm.location_id = $3)
       GROUP BY sm.item_id, im.item_code, im.item_name, um.name, sm.location_id, sl.name
       ORDER BY sl.name, im.item_name`,
      [auth.branchId, query.item_id ?? null, query.location_id ?? null],
    );
    return result.rows;
  }

  async listMovements(query: StockQuery, auth: AuthContext): Promise<StockMovement[]> {
    const result = await this.pool.query<MovementRow>(
      `SELECT sm.id, sm.item_id, sm.location_id, sm.movement_type, sm.quantity_delta, sm.reason, sm.created_at
       FROM stock_movement sm JOIN stock_location sl ON sl.id = sm.location_id
       WHERE sl.branch_id = $1
         AND ($2::uuid IS NULL OR sm.item_id = $2) AND ($3::uuid IS NULL OR sm.location_id = $3)
       ORDER BY sm.created_at DESC, sm.id`,
      [auth.branchId, query.item_id ?? null, query.location_id ?? null],
    );
    return result.rows.map(toMovement);
  }
}
