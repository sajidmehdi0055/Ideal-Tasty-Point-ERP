import type { AuthContext } from '../../auth/context.js';
import type { Supplier, SupplierInput, SupplierPatch } from '../domain/supplier.js';

export interface SupplierRepository {
  create(input: SupplierInput, auth: AuthContext): Promise<Supplier>;
  update(id: string, input: SupplierPatch, auth: AuthContext): Promise<Supplier | null>;
  list(): Promise<Supplier[]>;
  findActiveByName(name: string): Promise<Supplier | null>;
}
