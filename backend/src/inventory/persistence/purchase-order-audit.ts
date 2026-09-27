import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/context.js';
import type { PurchaseOrder } from '../domain/purchase-order.js';

export type PurchaseOrderAuditAction = 'CREATE' | 'UPDATE' | 'RECEIPT' | 'CANCEL' | 'CLOSE';

/**
 * Append-only PO history (ADR-0010): full before/after snapshots including the
 * current lines and received quantities. RECEIPT rows also name the goods
 * receipt that changed the PO.
 */
export async function appendPurchaseOrderAudit(
  client: PoolClient,
  auth: AuthContext,
  action: PurchaseOrderAuditAction,
  before: PurchaseOrder | null,
  after: PurchaseOrder,
  goodsReceiptId: string | null = null,
): Promise<void> {
  await client.query(
    `INSERT INTO purchase_order_audit
       (id, purchase_order_id, branch_id, actor_id, actor_role, action, goods_receipt_id, before_data, after_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
    [randomUUID(), after.id, auth.branchId, auth.userId, auth.role, action, goodsReceiptId,
      before === null ? null : JSON.stringify(before), JSON.stringify(after)],
  );
}
