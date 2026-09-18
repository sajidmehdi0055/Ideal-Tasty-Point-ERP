import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/context.js';
import type { Uom } from '../domain/uom.js';

export async function appendUomAudit(
  client: PoolClient,
  auth: AuthContext,
  action: 'CREATE' | 'UPDATE',
  before: Uom | null,
  after: Uom,
): Promise<void> {
  await client.query(
    `INSERT INTO uom_audit
       (id, uom_id, branch_id, actor_id, actor_role, action, before_data, after_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
    [randomUUID(), after.id, auth.branchId, auth.userId, auth.role, action,
      before === null ? null : JSON.stringify(before), JSON.stringify(after)],
  );
}
