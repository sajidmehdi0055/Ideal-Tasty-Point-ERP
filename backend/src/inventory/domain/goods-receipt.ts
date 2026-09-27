import { z } from 'zod';
import { isValidCalendarDate } from './purchase-record.js';

// ADR-0009 (owner decisions 2026-09-27). Quantities and rates travel as
// decimal strings end to end (never JSON numbers), matching NUMERIC(18,6).
function positiveDecimalSchema(label: string) {
  return z.string()
    .regex(/^\d{1,12}(\.\d{1,6})?$/, `${label} must be a plain decimal string, e.g. "10" or "10.5"`)
    .refine(value => Number(value) > 0, `${label} must be greater than 0`);
}

// Format and calendar validity are checked here; "not in the future" and
// "not before opening stock" are checked in the database transaction against
// the Asia/Karachi business date (ADR-0009 A-01).
const receiptDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'receipt_date must be a plain calendar date string, e.g. "2026-09-27"')
  .refine(isValidCalendarDate, 'receipt_date must be a valid calendar date');

export const MAX_RECEIPT_LINES = 100;

export const goodsReceiptLineInputSchema = z.object({
  item_id: z.uuid(),
  brand_id: z.uuid(),
  pack_variant_id: z.uuid(),
  pack_quantity: positiveDecimalSchema('pack_quantity'),
  rate: positiveDecimalSchema('rate'),
  // S-06 (ADR-0010 O-02): required on every line of a PO-linked receipt, absent on a direct receipt.
  purchase_order_line_id: z.uuid().optional(),
}).strict();

export const goodsReceiptInputSchema = z.object({
  supplier_id: z.uuid(),
  location_id: z.uuid(),
  receipt_date: receiptDateSchema,
  supplier_bill_no: z.string().trim().min(1).max(100).refine(value => !value.includes('\u0000'), 'NUL characters are invalid').optional(),
  // S-06 (ADR-0010 O-02): optional link to a Purchase Order; without it this is an S-05 direct receipt.
  purchase_order_id: z.uuid().optional(),
  lines: z.array(goodsReceiptLineInputSchema).min(1, 'A receipt needs at least one line').max(MAX_RECEIPT_LINES),
}).strict().superRefine((receipt, ctx) => {
  const linked = receipt.purchase_order_id !== undefined;
  const seen = new Set<string>();
  receipt.lines.forEach((line, i) => {
    const path = ['lines', i, 'purchase_order_line_id'];
    if (linked && line.purchase_order_line_id === undefined) {
      ctx.addIssue({ code: 'custom', path, message: 'Every line of a purchase order receipt needs purchase_order_line_id (ADR-0010 A-03)' });
    }
    if (!linked && line.purchase_order_line_id !== undefined) {
      ctx.addIssue({ code: 'custom', path, message: 'purchase_order_line_id needs purchase_order_id on the receipt' });
    }
    if (line.purchase_order_line_id !== undefined) {
      if (seen.has(line.purchase_order_line_id)) ctx.addIssue({ code: 'custom', path, message: 'A purchase order line can appear only once per receipt' });
      seen.add(line.purchase_order_line_id);
    }
  });
});

export const goodsReceiptIdSchema = z.uuid();
export type GoodsReceiptInput = z.infer<typeof goodsReceiptInputSchema>;
export type GoodsReceiptLineInput = z.infer<typeof goodsReceiptLineInputSchema>;

export interface GoodsReceiptLine {
  id: string;
  line_no: number;
  item_id: string;
  brand_id: string;
  pack_variant_id: string;
  pack_quantity: string;
  conversion_factor: string;
  base_quantity: string;
  rate: string;
  purchase_record_id: string;
  stock_movement_id: string;
  purchase_order_line_id: string | null;
}

export interface GoodsReceipt {
  id: string;
  supplier_id: string;
  location_id: string;
  receipt_date: string;
  supplier_bill_no: string | null;
  purchase_order_id: string | null;
  created_at: string;
  lines: GoodsReceiptLine[];
}

export interface GoodsReceiptSummary {
  id: string;
  supplier_id: string;
  supplier_name: string;
  location_id: string;
  location_name: string;
  receipt_date: string;
  supplier_bill_no: string | null;
  purchase_order_id: string | null;
  po_number: string | null;
  line_count: number;
  created_at: string;
}
