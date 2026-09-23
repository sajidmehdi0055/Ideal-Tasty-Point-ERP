import { requireItemEditor } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import { packVariantIdSchema, packVariantInputSchema, packVariantPatchSchema } from '../domain/pack-variant.js';
import type { PackVariantRepository } from './pack-variant-repository.js';

export class PackVariantService {
  constructor(private readonly repository: PackVariantRepository) {}

  async create(body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const input = packVariantInputSchema.parse(body);
    const packVariant = await this.repository.create(input, auth);
    if (!packVariant) throw new AppError(404, 'ITEM_NOT_FOUND', 'Referenced item not found');
    return packVariant;
  }

  async update(id: unknown, body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const patch = packVariantPatchSchema.parse(body);
    const packVariant = await this.repository.update(packVariantIdSchema.parse(id), patch, auth);
    if (!packVariant) throw new AppError(404, 'PACK_VARIANT_NOT_FOUND', 'Pack variant not found');
    return packVariant;
  }

  async list(context: unknown) {
    const auth = requireItemEditor(context);
    return this.repository.list(auth);
  }
}
