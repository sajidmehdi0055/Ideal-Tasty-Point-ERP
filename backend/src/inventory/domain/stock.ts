import { z } from 'zod';

// Quantities are always in the item's Base UOM and travel as decimal strings
// end to end (never JSON numbers), matching NUMERIC(18,6) storage.
const positiveQuantitySchema = z.string()
  .regex(/^\d{1,12}(\.\d{1,6})?$/, 'quantity must be a plain decimal string, e.g. "10" or "10.5"')
  .refine(value => Number(value) > 0, 'quantity must be greater than 0');

const nonZeroSignedQuantitySchema = z.string()
  .regex(/^-?\d{1,12}(\.\d{1,6})?$/, 'quantity_delta must be a plain signed decimal string, e.g. "2.5" or "-1"')
  .refine(value => Number(value) !== 0, 'quantity_delta must not be zero');

const reasonSchema = z.string().trim().min(1).max(500).refine(value => !value.includes('\u0000'), 'NUL characters are invalid');

export const openingStockInputSchema = z.object({
  item_id: z.uuid(),
  location_id: z.uuid(),
  quantity: positiveQuantitySchema,
}).strict();

// Owner decision 2026-09-26: opening stock is never edited or deleted; a
// correction is a separate ADJUSTMENT entry with a mandatory reason.
export const stockAdjustmentInputSchema = z.object({
  item_id: z.uuid(),
  location_id: z.uuid(),
  quantity_delta: nonZeroSignedQuantitySchema,
  reason: reasonSchema,
}).strict();

export const stockQuerySchema = z.object({
  item_id: z.uuid().optional(),
  location_id: z.uuid().optional(),
}).strict();

export type OpeningStockInput = z.infer<typeof openingStockInputSchema>;
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentInputSchema>;
export type StockQuery = z.infer<typeof stockQuerySchema>;
export const STOCK_MOVEMENT_TYPES = ['OPENING', 'ADJUSTMENT'] as const;

export interface StockMovement {
  id: string;
  item_id: string;
  location_id: string;
  movement_type: typeof STOCK_MOVEMENT_TYPES[number];
  quantity_delta: string;
  reason: string | null;
  created_at: string;
}

export interface StockBalance {
  item_id: string;
  item_code: string;
  item_name: string;
  base_uom: string;
  location_id: string;
  location_name: string;
  quantity: string;
}
