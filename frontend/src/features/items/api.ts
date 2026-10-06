import { apiClient } from '../../lib/api-client';
import type { Item, ItemInput } from './types';

const BASE_PATH = '/api/inventory/items';

export function createItem(input: ItemInput): Promise<Item> {
  return apiClient.post<Item>(BASE_PATH, input);
}

export function updateItem(id: string, patch: Partial<ItemInput>): Promise<Item> {
  return apiClient.patch<Item>(`${BASE_PATH}/${id}`, patch);
}

/**
 * Query of `GET /api/inventory/items` (INV-ITEM-LIST-001, on main). The server
 * schema is strict: only these three keys, `active` exactly `true`/`false`,
 * `limit` 1–500 (server default 200), `search` ≤ 100 characters matched
 * case-insensitively against item name or code.
 */
export interface ItemListQuery {
  search?: string;
  active?: boolean;
  limit?: number;
}

export interface ItemListPage {
  items: Item[];
  /** More items matched than `limit` (`X-Result-Truncated: true`) — narrow the search. */
  truncated: boolean;
}

function toQueryString(query: ItemListQuery): string {
  const params = new URLSearchParams();
  const search = query.search?.trim();
  if (search) params.set('search', search);
  if (query.active !== undefined) params.set('active', String(query.active));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Branch-scoped item list/search, ordered by name then code, with the truncation flag. */
export async function listItemsPage(query: ItemListQuery = {}): Promise<ItemListPage> {
  const { body, headers } = await apiClient.getWithHeaders<Item[]>(`${BASE_PATH}${toQueryString(query)}`);
  return { items: body, truncated: headers.get('X-Result-Truncated') === 'true' };
}

export async function listItems(query: ItemListQuery = {}): Promise<Item[]> {
  return (await listItemsPage(query)).items;
}
