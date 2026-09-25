import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AuthContext } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import type { SupplierRepository } from '../application/supplier-repository.js';
import type { Supplier, SupplierInput, SupplierPatch } from '../domain/supplier.js';
import { appendSupplierAudit } from './supplier-audit.js';
import { withTransaction } from './transaction.js';

const SUPPLIER_COLUMNS = 'id, name, contact, type, active, created_at, updated_at';
const UNIQUE_VIOLATION = '23505';

type SupplierRow = Omit<Supplier, 'created_at' | 'updated_at'> & { created_at: Date; updated_at: Date };

function toSupplier(row: SupplierRow): Supplier {
  return { ...row, created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString() };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;
}

export class PgSupplierRepository implements SupplierRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: SupplierInput, auth: AuthContext): Promise<Supplier> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const result = await client.query<SupplierRow>(
          `INSERT INTO supplier_master (id, name, contact, type) VALUES ($1, $2, $3, $4) RETURNING ${SUPPLIER_COLUMNS}`,
          [randomUUID(), input.name, input.contact ?? null, input.type],
        );
        const row = result.rows[0];
        if (!row) throw new Error('Supplier insert did not return a record');
        const supplier = toSupplier(row);
        await appendSupplierAudit(client, auth, 'CREATE', null, supplier);
        return supplier;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError(409, 'DUPLICATE_SUPPLIER_NAME', 'A supplier with this name already exists');
      throw error;
    }
  }

  async update(id: string, input: SupplierPatch, auth: AuthContext): Promise<Supplier | null> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const existing = await client.query<SupplierRow>(
          `SELECT ${SUPPLIER_COLUMNS} FROM supplier_master WHERE id = $1 FOR UPDATE`,
          [id],
        );
        const row = existing.rows[0];
        if (!row) return null;
        const before = toSupplier(row);
        const result = await client.query<SupplierRow>(
          `UPDATE supplier_master SET name = $2, contact = $3, type = $4, active = $5, updated_at = clock_timestamp()
           WHERE id = $1 RETURNING ${SUPPLIER_COLUMNS}`,
          [id, input.name ?? before.name, input.contact ?? before.contact, input.type ?? before.type, input.active ?? before.active],
        );
        const updated = result.rows[0];
        if (!updated) throw new Error('Locked supplier update did not return a record');
        const after = toSupplier(updated);
        await appendSupplierAudit(client, auth, 'UPDATE', before, after);
        return after;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError(409, 'DUPLICATE_SUPPLIER_NAME', 'A supplier with this name already exists');
      throw error;
    }
  }

  async list(): Promise<Supplier[]> {
    const result = await this.pool.query<SupplierRow>(`SELECT ${SUPPLIER_COLUMNS} FROM supplier_master ORDER BY name`);
    return result.rows.map(toSupplier);
  }

  async findActiveByName(name: string): Promise<Supplier | null> {
    const result = await this.pool.query<SupplierRow>(
      `SELECT ${SUPPLIER_COLUMNS} FROM supplier_master WHERE lower(btrim(name)) = lower(btrim($1)) AND active = true`,
      [name],
    );
    return result.rows[0] ? toSupplier(result.rows[0]) : null;
  }
}
