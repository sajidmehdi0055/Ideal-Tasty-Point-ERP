import { z } from 'zod';
import { isValidCalendarDate } from './purchase-record.js';

// ADR-0010 (owner decisions 2026-09-27). Quantities and rates travel as
// decimal strings end to end (never JSON numbers), matching NUMERIC(18,6).
function positiveDecimalSchema(label: string) {
  return z.string()
    .regex(/^\d{1,12}(\.\d{1,6})?$/, `${label} must be a plain decimal string, e.g. "10" or "10.5"`)
    .refine(value => Number(value) > 0, `${label} must be greater than 0`);
}

// Format and calendar validity here; "not in the future" is checked in the
// database transaction against the Asia/Karachi business date (ADR-0010 A-01).
const orderDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'order_date must be a plain calendar date string, e.g. "2026-09-27"')
  .refine(isValidCalendarDate, 'order_date must be a valid calendar date');

export const MAX_PURCHASE_ORDER_LINES = 100;
export const PURCHASE_ORDER_STATUSES = ['ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED'] as const;
export type PurchaseOrderStatus = typeof PURCHASE_ORDER_STATUSES[number];

export const purchaseOrderLineInputSchema = z.object({
  item_id: z.uuid(),
  brand_id: z.uuid(),
  pack_variant_id: z.uuid(),
  ordered_quantity: positiveDecimalSchema('ordered_quantity'),
  // Optional estimate (owner decision O-04); the actual rate is entered on the receipt.
  rate: positiveDecimalSchema('rate').optional(),
}).strict();

const linesSchema = z.array(purchaseOrderLineInputSchema)
  .min(1, 'A purchase order needs at least one line')
  .max(MAX_PURCHASE_ORDER_LINES)
  .superRefine((lines, ctx) => {
    // One pack variant at most once per PO (ADR-0010 A-03), so receipts match a single line.
    const seen = new Set<string>();
    lines.forEach((line, i) => {
      if (seen.has(line.pack_variant_id)) {
        ctx.addIssue({ code: 'custom', path: [i, 'pack_variant_id'], message: 'The same pack variant appears more than once; combine the quantities into one line' });
      }
      seen.add(line.pack_variant_id);
    });
  });

export const purchaseOrderInputSchema = z.object({
  supplier_id: z.uuid(),
  order_date: orderDateSchema,
  lines: linesSchema,
}).strict();

/** Edit (only while no receipt exists): nonempty subset; `lines` replaces the whole line set. */
export const purchaseOrderPatchSchema = z.object({
  supplier_id: z.uuid().optional(),
  order_date: orderDateSchema.optional(),
  lines: linesSchema.optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'At least one of supplier_id, order_date, lines is required');

export const purchaseOrderReasonSchema = z.object({
  reason: z.string().trim().min(1, 'reason is required').max(500)
    .refine(value => !value.includes('\u0000'), 'NUL characters are invalid'),
}).strict();

export const purchaseOrderListQuerySchema = z.object({
  status: z.enum(PURCHASE_ORDER_STATUSES).optional(),
}).strict();

export const purchaseOrderIdSchema = z.uuid();
export type PurchaseOrderInput = z.infer<typeof purchaseOrderInputSchema>;
export type PurchaseOrderPatch = z.infer<typeof purchaseOrderPatchSchema>;
export type PurchaseOrderLineInput = z.infer<typeof purchaseOrderLineInputSchema>;
export type PurchaseOrderListQuery = z.infer<typeof purchaseOrderListQuerySchema>;

export interface PurchaseOrderLine {
  id: string;
  line_no: number;
  item_id: string;
  brand_id: string;
  pack_variant_id: string;
  ordered_quantity: string;
  rate: string | null;
  /** Derived from linked receipt lines, in packs (ADR-0010 D-04). */
  received_quantity: string;
  pending_quantity: string;
  excess_quantity: string;
}

export interface PurchaseOrderReceiptRef {
  id: string;
  receipt_date: string;
  supplier_bill_no: string | null;
  created_at: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  branch_id: string;
  supplier_id: string;
  order_date: string;
  status: PurchaseOrderStatus;
  status_reason: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  lines: PurchaseOrderLine[];
  receipts: PurchaseOrderReceiptRef[];
}

export interface PurchaseOrderSummary {
  id: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string;
  order_date: string;
  status: PurchaseOrderStatus;
  line_count: number;
  receipt_count: number;
  created_at: string;
  updated_at: string;
}
