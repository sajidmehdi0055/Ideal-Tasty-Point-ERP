import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/context.js';
import type { GoodsReceipt } from '../domain/goods-receipt.js';

/** Goods receipts are create-only, so this only ever records action 'CREATE' (full receipt incl. lines). */
export async function appendGoodsReceiptAudit(client: PoolClient, auth: AuthContext, after: GoodsReceipt): Promise<void> {
  await client.query(
    `INSERT INTO goods_receipt_audit
       (id, goods_receipt_id, branch_id, actor_id, actor_role, action, before_data, after_data)
     VALUES ($1, $2, $3, $4, $5, 'CREATE', NULL, $6::jsonb)`,
    [randomUUID(), after.id, auth.branchId, auth.userId, auth.role, JSON.stringify(after)],
  );
}
