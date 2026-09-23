import { requireItemEditor } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import { uomIdSchema, uomInputSchema, uomPatchSchema } from '../domain/uom.js';
import type { UomRepository } from './uom-repository.js';

export class UomService {
  constructor(private readonly repository: UomRepository) {}

  async create(body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const input = uomInputSchema.parse(body);
    const existing = await this.repository.findActiveByName(input.name);
    if (existing) throw new AppError(409, 'DUPLICATE_UOM_NAME', 'A UOM with this name already exists');
    return this.repository.create(input, auth);
  }

  async update(id: unknown, body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const patch = uomPatchSchema.parse(body);
    if (patch.name !== undefined) {
      const existing = await this.repository.findActiveByName(patch.name);
      if (existing && existing.id !== uomIdSchema.parse(id)) {
        throw new AppError(409, 'DUPLICATE_UOM_NAME', 'A UOM with this name already exists');
      }
    }
    const uom = await this.repository.update(uomIdSchema.parse(id), patch, auth);
    if (!uom) throw new AppError(404, 'UOM_NOT_FOUND', 'UOM not found');
    return uom;
  }

  async list(context: unknown) {
    requireItemEditor(context);
    return this.repository.list();
  }
}
