import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AuthContext } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import type { BrandRepository } from '../application/brand-repository.js';
import type { Brand, BrandInput, BrandPatch } from '../domain/brand.js';
import { appendBrandAudit } from './brand-audit.js';
import { withTransaction } from './transaction.js';

const BRAND_COLUMNS = 'id, name, active, created_at, updated_at';
const UNIQUE_VIOLATION = '23505';

type BrandRow = Omit<Brand, 'created_at' | 'updated_at'> & { created_at: Date; updated_at: Date };

function toBrand(row: BrandRow): Brand {
  return { ...row, created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString() };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;
}

export class PgBrandRepository implements BrandRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: BrandInput, auth: AuthContext): Promise<Brand> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const result = await client.query<BrandRow>(
          `INSERT INTO brand_master (id, name) VALUES ($1, $2) RETURNING ${BRAND_COLUMNS}`,
          [randomUUID(), input.name],
        );
        const row = result.rows[0];
        if (!row) throw new Error('Brand insert did not return a record');
        const brand = toBrand(row);
        await appendBrandAudit(client, auth, 'CREATE', null, brand);
        return brand;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError(409, 'DUPLICATE_BRAND_NAME', 'A brand with this name already exists');
      throw error;
    }
  }

  async update(id: string, input: BrandPatch, auth: AuthContext): Promise<Brand | null> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const existing = await client.query<BrandRow>(
          `SELECT ${BRAND_COLUMNS} FROM brand_master WHERE id = $1 FOR UPDATE`,
          [id],
        );
        const row = existing.rows[0];
        if (!row) return null;
        const before = toBrand(row);
        const result = await client.query<BrandRow>(
          `UPDATE brand_master SET name = $2, active = $3, updated_at = clock_timestamp()
           WHERE id = $1 RETURNING ${BRAND_COLUMNS}`,
          [id, input.name ?? before.name, input.active ?? before.active],
        );
        const updated = result.rows[0];
        if (!updated) throw new Error('Locked brand update did not return a record');
        const after = toBrand(updated);
        await appendBrandAudit(client, auth, 'UPDATE', before, after);
        return after;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError(409, 'DUPLICATE_BRAND_NAME', 'A brand with this name already exists');
      throw error;
    }
  }

  async list(): Promise<Brand[]> {
    const result = await this.pool.query<BrandRow>(`SELECT ${BRAND_COLUMNS} FROM brand_master ORDER BY name`);
    return result.rows.map(toBrand);
  }

  async findActiveByName(name: string): Promise<Brand | null> {
    const result = await this.pool.query<BrandRow>(
      `SELECT ${BRAND_COLUMNS} FROM brand_master WHERE lower(btrim(name)) = lower(btrim($1)) AND active = true`,
      [name],
    );
    return result.rows[0] ? toBrand(result.rows[0]) : null;
  }
}
