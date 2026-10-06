import { afterEach, describe, expect, it, vi } from 'vitest';
import { isValidCalendarDate, purchaseRecordInputSchema } from '../../src/inventory/domain/purchase-record.js';

const input = {
  supplier_id: '11111111-1111-4111-8111-111111111111',
  item_id: '22222222-2222-4222-8222-222222222222',
  brand_id: '33333333-3333-4333-8333-333333333333',
  pack_variant_id: '44444444-4444-4444-8444-444444444444',
  quantity: '1', rate: '10',
};
afterEach(() => vi.useRealTimers());

describe('purchase date uses the Karachi business day (ADR-0009 A-01)', () => {
  it.each([
    ['2026-09-30T18:59:59Z', false],
    ['2026-09-30T19:00:00Z', true],
    ['2026-09-30T23:59:59Z', true],
    ['2026-10-01T00:00:00Z', true],
  ])('validates October 1 at %s', (now, accepted) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    expect(purchaseRecordInputSchema.safeParse({ ...input, purchase_date: '2026-10-01' }).success).toBe(accepted);
    expect(purchaseRecordInputSchema.safeParse({ ...input, purchase_date: '2026-09-29' }).success).toBe(true);
    expect(purchaseRecordInputSchema.safeParse({ ...input, purchase_date: '2026-10-02' }).success).toBe(false);
  });

  it.each(['0000-01-01', '0000-02-29', '2026-02-29', '2026-04-31'])('rejects invalid calendar date %s', date => {
    expect(isValidCalendarDate(date)).toBe(false);
    expect(purchaseRecordInputSchema.safeParse({ ...input, purchase_date: date }).success).toBe(false);
  });

  it('retains valid historical dates and leap years', () => {
    expect(isValidCalendarDate('0001-01-01')).toBe(true);
    expect(isValidCalendarDate('2000-02-29')).toBe(true);
    expect(isValidCalendarDate('1900-02-29')).toBe(false);
  });
});