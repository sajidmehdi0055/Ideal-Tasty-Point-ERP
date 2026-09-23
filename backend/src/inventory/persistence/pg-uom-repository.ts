import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AuthContext } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import type { UomRepository } from '../application/uom-repository.js';
import type { Uom, UomInput, UomPatch } from '../domain/uom.js';
import { withTransaction } from './transaction.js';
import { appendUomAudit } from './uom-audit.js';

const UOM_COLUMNS = 'id, name, unit_type, active, created_at, updated_at';
const UNIQUE_VIOLATION = '23505';

type UomRow = Omit<Uom, 'created_at' | 'updated_at'> & { created_at: Date; updated_at: Date };

function toUom(row: UomRow): Uom {
  return { ...row, created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString() };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;
}

export class PgUomRepository implements UomRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: UomInput, auth: AuthContext): Promise<Uom> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const result = await client.query<UomRow>(
          `INSERT INTO uom_master (id, name, unit_type) VALUES ($1, $2, $3) RETURNING ${UOM_COLUMNS}`,
          [randomUUID(), input.name, input.unit_type],
        );
        const row = result.rows[0];
        if (!row) throw new Error('UOM insert did not return a record');
        const uom = toUom(row);
        await appendUomAudit(client, auth, 'CREATE', null, uom);
        return uom;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError(409, 'DUPLICATE_UOM_NAME', 'A UOM with this name already exists');
      throw error;
    }
  }

  async update(id: string, input: UomPatch, auth: AuthContext): Promise<Uom | null> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const existing = await client.query<UomRow>(
          `SELECT ${UOM_COLUMNS} FROM uom_master WHERE id = $1 FOR UPDATE`,
          [id],
        );
        const row = existing.rows[0];
        if (!row) return null;
        const before = toUom(row);
        const result = await client.query<UomRow>(
          `UPDATE uom_master SET name = $2, unit_type = $3, active = $4, updated_at = clock_timestamp()
           WHERE id = $1 RETURNING ${UOM_COLUMNS}`,
          [id, input.name ?? before.name, input.unit_type ?? before.unit_type, input.active ?? before.active],
        );
        const updated = result.rows[0];
        if (!updated) throw new Error('Locked UOM update did not return a record');
        const after = toUom(updated);
        await appendUomAudit(client, auth, 'UPDATE', before, after);
        return after;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError(409, 'DUPLICATE_UOM_NAME', 'A UOM with this name already exists');
      throw error;
    }
  }

  async list(): Promise<Uom[]> {
    const result = await this.pool.query<UomRow>(`SELECT ${UOM_COLUMNS} FROM uom_master ORDER BY name`);
    return result.rows.map(toUom);
  }

  async findActiveByName(name: string): Promise<Uom | null> {
    const result = await this.pool.query<UomRow>(
      `SELECT ${UOM_COLUMNS} FROM uom_master WHERE lower(btrim(name)) = lower(btrim($1)) AND active = true`,
      [name],
    );
    return result.rows[0] ? toUom(result.rows[0]) : null;
  }
}
