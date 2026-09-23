import { requireItemEditor } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import { brandIdSchema, brandInputSchema, brandPatchSchema } from '../domain/brand.js';
import type { BrandRepository } from './brand-repository.js';

export class BrandService {
  constructor(private readonly repository: BrandRepository) {}

  async create(body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const input = brandInputSchema.parse(body);
    const existing = await this.repository.findActiveByName(input.name);
    if (existing) throw new AppError(409, 'DUPLICATE_BRAND_NAME', 'A brand with this name already exists');
    return this.repository.create(input, auth);
  }

  async update(id: unknown, body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const patch = brandPatchSchema.parse(body);
    if (patch.name !== undefined) {
      const existing = await this.repository.findActiveByName(patch.name);
      if (existing && existing.id !== brandIdSchema.parse(id)) {
        throw new AppError(409, 'DUPLICATE_BRAND_NAME', 'A brand with this name already exists');
      }
    }
    const brand = await this.repository.update(brandIdSchema.parse(id), patch, auth);
    if (!brand) throw new AppError(404, 'BRAND_NOT_FOUND', 'Brand not found');
    return brand;
  }

  async list(context: unknown) {
    requireItemEditor(context);
    return this.repository.list();
  }
}
