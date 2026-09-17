import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AuthContext } from '../../auth/context.js';
import type { ItemRepository } from '../application/item-repository.js';
import type { Item, ItemInput } from '../domain/item.js';
import { appendItemAudit } from './item-audit.js';

type ItemRow = Omit<Item, 'created_at' | 'updated_at'> & {
  created_at: Date;
  updated_at: Date;
};

function toItem(row: ItemRow): Item {
  return { ...row, created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString() };
}

export class PgItemRepository implements ItemRepository {
  constructor(private readonly pool: Pool) {}

  private async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let rollbackFailed = false;
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        rollbackFailed = true;
        throw new AggregateError([error, rollbackError], 'Transaction and rollback failed');
      }
      throw error;
    } finally {
      client.release(rollbackFailed);
    }
  }

  async create(input: ItemInput, auth: AuthContext): Promise<Item> {
    return this.transaction(async (client) => {
      const result = await client.query<ItemRow>(
        `INSERT INTO item_master (id, branch_id, item_name, primary_item_type, base_uom, brand)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [randomUUID(), auth.branchId, input.item_name, input.primary_item_type, input.base_uom, input.brand],
      );
      const row = result.rows[0];
      if (!row) throw new Error('Item insert did not return a record');
      const item = toItem(row);
      await appendItemAudit(client, auth, 'CREATE', null, item);
      return item;
    });
  }

  async update(id: string, input: Partial<ItemInput>, auth: AuthContext): Promise<Item | null> {
    return this.transaction(async (client) => {
      const existing = await client.query<ItemRow>(
        'SELECT * FROM item_master WHERE id = $1 AND branch_id = $2 FOR UPDATE',
        [id, auth.branchId],
      );
      const row = existing.rows[0];
      if (!row) return null;
      const before = toItem(row);
      const result = await client.query<ItemRow>(
        `UPDATE item_master SET item_name = $3, primary_item_type = $4, base_uom = $5,
          brand = $6, updated_at = clock_timestamp()
         WHERE id = $1 AND branch_id = $2 RETURNING *`,
        [id, auth.branchId, input.item_name ?? before.item_name,
          input.primary_item_type ?? before.primary_item_type, input.base_uom ?? before.base_uom,
          input.brand ?? before.brand],
      );
      const updated = result.rows[0];
      if (!updated) throw new Error('Locked item update did not return a record');
      const after = toItem(updated);
      await appendItemAudit(client, auth, 'UPDATE', before, after);
      return after;
    });
  }
}
