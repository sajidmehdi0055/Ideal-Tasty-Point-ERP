import { z } from 'zod';

export const PRIMARY_ITEM_TYPES = [
  'RAW_MATERIAL', 'WIP_SEMI_FINISHED', 'FINISHED_SELLING_PRODUCT', 'DIRECT_PURCHASE_SALE',
] as const;

const requiredText = z.string().trim().min(1).refine(value => !value.includes('\u0000'), 'NUL characters are invalid');
export const itemInputSchema = z.object({
  item_name: requiredText,
  primary_item_type: z.enum(PRIMARY_ITEM_TYPES),
  base_uom: requiredText,
  // Explicit "Generic / No Brand" is the approved non-branded value.
  brand: requiredText,
}).strict();

export const itemPatchSchema = itemInputSchema.partial().refine(
  value => Object.values(value).some(field => field !== undefined), 'At least one editable field is required',
);
export const itemIdSchema = z.uuid();
export type ItemInput = z.infer<typeof itemInputSchema>;
export interface Item extends ItemInput {
  id: string;
  item_code: string;
  branch_id: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}
