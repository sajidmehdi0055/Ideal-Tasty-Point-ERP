import { z } from 'zod';

export const SUPPLIER_TYPES = ['CASH', 'CREDIT'] as const;

const requiredText = z.string().trim().min(1).refine(value => !value.includes('\u0000'), 'NUL characters are invalid');
const optionalText = z.string().trim().max(500).refine(value => !value.includes('\u0000'), 'NUL characters are invalid').optional();

export const supplierInputSchema = z.object({
  name: requiredText,
  contact: optionalText,
  type: z.enum(SUPPLIER_TYPES),
}).strict();

// `active` is accepted here at the schema level (create/edit share the same
// editable surface as other masters); the Owner-only gate on changing it is
// enforced in SupplierService, not here, so this schema stays a plain,
// reusable "what fields exist" description.
export const supplierPatchSchema = z.object({
  name: requiredText.optional(),
  contact: optionalText,
  type: z.enum(SUPPLIER_TYPES).optional(),
  active: z.boolean().optional(),
}).strict().refine(
  value => Object.values(value).some(field => field !== undefined), 'At least one editable field is required',
);
export const supplierIdSchema = z.uuid();
export type SupplierInput = z.infer<typeof supplierInputSchema>;
export type SupplierPatch = z.infer<typeof supplierPatchSchema>;
export interface Supplier {
  id: string;
  name: string;
  contact: string | null;
  type: typeof SUPPLIER_TYPES[number];
  active: boolean;
  created_at: string;
  updated_at: string;
}
