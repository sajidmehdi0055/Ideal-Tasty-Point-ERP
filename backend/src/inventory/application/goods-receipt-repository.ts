import type { AuthContext } from '../../auth/context.js';
import type { GoodsReceipt, GoodsReceiptInput, GoodsReceiptSummary } from '../domain/goods-receipt.js';

export interface GoodsReceiptRepository {
  /**
   * Creates the receipt, and for every line one purchase record (rate
   * history) and one RECEIPT stock movement, all in one transaction.
   * Returns null when the location or any line's item is missing or belongs
   * to another branch (404, never leaking cross-branch existence).
   * Throws AppError: 400 INVALID_REFERENCE (unknown supplier, pack variant not
   * matching item+brand), 400 INVALID_RECEIPT_DATE (future business date),
   * 400 INVALID_QUANTITY (base quantity rounds to zero or is too large),
   * 409 SUPPLIER_INACTIVE / LOCATION_INACTIVE / ITEM_INACTIVE /
   * PACK_VARIANT_INACTIVE, 409 RECEIPT_BEFORE_OPENING.
   */
  create(input: GoodsReceiptInput, auth: AuthContext): Promise<GoodsReceipt | null>;
  /** Branch-scoped (via location), newest receipt date first. */
  list(auth: AuthContext): Promise<GoodsReceiptSummary[]>;
  /** Null when missing or in another branch. */
  get(id: string, auth: AuthContext): Promise<GoodsReceipt | null>;
}
