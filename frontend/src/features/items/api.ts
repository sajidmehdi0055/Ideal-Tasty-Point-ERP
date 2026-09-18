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
 * Stable `main` does not register this route today (see types.ts doc
 * comment), so this call is expected to 404 until a list endpoint ships.
 * It is still attempted for real, so the UI starts working the day the
 * backend adds it, with no frontend change required.
 */
export function listItems(): Promise<Item[]> {
  return apiClient.get<Item[]>(BASE_PATH);
}
