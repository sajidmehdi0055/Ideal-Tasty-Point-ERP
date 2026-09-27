import type { AuthContext } from '../../auth/context.js';
import type {
  StockTransfer, StockTransferInput, StockTransferListQuery, StockTransferReceiveInput, StockTransferSummary,
} from '../domain/stock-transfer.js';

export interface StockTransferRepository {
  /**
   * Sends a transfer (ADR-0011 O-02): TRANSFER_OUT at the source for every
   * line, status SENT. Returns null when a location or item is missing or in
   * another branch (404, no leak). Throws AppError 409 LOCATION_INACTIVE /
   * ITEM_INACTIVE, 409 INSUFFICIENT_STOCK when a line exceeds the source balance.
   */
  send(input: StockTransferInput, auth: AuthContext): Promise<StockTransfer | null>;
  /**
   * SENT -> RECEIVED (O-02/O-03). Null when missing/other branch. Throws 409
   * TRANSFER_STATUS_CONFLICT, 400 RECEIVE_LINES_MISMATCH (lines must cover every
   * transfer line once), 400 RECEIVED_EXCEEDS_SENT, 400 VARIANCE_REASON_REQUIRED.
   */
  receive(id: string, input: StockTransferReceiveInput, auth: AuthContext): Promise<StockTransfer | null>;
  /** SENT -> CANCELLED with reason, sent quantity back to the source (O-05). Null when missing/other branch; 409 TRANSFER_STATUS_CONFLICT otherwise. */
  cancel(id: string, reason: string, auth: AuthContext): Promise<StockTransfer | null>;
  /** Branch-scoped, newest first; optional status filter (SENT = in transit). */
  list(query: StockTransferListQuery, auth: AuthContext): Promise<StockTransferSummary[]>;
  /** Null when missing or in another branch. */
  get(id: string, auth: AuthContext): Promise<StockTransfer | null>;
}
