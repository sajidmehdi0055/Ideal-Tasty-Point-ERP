import type { AuthContext } from '../../auth/context.js';
import type { Uom, UomInput, UomPatch } from '../domain/uom.js';

export interface UomRepository {
  create(input: UomInput, auth: AuthContext): Promise<Uom>;
  update(id: string, input: UomPatch, auth: AuthContext): Promise<Uom | null>;
  list(): Promise<Uom[]>;
  findActiveByName(name: string): Promise<Uom | null>;
}
