import type { AuthContext } from '../../auth/context.js';
import type { Brand, BrandInput, BrandPatch } from '../domain/brand.js';

export interface BrandRepository {
  create(input: BrandInput, auth: AuthContext): Promise<Brand>;
  update(id: string, input: BrandPatch, auth: AuthContext): Promise<Brand | null>;
  list(): Promise<Brand[]>;
  findActiveByName(name: string): Promise<Brand | null>;
}
