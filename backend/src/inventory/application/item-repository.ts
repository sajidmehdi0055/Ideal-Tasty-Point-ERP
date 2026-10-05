import type { AuthContext } from '../../auth/context.js';
import type { Item, ItemInput, ItemListQuery } from '../domain/item.js';

/** truncated: more items matched than query.limit; only the first `limit` are returned. */
export interface ItemListResult { items: Item[]; truncated: boolean }

export interface ItemRepository {
  create(input: ItemInput, auth: AuthContext): Promise<Item>;
  update(id: string, input: Partial<ItemInput>, auth: AuthContext): Promise<Item | null>;
  list(query: ItemListQuery, auth: AuthContext): Promise<ItemListResult>;
  get(id: string, auth: AuthContext): Promise<Item | null>;
}
