import type { AuthContext } from '../../auth/context.js';
import type { PurchaseRecord, PurchaseRecordInput, RateComparisonQuery, RateComparisonResult } from '../domain/purchase-record.js';

export interface PurchaseRecordRepository {
  /**
   * Returns null when item_id does not exist in auth's branch (surfaced as
   * 404, never leaking cross-branch existence). Throws AppError(400,
   * INVALID_REFERENCE) when pack_variant_id does not exist, or exists but
   * does not belong to the given item_id/brand_id combination.
   */
  create(input: PurchaseRecordInput, auth: AuthContext): Promise<PurchaseRecord | null>;
  /** Scoped to purchase records whose item belongs to auth.branchId; never returns another branch's data. */
  list(auth: AuthContext): Promise<PurchaseRecord[]>;
  /**
   * Returns null when item_id does not exist in auth's branch (surfaced as
   * 404). Throws AppError(400, INVALID_REFERENCE) for the same pack-variant
   * mismatch reasons as create. Never errors merely because fewer than 3 (or
   * zero) purchase records exist yet -- callers get nulls for what cannot be
   * computed.
   */
  getRateComparison(query: RateComparisonQuery, auth: AuthContext): Promise<RateComparisonResult | null>;
}
