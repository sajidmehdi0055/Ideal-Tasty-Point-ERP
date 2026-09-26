import { z } from 'zod';

// Owner decision 2026-09-26 (ADR-0008): STORE and KITCHEN are top-level
// locations; every FREEZER is its own location under a STORE/KITCHEN parent.
export const STOCK_LOCATION_TYPES = ['STORE', 'KITCHEN', 'FREEZER'] as const;

const requiredText = z.string().trim().min(1).max(200).refine(value => !value.includes('\u0000'), 'NUL characters are invalid');

export const stockLocationInputSchema = z.object({
  name: requiredText,
  location_type: z.enum(STOCK_LOCATION_TYPES),
  parent_id: z.uuid().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.location_type === 'FREEZER' && value.parent_id === undefined) {
    ctx.addIssue({ code: 'custom', path: ['parent_id'], message: 'A FREEZER location requires parent_id (a STORE or KITCHEN location)' });
  }
  if (value.location_type !== 'FREEZER' && value.parent_id !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['parent_id'], message: 'Only a FREEZER location may have a parent_id' });
  }
});

// Type and parent are fixed after creation; only name and active are editable.
// The Owner-only gate on `active` is enforced in StockLocationService.
export const stockLocationPatchSchema = z.object({
  name: requiredText.optional(),
  active: z.boolean().optional(),
}).strict().refine(
  value => Object.values(value).some(field => field !== undefined), 'At least one editable field is required',
);
export const stockLocationIdSchema = z.uuid();
export type StockLocationInput = z.infer<typeof stockLocationInputSchema>;
export type StockLocationPatch = z.infer<typeof stockLocationPatchSchema>;
export interface StockLocation {
  id: string;
  branch_id: string;
  name: string;
  location_type: typeof STOCK_LOCATION_TYPES[number];
  parent_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}
