import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AuthContext } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import type { StockLocationRepository } from '../application/stock-location-repository.js';
import type { StockLocation, StockLocationInput, StockLocationPatch } from '../domain/stock-location.js';
import { appendStockLocationAudit } from './stock-audit.js';
import { withTransaction } from './transaction.js';

const LOCATION_COLUMNS = 'id, branch_id, name, location_type, parent_id, active, created_at, updated_at';
const UNIQUE_VIOLATION = '23505';

type LocationRow = Omit<StockLocation, 'created_at' | 'updated_at'> & { created_at: Date; updated_at: Date };

function toLocation(row: LocationRow): StockLocation {
  return { ...row, created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString() };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;
}

const duplicateName = () => new AppError(409, 'DUPLICATE_LOCATION_NAME', 'A stock location with this name already exists in this branch');

export class PgStockLocationRepository implements StockLocationRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: StockLocationInput, auth: AuthContext): Promise<StockLocation> {
    try {
      return await withTransaction(this.pool, async (client) => {
        if (input.parent_id !== undefined) {
          // FOR SHARE blocks a concurrent deactivation of the parent until this commits.
          const parent = await client.query<{ branch_id: string; location_type: string; active: boolean }>(
            'SELECT branch_id, location_type, active FROM stock_location WHERE id = $1 FOR SHARE',
            [input.parent_id],
          );
          const row = parent.rows[0];
          if (!row || row.branch_id !== auth.branchId || row.location_type === 'FREEZER' || !row.active) {
            throw new AppError(400, 'INVALID_PARENT', 'parent_id must be an active STORE or KITCHEN location in this branch');
          }
        }
        const result = await client.query<LocationRow>(
          `INSERT INTO stock_location (id, branch_id, name, location_type, parent_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING ${LOCATION_COLUMNS}`,
          [randomUUID(), auth.branchId, input.name, input.location_type, input.parent_id ?? null],
        );
        const row = result.rows[0];
        if (!row) throw new Error('Stock location insert did not return a record');
        const location = toLocation(row);
        await appendStockLocationAudit(client, auth, 'CREATE', null, location);
        return location;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicateName();
      throw error;
    }
  }

  async update(id: string, patch: StockLocationPatch, auth: AuthContext): Promise<StockLocation | null> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const existing = await client.query<LocationRow>(
          `SELECT ${LOCATION_COLUMNS} FROM stock_location WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
          [id, auth.branchId],
        );
        const row = existing.rows[0];
        if (!row) return null;
        const before = toLocation(row);

        if (patch.active === false && before.active) {
          // The row lock above conflicts with the FOR SHARE taken by opening/
          // adjustment writes and child creation, so these checks cannot race.
          const stock = await client.query(
            `SELECT 1 FROM stock_movement WHERE location_id = $1
             GROUP BY item_id HAVING sum(quantity_delta) <> 0 LIMIT 1`,
            [id],
          );
          if (stock.rowCount) throw new AppError(409, 'LOCATION_HAS_STOCK', 'A location that still holds stock cannot be deactivated');
          const children = await client.query('SELECT 1 FROM stock_location WHERE parent_id = $1 AND active LIMIT 1', [id]);
          if (children.rowCount) {
            throw new AppError(409, 'LOCATION_HAS_ACTIVE_CHILDREN', 'Deactivate the freezer locations under this location first');
          }
        }
        if (patch.active === true && !before.active && before.parent_id !== null) {
          const parent = await client.query<{ active: boolean }>(
            'SELECT active FROM stock_location WHERE id = $1 FOR SHARE', [before.parent_id],
          );
          if (!parent.rows[0]?.active) throw new AppError(409, 'PARENT_INACTIVE', 'Reactivate the parent location first');
        }

        const result = await client.query<LocationRow>(
          `UPDATE stock_location SET name = $2, active = $3, updated_at = clock_timestamp()
           WHERE id = $1 RETURNING ${LOCATION_COLUMNS}`,
          [id, patch.name ?? before.name, patch.active ?? before.active],
        );
        const updated = result.rows[0];
        if (!updated) throw new Error('Locked stock location update did not return a record');
        const after = toLocation(updated);
        await appendStockLocationAudit(client, auth, 'UPDATE', before, after);
        return after;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw duplicateName();
      throw error;
    }
  }

  async list(auth: AuthContext): Promise<StockLocation[]> {
    const result = await this.pool.query<LocationRow>(
      `SELECT ${LOCATION_COLUMNS} FROM stock_location WHERE branch_id = $1 ORDER BY name`,
      [auth.branchId],
    );
    return result.rows.map(toLocation);
  }
}
