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

/** GET /api/inventory/items: default and maximum number of items returned per request. */
export const ITEM_LIST_DEFAULT_LIMIT = 200;
export const ITEM_LIST_MAX_LIMIT = 500;
export const ITEM_SEARCH_MAX_LENGTH = 100;
export const itemListQuerySchema = z.object({
  // Blank search means "no filter". Matched case-insensitively against item_name OR item_code.
  search: z.string().trim().max(ITEM_SEARCH_MAX_LENGTH)
    .refine(value => !value.includes('\u0000'), 'NUL characters are invalid')
    .transform(value => value === '' ? undefined : value).optional(),
  active: z.enum(['true', 'false']).transform(value => value === 'true').optional(),
  limit: z.string().regex(/^[0-9]+$/, 'limit must be a positive integer').transform(Number)
    .pipe(z.number().int().min(1).max(ITEM_LIST_MAX_LIMIT)).default(ITEM_LIST_DEFAULT_LIMIT),
}).strict();
export type ItemListQuery = z.infer<typeof itemListQuerySchema>;
export type ItemInput = z.infer<typeof itemInputSchema>;
export interface Item extends ItemInput {
  id: string;
  item_code: string;
  branch_id: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}
