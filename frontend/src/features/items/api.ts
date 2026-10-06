import { apiClient } from '../../lib/api-client';
import type { Item, ItemInput } from './types';

const BASE_PATH = '/api/inventory/items';

/** Response header set by GET /api/inventory/items when more items matched than were returned (INV-ITEM-LIST-001). */
export const ITEM_LIST_TRUNCATED_HEADER = 'X-Result-Truncated';

export interface ItemListQuery {
  /** Case-insensitive match on item name or code, done by the backend (max 100 characters). */
  search?: string;
}

export interface ItemListResult {
  items: Item[];
  /** True when the backend capped the result (default 200 items); narrow with `search`. */
  truncated: boolean;
}

export function createItem(input: ItemInput): Promise<Item> {
  return apiClient.post<Item>(BASE_PATH, input);
}

export function updateItem(id: string, patch: Partial<ItemInput>): Promise<Item> {
  return apiClient.patch<Item>(`${BASE_PATH}/${id}`, patch);
}

/** Branch-scoped item list from the backend (OWNER/MANAGER). Uses the backend's default limit. */
export async function listItems(query: ItemListQuery = {}): Promise<ItemListResult> {
  const params = new URLSearchParams();
  const search = query.search?.trim();
  if (search) params.set('search', search);
  const qs = params.toString();
  const { data, headers } = await apiClient.getWithHeaders<Item[]>(qs ? `${BASE_PATH}?${qs}` : BASE_PATH);
  return { items: data, truncated: headers.get(ITEM_LIST_TRUNCATED_HEADER) === 'true' };
}

export function getItem(id: string): Promise<Item> {
  return apiClient.get<Item>(`${BASE_PATH}/${encodeURIComponent(id)}`);
}
