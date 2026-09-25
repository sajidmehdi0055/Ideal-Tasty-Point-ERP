import { z } from 'zod';

// Transported as decimal strings end-to-end (never JSON numbers), same as
// Pack Variant's conversion_factor, so the NUMERIC(18,6) "never float"
// guarantee holds at the API boundary too, not only at rest.
function positiveDecimalSchema(label: string) {
  return z.string()
    .regex(/^\d{1,12}(\.\d{1,6})?$/, `${label} must be a plain decimal string, e.g. "10" or "10.5"`)
    .refine(value => Number(value) > 0, `${label} must be greater than 0`);
}

function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// Date.parse/`new Date(...)` silently roll over an out-of-range day (e.g.
// "2026-02-30" becomes March 2) instead of rejecting it, so calendar
// validity is checked manually against the actual days-in-month/leap-year
// rules rather than relying on JS Date parsing.
function isValidCalendarDate(value: string): boolean {
  const parts = value.split('-').map(Number);
  const year = parts[0]; const month = parts[1]; const day = parts[2];
  if (year === undefined || month === undefined || day === undefined) return false;
  if (month < 1 || month > 12) return false;
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const days = daysInMonth[month - 1];
  if (days === undefined) return false;
  return day >= 1 && day <= days;
}

const purchaseDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'purchase_date must be a plain calendar date string, e.g. "2026-09-20"')
  .refine(isValidCalendarDate, 'purchase_date must be a valid calendar date')
  // Backdated/historical entries are explicitly allowed; only future dates are rejected.
  .refine(value => value <= todayUtcDateString(), 'purchase_date cannot be in the future');

export const purchaseRecordInputSchema = z.object({
  supplier_id: z.uuid(),
  item_id: z.uuid(),
  brand_id: z.uuid(),
  pack_variant_id: z.uuid(),
  quantity: positiveDecimalSchema('quantity'),
  rate: positiveDecimalSchema('rate'),
  purchase_date: purchaseDateSchema,
}).strict();

export const purchaseRecordIdSchema = z.uuid();
export type PurchaseRecordInput = z.infer<typeof purchaseRecordInputSchema>;
export interface PurchaseRecord {
  id: string;
  supplier_id: string;
  item_id: string;
  brand_id: string;
  pack_variant_id: string;
  quantity: string;
  rate: string;
  purchase_date: string;
  created_at: string;
}

export const rateComparisonQuerySchema = z.object({
  item_id: z.uuid(),
  brand_id: z.uuid(),
  pack_variant_id: z.uuid(),
}).strict();
export type RateComparisonQuery = z.infer<typeof rateComparisonQuerySchema>;

export interface SupplierRateBreakdownEntry {
  supplier_id: string;
  supplier_name: string;
  purchase_count: number;
  latest_rate: string;
  average_rate: string;
}

/**
 * "Last 3 purchases" default view only, no custom date-range filtering (deferred).
 * Any stat that cannot yet be computed (fewer than 2-3 purchase records exist
 * for the combination) is null rather than erroring.
 */
export interface RateComparisonResult {
  item_id: string;
  brand_id: string;
  pack_variant_id: string;
  records_considered: number;
  current_rate: string | null;
  previous_rate: string | null;
  average_rate_last_3: string | null;
  current_rate_per_base_uom: string | null;
  percentage_change: string | null;
  supplier_breakdown: SupplierRateBreakdownEntry[];
}
