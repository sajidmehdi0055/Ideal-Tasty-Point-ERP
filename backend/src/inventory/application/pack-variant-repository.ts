import type { AuthContext } from '../../auth/context.js';
import type { PackVariant, PackVariantInput, PackVariantPatch } from '../domain/pack-variant.js';

export interface PackVariantRepository {
  /** Returns null when item_id does not exist in auth's branch (surfaced as 404, not 400/403). */
  create(input: PackVariantInput, auth: AuthContext): Promise<PackVariant | null>;
  /** Returns null when the pack variant, or its item's branch, does not match auth. */
  update(id: string, input: PackVariantPatch, auth: AuthContext): Promise<PackVariant | null>;
  list(): Promise<PackVariant[]>;
}
