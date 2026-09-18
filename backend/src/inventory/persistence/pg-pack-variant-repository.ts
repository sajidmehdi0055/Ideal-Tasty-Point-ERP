import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AuthContext } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import type { PackVariantRepository } from '../application/pack-variant-repository.js';
import type { PackVariant, PackVariantInput, PackVariantPatch } from '../domain/pack-variant.js';
import { appendPackVariantAudit } from './pack-variant-audit.js';
import { withTransaction } from './transaction.js';

const PACK_VARIANT_COLUMNS = 'id, item_id, brand_id, pack_uom_id, conversion_factor, active, created_at, updated_at';
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

type PackVariantRow = Omit<PackVariant, 'created_at' | 'updated_at'> & { created_at: Date; updated_at: Date };

function toPackVariant(row: PackVariantRow): PackVariant {
  return { ...row, created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString() };
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

export class PgPackVariantRepository implements PackVariantRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: PackVariantInput, auth: AuthContext): Promise<PackVariant | null> {
    try {
      return await withTransaction(this.pool, async (client) => {
        // Pack Variant carries no branch_id of its own; branch ownership is
        // enforced here via the referenced item, never trusted from the client.
        const itemCheck = await client.query<{ branch_id: string }>(
          'SELECT branch_id FROM item_master WHERE id = $1',
          [input.item_id],
        );
        const itemRow = itemCheck.rows[0];
        if (!itemRow || itemRow.branch_id !== auth.branchId) return null;

        const result = await client.query<PackVariantRow>(
          `INSERT INTO pack_variant (id, item_id, brand_id, pack_uom_id, conversion_factor)
           VALUES ($1, $2, $3, $4, $5) RETURNING ${PACK_VARIANT_COLUMNS}`,
          [randomUUID(), input.item_id, input.brand_id, input.pack_uom_id, input.conversion_factor],
        );
        const row = result.rows[0];
        if (!row) throw new Error('Pack variant insert did not return a record');
        const packVariant = toPackVariant(row);
        await appendPackVariantAudit(client, auth, 'CREATE', null, packVariant);
        return packVariant;
      });
    } catch (error) {
      if (hasCode(error, UNIQUE_VIOLATION)) {
        throw new AppError(409, 'DUPLICATE_PACK_VARIANT', 'This exact item/brand/pack UOM/conversion combination already exists');
      }
      if (hasCode(error, FOREIGN_KEY_VIOLATION)) {
        throw new AppError(400, 'INVALID_REFERENCE', 'brand_id or pack_uom_id does not reference an existing row');
      }
      throw error;
    }
  }

  async update(id: string, input: PackVariantPatch, auth: AuthContext): Promise<PackVariant | null> {
    try {
      return await withTransaction(this.pool, async (client) => {
        const existing = await client.query<PackVariantRow>(
          `SELECT pv.id, pv.item_id, pv.brand_id, pv.pack_uom_id, pv.conversion_factor, pv.active, pv.created_at, pv.updated_at
           FROM pack_variant pv JOIN item_master im ON im.id = pv.item_id
           WHERE pv.id = $1 AND im.branch_id = $2 FOR UPDATE OF pv`,
          [id, auth.branchId],
        );
        const row = existing.rows[0];
        if (!row) return null;
        const before = toPackVariant(row);
        const result = await client.query<PackVariantRow>(
          `UPDATE pack_variant SET conversion_factor = $2, active = $3, updated_at = clock_timestamp()
           WHERE id = $1 RETURNING ${PACK_VARIANT_COLUMNS}`,
          [id, input.conversion_factor ?? before.conversion_factor, input.active ?? before.active],
        );
        const updated = result.rows[0];
        if (!updated) throw new Error('Locked pack variant update did not return a record');
        const after = toPackVariant(updated);
        await appendPackVariantAudit(client, auth, 'UPDATE', before, after);
        return after;
      });
    } catch (error) {
      if (hasCode(error, UNIQUE_VIOLATION)) {
        throw new AppError(409, 'DUPLICATE_PACK_VARIANT', 'This exact item/brand/pack UOM/conversion combination already exists');
      }
      throw error;
    }
  }

  async list(): Promise<PackVariant[]> {
    const result = await this.pool.query<PackVariantRow>(`SELECT ${PACK_VARIANT_COLUMNS} FROM pack_variant ORDER BY created_at`);
    return result.rows.map(toPackVariant);
  }
}
