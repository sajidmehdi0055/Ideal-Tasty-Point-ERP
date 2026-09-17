import type { AuthContext } from '../../auth/context.js';
import type { Item, ItemInput } from '../domain/item.js';

export interface ItemRepository {
  create(input: ItemInput, auth: AuthContext): Promise<Item>;
  update(id: string, input: Partial<ItemInput>, auth: AuthContext): Promise<Item | null>;
}
