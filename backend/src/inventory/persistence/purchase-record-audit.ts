import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/context.js';
import type { PurchaseRecord } from '../domain/purchase-record.js';

/** Purchase Record is create-only (no edit path exists), so this only ever records action 'CREATE'. */
export async function appendPurchaseRecordAudit(
  client: PoolClient,
  auth: AuthContext,
  after: PurchaseRecord,
): Promise<void> {
  await client.query(
    `INSERT INTO purchase_record_audit
       (id, purchase_record_id, branch_id, actor_id, actor_role, action, before_data, after_data)
     VALUES ($1, $2, $3, $4, $5, 'CREATE', NULL, $6::jsonb)`,
    [randomUUID(), after.id, auth.branchId, auth.userId, auth.role, JSON.stringify(after)],
  );
}
