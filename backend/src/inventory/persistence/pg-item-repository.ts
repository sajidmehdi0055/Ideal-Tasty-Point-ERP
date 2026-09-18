import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AuthContext } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import type { ItemRepository } from '../application/item-repository.js';
import type { Item, ItemInput } from '../domain/item.js';
import { appendItemAudit } from './item-audit.js';
import { withTransaction } from './transaction.js';

type ItemRow = Omit<Item, 'created_at' | 'updated_at'> & {
  created_at: Date;
  updated_at: Date;
};

const ITEM_SELECT_COLUMNS = `im.id, im.item_code, im.branch_id, im.item_name, im.primary_item_type,
  um.name AS base_uom, im.brand, im.active, im.created_at, im.updated_at`;
const ITEM_RETURNING_COLUMNS = `id, item_code, branch_id, item_name, primary_item_type, brand, active, created_at, updated_at`;

function toItem(row: ItemRow): Item {
  return { ...row, created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString() };
}

export class PgItemRepository implements ItemRepository {
  constructor(private readonly pool: Pool) {}

  /** base_uom is resolved against uom_master here, keeping the Item/ItemInput
   * contract (base_uom as a plain name string) stable while storage uses a FK. */
  private async resolveActiveUom(client: PoolClient, name: string): Promise<{ id: string; name: string }> {
    const result = await client.query<{ id: string; name: string }>(
      'SELECT id, name FROM uom_master WHERE lower(btrim(name)) = lower(btrim($1)) AND active = true',
      [name],
    );
    const uom = result.rows[0];
    if (!uom) throw new AppError(400, 'INVALID_BASE_UOM', 'base_uom must reference an existing active UOM');
    return uom;
  }

  async create(input: ItemInput, auth: AuthContext): Promise<Item> {
    return withTransaction(this.pool, async (client) => {
      const uom = await this.resolveActiveUom(client, input.base_uom);
      const result = await client.query<Omit<ItemRow, 'base_uom'>>(
        `INSERT INTO item_master (id, branch_id, item_name, primary_item_type, base_uom_id, brand)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${ITEM_RETURNING_COLUMNS}`,
        [randomUUID(), auth.branchId, input.item_name, input.primary_item_type, uom.id, input.brand],
      );
      const row = result.rows[0];
      if (!row) throw new Error('Item insert did not return a record');
      const item = toItem({ ...row, base_uom: uom.name });
      await appendItemAudit(client, auth, 'CREATE', null, item);
      return item;
    });
  }

  async update(id: string, input: Partial<ItemInput>, auth: AuthContext): Promise<Item | null> {
    return withTransaction(this.pool, async (client) => {
      const existing = await client.query<ItemRow>(
        `SELECT ${ITEM_SELECT_COLUMNS} FROM item_master im JOIN uom_master um ON um.id = im.base_uom_id
         WHERE im.id = $1 AND im.branch_id = $2 FOR UPDATE OF im`,
        [id, auth.branchId],
      );
      const row = existing.rows[0];
      if (!row) return null;
      const before = toItem(row);
      const newUom = input.base_uom === undefined ? null : await this.resolveActiveUom(client, input.base_uom);
      const result = await client.query<Omit<ItemRow, 'base_uom'>>(
        `UPDATE item_master SET item_name = $3, primary_item_type = $4,
          base_uom_id = COALESCE($5, base_uom_id), brand = $6, updated_at = clock_timestamp()
         WHERE id = $1 AND branch_id = $2 RETURNING ${ITEM_RETURNING_COLUMNS}`,
        [id, auth.branchId, input.item_name ?? before.item_name,
          input.primary_item_type ?? before.primary_item_type, newUom?.id ?? null,
          input.brand ?? before.brand],
      );
      const updated = result.rows[0];
      if (!updated) throw new Error('Locked item update did not return a record');
      const after = toItem({ ...updated, base_uom: newUom?.name ?? before.base_uom });
      await appendItemAudit(client, auth, 'UPDATE', before, after);
      return after;
    });
  }
}
