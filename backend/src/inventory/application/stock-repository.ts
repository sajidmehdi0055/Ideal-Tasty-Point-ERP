import type { AuthContext } from '../../auth/context.js';
import type { OpeningStockInput, StockAdjustmentInput, StockBalance, StockMovement, StockQuery } from '../domain/stock.js';

export interface StockRepository {
  /**
   * Returns null when the item or location does not exist in auth's branch
   * (404). Throws AppError(409) for an inactive item/location
   * (ITEM_INACTIVE / LOCATION_INACTIVE) or an existing opening entry
   * (OPENING_ALREADY_EXISTS).
   */
  createOpening(input: OpeningStockInput, auth: AuthContext): Promise<StockMovement | null>;
  /**
   * Same not-found/inactive handling as createOpening. Throws AppError(409,
   * OPENING_REQUIRED) when no opening entry exists yet for the item+location,
   * and AppError(409, NEGATIVE_BALANCE) when the balance would go below zero.
   */
  createAdjustment(input: StockAdjustmentInput, auth: AuthContext): Promise<StockMovement | null>;
  /** Branch-scoped current balances (sum of movements), optionally filtered. */
  listBalances(query: StockQuery, auth: AuthContext): Promise<StockBalance[]>;
  /** Branch-scoped movement history, newest first, optionally filtered. */
  listMovements(query: StockQuery, auth: AuthContext): Promise<StockMovement[]>;
}
