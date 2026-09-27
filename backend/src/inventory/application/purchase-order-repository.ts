import type { AuthContext } from '../../auth/context.js';
import type {
  PurchaseOrder, PurchaseOrderInput, PurchaseOrderListQuery, PurchaseOrderPatch, PurchaseOrderSummary,
} from '../domain/purchase-order.js';

export interface PurchaseOrderRepository {
  /**
   * Creates an ISSUED purchase order (owner decision O-01) in the caller's branch.
   * Returns null when any line's item is missing or in another branch (404, no leak).
   * Throws AppError: 400 INVALID_REFERENCE (unknown supplier, pack variant not
   * matching item+brand), 400 INVALID_ORDER_DATE (future business date),
   * 409 SUPPLIER_INACTIVE / ITEM_INACTIVE / PACK_VARIANT_INACTIVE.
   */
  create(input: PurchaseOrderInput, auth: AuthContext): Promise<PurchaseOrder | null>;
  /**
   * Edits a PO that has no receipt yet (O-05). Null when the PO is missing or in
   * another branch. Throws 409 PO_NOT_EDITABLE, 404 NOT_FOUND for a line item
   * outside the branch, plus the create errors.
   */
  update(id: string, patch: PurchaseOrderPatch, auth: AuthContext): Promise<PurchaseOrder | null>;
  /** ISSUED -> CANCELLED with reason (O-07). Null when missing/other branch; 409 PO_STATUS_CONFLICT otherwise. */
  cancel(id: string, reason: string, auth: AuthContext): Promise<PurchaseOrder | null>;
  /** PARTIALLY_RECEIVED -> CLOSED with reason (O-06/O-07). Null when missing/other branch; 409 PO_STATUS_CONFLICT otherwise. */
  close(id: string, reason: string, auth: AuthContext): Promise<PurchaseOrder | null>;
  /** Branch-scoped, newest order date first; optional status filter. */
  list(query: PurchaseOrderListQuery, auth: AuthContext): Promise<PurchaseOrderSummary[]>;
  /** Null when missing or in another branch. */
  get(id: string, auth: AuthContext): Promise<PurchaseOrder | null>;
}
