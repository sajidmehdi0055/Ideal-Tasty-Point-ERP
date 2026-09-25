import { requireItemEditor } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import { supplierIdSchema, supplierInputSchema, supplierPatchSchema } from '../domain/supplier.js';
import type { SupplierRepository } from './supplier-repository.js';

export class SupplierService {
  constructor(private readonly repository: SupplierRepository) {}

  async create(body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const input = supplierInputSchema.parse(body);
    const existing = await this.repository.findActiveByName(input.name);
    if (existing) throw new AppError(409, 'DUPLICATE_SUPPLIER_NAME', 'A supplier with this name already exists');
    return this.repository.create(input, auth);
  }

  async update(id: unknown, body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const patch = supplierPatchSchema.parse(body);
    // Only Owner may change active (deactivate/reactivate); Owner or Manager
    // may edit the other fields. This is the one Supplier-specific
    // authorization rule beyond the shared Owner/Manager editor gate.
    if (patch.active !== undefined && auth.role !== 'OWNER') {
      throw new AppError(403, 'FORBIDDEN', 'Only Owner may change a supplier\'s active status');
    }
    if (patch.name !== undefined) {
      const existing = await this.repository.findActiveByName(patch.name);
      if (existing && existing.id !== supplierIdSchema.parse(id)) {
        throw new AppError(409, 'DUPLICATE_SUPPLIER_NAME', 'A supplier with this name already exists');
      }
    }
    const supplier = await this.repository.update(supplierIdSchema.parse(id), patch, auth);
    if (!supplier) throw new AppError(404, 'SUPPLIER_NOT_FOUND', 'Supplier not found');
    return supplier;
  }

  async list(context: unknown) {
    requireItemEditor(context);
    return this.repository.list();
  }
}
