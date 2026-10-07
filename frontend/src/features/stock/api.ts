import { apiClient } from '../../lib/api-client';
import type {
  OpeningStockInput,
  StockAdjustmentInput,
  StockBalance,
  StockLocation,
  StockLocationInput,
  StockLocationPatch,
  StockMovement,
  StockQuery,
  StockTransferStatus,
  StockTransferSummary,
} from './types';

const LOCATIONS_PATH = '/api/inventory/locations';
const STOCK_PATH = '/api/inventory/stock';
const TRANSFERS_PATH = '/api/inventory/transfers';

export function listLocations(): Promise<StockLocation[]> {
  return apiClient.get<StockLocation[]>(LOCATIONS_PATH);
}

export function createLocation(input: StockLocationInput): Promise<StockLocation> {
  return apiClient.post<StockLocation>(LOCATIONS_PATH, input);
}

export function updateLocation(id: string, patch: StockLocationPatch): Promise<StockLocation> {
  return apiClient.patch<StockLocation>(`${LOCATIONS_PATH}/${encodeURIComponent(id)}`, patch);
}

/** Only the two filters the server accepts (`.strict()` query schema) are ever sent. */
function toQueryString(query: StockQuery): string {
  const params = new URLSearchParams();
  if (query.item_id) params.set('item_id', query.item_id);
  if (query.location_id) params.set('location_id', query.location_id);
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function listBalances(query: StockQuery = {}): Promise<StockBalance[]> {
  return apiClient.get<StockBalance[]>(`${STOCK_PATH}/balances${toQueryString(query)}`);
}

export function listMovements(query: StockQuery = {}): Promise<StockMovement[]> {
  return apiClient.get<StockMovement[]>(`${STOCK_PATH}/movements${toQueryString(query)}`);
}

export function createAdjustment(input: StockAdjustmentInput): Promise<StockMovement> {
  return apiClient.post<StockMovement>(`${STOCK_PATH}/adjustments`, input);
}

/** Opening stock must be the first entry for an item + location (ADR-0008 D-03, S-05 O-07). */
export function createOpening(input: OpeningStockInput): Promise<StockMovement> {
  return apiClient.post<StockMovement>(`${STOCK_PATH}/opening`, input);
}

/**
 * `GET /api/inventory/transfers?status=…` — array of transfer summaries
 * (Owner/Manager, ADR-0011). The server query schema is strict: only `status` is sent.
 */
export function listTransfers(query: { status?: StockTransferStatus } = {}): Promise<StockTransferSummary[]> {
  const suffix = query.status ? `?status=${encodeURIComponent(query.status)}` : '';
  return apiClient.get<StockTransferSummary[]>(`${TRANSFERS_PATH}${suffix}`);
}
