import type { AuthContext } from '../../auth/context.js';
import type { StockLocation, StockLocationInput, StockLocationPatch } from '../domain/stock-location.js';

export interface StockLocationRepository {
  /**
   * Creates a location in auth.branchId. Throws AppError(400, INVALID_PARENT)
   * when parent_id is missing, in another branch, inactive or itself a
   * FREEZER; AppError(409, DUPLICATE_LOCATION_NAME) on a name clash in the branch.
   */
  create(input: StockLocationInput, auth: AuthContext): Promise<StockLocation>;
  /**
   * Returns null when the location does not exist in auth's branch (404,
   * never leaking cross-branch existence). Deactivation is refused while the
   * location still holds stock or has active child locations.
   */
  update(id: string, patch: StockLocationPatch, auth: AuthContext): Promise<StockLocation | null>;
  /** Scoped to auth.branchId; includes inactive locations with their active flag. */
  list(auth: AuthContext): Promise<StockLocation[]>;
}
