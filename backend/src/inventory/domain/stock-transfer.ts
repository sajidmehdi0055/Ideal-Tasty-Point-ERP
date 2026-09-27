import { z } from 'zod';

// ADR-0011 (owner decisions 2026-09-27). Quantities are in the item's Base
// UOM and travel as decimal strings end to end (never JSON numbers),
// matching NUMERIC(18,6) storage.
const DECIMAL = /^\d{1,12}(\.\d{1,6})?$/;

const sentQuantitySchema = z.string()
  .regex(DECIMAL, 'quantity must be a plain decimal string, e.g. "10" or "10.5"')
  .refine(value => Number(value) > 0, 'quantity must be greater than 0');

// 0 is allowed on receive: everything lost/damaged, recorded as variance.
const receivedQuantitySchema = z.string()
  .regex(DECIMAL, 'received_quantity must be a plain decimal string, e.g. "10" or "0"');

const reasonSchema = z.string().trim().min(1, 'reason is required').max(500)
  .refine(value => !value.includes('\u0000'), 'NUL characters are invalid');

export const MAX_TRANSFER_LINES = 100;
export const STOCK_TRANSFER_STATUSES = ['SENT', 'RECEIVED', 'CANCELLED'] as const;
export type StockTransferStatus = typeof STOCK_TRANSFER_STATUSES[number];

export const stockTransferLineInputSchema = z.object({
  item_id: z.uuid(),
  quantity: sentQuantitySchema,
}).strict();

export const stockTransferInputSchema = z.object({
  from_location_id: z.uuid(),
  to_location_id: z.uuid(),
  lines: z.array(stockTransferLineInputSchema)
    .min(1, 'A transfer needs at least one line')
    .max(MAX_TRANSFER_LINES)
    .superRefine((lines, ctx) => {
      const seen = new Set<string>();
      lines.forEach((line, i) => {
        if (seen.has(line.item_id)) {
          ctx.addIssue({ code: 'custom', path: [i, 'item_id'], message: 'The same item appears more than once; combine the quantities into one line' });
        }
        seen.add(line.item_id);
      });
    }),
}).strict().refine(value => value.from_location_id !== value.to_location_id, {
  path: ['to_location_id'], message: 'to_location_id must be different from from_location_id',
});

export const stockTransferReceiveLineSchema = z.object({
  line_id: z.uuid(),
  received_quantity: receivedQuantitySchema,
  variance_reason: reasonSchema.optional(),
}).strict();

/** Receive covers every line of the transfer exactly once (ADR-0011 A-04). */
export const stockTransferReceiveSchema = z.object({
  lines: z.array(stockTransferReceiveLineSchema).min(1).max(MAX_TRANSFER_LINES)
    .superRefine((lines, ctx) => {
      const seen = new Set<string>();
      lines.forEach((line, i) => {
        if (seen.has(line.line_id)) ctx.addIssue({ code: 'custom', path: [i, 'line_id'], message: 'Each transfer line may appear only once' });
        seen.add(line.line_id);
      });
    }),
}).strict();

export const stockTransferCancelSchema = z.object({ reason: reasonSchema }).strict();

export const stockTransferListQuerySchema = z.object({
  status: z.enum(STOCK_TRANSFER_STATUSES).optional(),
}).strict();

export const stockTransferIdSchema = z.uuid();

export type StockTransferInput = z.infer<typeof stockTransferInputSchema>;
export type StockTransferReceiveInput = z.infer<typeof stockTransferReceiveSchema>;
export type StockTransferListQuery = z.infer<typeof stockTransferListQuerySchema>;

export interface StockTransferLine {
  id: string;
  line_no: number;
  item_id: string;
  sent_quantity: string;
  out_movement_id: string;
  /** null until the transfer is received (and for a cancelled transfer). */
  received_quantity: string | null;
  variance_quantity: string | null;
  variance_reason: string | null;
  in_movement_id: string | null;
  return_movement_id: string | null;
}

export interface StockTransfer {
  id: string;
  transfer_number: string;
  branch_id: string;
  from_location_id: string;
  to_location_id: string;
  status: StockTransferStatus;
  status_reason: string | null;
  created_at: string;
  updated_at: string;
  lines: StockTransferLine[];
}

export interface StockTransferSummary {
  id: string;
  transfer_number: string;
  from_location_id: string;
  from_location_name: string;
  to_location_id: string;
  to_location_name: string;
  status: StockTransferStatus;
  line_count: number;
  created_at: string;
  updated_at: string;
}
