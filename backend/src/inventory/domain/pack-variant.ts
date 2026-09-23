import { z } from 'zod';

// Transported as a decimal string end-to-end (never a JSON number) so the
// NUMERIC(18,6) "never float" guarantee holds at the API boundary too, not
// only at rest in PostgreSQL.
const conversionFactorSchema = z.string()
  .regex(/^\d{1,12}(\.\d{1,6})?$/, 'conversion_factor must be a plain decimal string, e.g. "16" or "16.5"')
  .refine(value => Number(value) > 0, 'conversion_factor must be greater than 0');

export const packVariantInputSchema = z.object({
  item_id: z.uuid(),
  brand_id: z.uuid(),
  pack_uom_id: z.uuid(),
  conversion_factor: conversionFactorSchema,
}).strict();

export const packVariantPatchSchema = z.object({
  conversion_factor: conversionFactorSchema.optional(),
  active: z.boolean().optional(),
}).strict().refine(
  value => Object.values(value).some(field => field !== undefined), 'At least one editable field is required',
);
export const packVariantIdSchema = z.uuid();
export type PackVariantInput = z.infer<typeof packVariantInputSchema>;
export type PackVariantPatch = z.infer<typeof packVariantPatchSchema>;
export interface PackVariant {
  id: string;
  item_id: string;
  brand_id: string;
  pack_uom_id: string;
  conversion_factor: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}
