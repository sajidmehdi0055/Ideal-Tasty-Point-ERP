import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/context.js';
import type { StockLocation } from '../domain/stock-location.js';
import type { StockMovement } from '../domain/stock.js';

export async function appendStockLocationAudit(
  client: PoolClient,
  auth: AuthContext,
  action: 'CREATE' | 'UPDATE',
  before: StockLocation | null,
  after: StockLocation,
): Promise<void> {
  await client.query(
    `INSERT INTO stock_location_audit
       (id, location_id, branch_id, actor_id, actor_role, action, before_data, after_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
    [randomUUID(), after.id, auth.branchId, auth.userId, auth.role, action,
      before === null ? null : JSON.stringify(before), JSON.stringify(after)],
  );
}

/** Stock movements are append-only, so this only ever records action 'CREATE'. */
export async function appendStockMovementAudit(client: PoolClient, auth: AuthContext, after: StockMovement): Promise<void> {
  await client.query(
    `INSERT INTO stock_movement_audit
       (id, stock_movement_id, branch_id, actor_id, actor_role, action, before_data, after_data)
     VALUES ($1, $2, $3, $4, $5, 'CREATE', NULL, $6::jsonb)`,
    [randomUUID(), after.id, auth.branchId, auth.userId, auth.role, JSON.stringify(after)],
  );
}
