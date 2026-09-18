import { requireItemEditor } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import { itemIdSchema, itemInputSchema, itemPatchSchema } from '../domain/item.js';
import type { ItemInput } from '../domain/item.js';
import type { ItemRepository } from './item-repository.js';

export class ItemService {
  constructor(private readonly repository: ItemRepository) {}

  async create(body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    return this.repository.create(itemInputSchema.parse(body), auth);
  }

  async update(id: unknown, body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const parsed = itemPatchSchema.parse(body);
    const patch: Partial<ItemInput> = {};
    if (parsed.item_name !== undefined) patch.item_name = parsed.item_name;
    if (parsed.primary_item_type !== undefined) patch.primary_item_type = parsed.primary_item_type;
    if (parsed.base_uom !== undefined) patch.base_uom = parsed.base_uom;
    if (parsed.brand !== undefined) patch.brand = parsed.brand;
    const item = await this.repository.update(itemIdSchema.parse(id), patch, auth);
    if (!item) throw new AppError(404, 'ITEM_NOT_FOUND', 'Item not found');
    return item;
  }
}
