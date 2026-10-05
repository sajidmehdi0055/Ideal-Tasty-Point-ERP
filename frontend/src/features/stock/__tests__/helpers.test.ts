import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/api-client';
import { createAdjustment, listBalances, listMovements, updateLocation } from '../api';
import { codeSuffix, describeStockError, formatDateTime } from '../format';
import { locationPath, orderLocationTree } from '../locations-tree';
import {
  formatQuantity,
  formatQuantityValue,
  isPositiveQuantity,
  isZeroQuantity,
  parseQuantity,
  QUANTITY_INPUT_PATTERN,
  toDecimalString,
} from '../quantity';
import type { StockLocation } from '../types';

const loc = (id: string, name: string, type: StockLocation['location_type'], parent: string | null = null, active = true): StockLocation => ({
  id,
  branch_id: 'b',
  name,
  location_type: type,
  parent_id: parent,
  active,
  created_at: '2026-09-26T00:00:00Z',
  updated_at: '2026-09-26T00:00:00Z',
});

describe('quantity helpers (exact decimals)', () => {
  it('parses server NUMERIC(18,6) strings and plain inputs into millionths', () => {
    expect(parseQuantity('72.000000')).toBe(72_000_000n);
    expect(parseQuantity('-2.5')).toBe(-2_500_000n);
    expect(parseQuantity('0.000001')).toBe(1n);
    expect(parseQuantity('12')).toBe(12_000_000n);
    expect(parseQuantity('1.2345678')).toBeNull();
    expect(parseQuantity('1.5000000')).toBe(1_500_000n);
    expect(parseQuantity('abc')).toBeNull();
    expect(parseQuantity('1e3')).toBeNull();
    expect(parseQuantity('')).toBeNull();
  });

  it('adds without float drift (0.1 + 0.2 = 0.3)', () => {
    const sum = (parseQuantity('0.1') ?? 0n) + (parseQuantity('0.2') ?? 0n);
    expect(toDecimalString(sum)).toBe('0.3');
    expect(toDecimalString((parseQuantity('72') ?? 0n) - (parseQuantity('2.5') ?? 0n))).toBe('69.5');
  });

  it('formats for display: no trailing zeros, grouping, true minus, optional plus', () => {
    expect(formatQuantity('72.000000')).toBe('72');
    expect(formatQuantity('38.500000')).toBe('38.5');
    expect(formatQuantity('1234567.250000')).toBe('1,234,567.25');
    expect(formatQuantity('-10.000000', { signed: true })).toBe('−10');
    expect(formatQuantity('32.000000', { signed: true })).toBe('+32');
    expect(formatQuantityValue(-8_000_000n)).toBe('−8');
    expect(formatQuantity('not-a-number')).toBe('not-a-number');
  });

  it('knows zero and positive balances', () => {
    expect(isZeroQuantity('0.000000')).toBe(true);
    expect(isZeroQuantity('0.000001')).toBe(false);
    expect(isPositiveQuantity('0.000001')).toBe(true);
    expect(isPositiveQuantity('0')).toBe(false);
  });

  it('accepts the same quantity shape as the server (≤ 12 digits, ≤ 6 decimals)', () => {
    expect(QUANTITY_INPUT_PATTERN.test('2.5')).toBe(true);
    expect(QUANTITY_INPUT_PATTERN.test('999999999999.999999')).toBe(true);
    expect(QUANTITY_INPUT_PATTERN.test('1234567890123')).toBe(false);
    expect(QUANTITY_INPUT_PATTERN.test('1.1234567')).toBe(false);
    expect(QUANTITY_INPUT_PATTERN.test('-1')).toBe(false);
    expect(QUANTITY_INPUT_PATTERN.test('.5')).toBe(false);
  });
});

describe('location tree', () => {
  const locations = [
    loc('k', 'Upper Kitchen', 'KITCHEN'),
    loc('f2', 'Freezer 2', 'FREEZER', 'm'),
    loc('m', 'Main Store', 'STORE'),
    loc('f1', 'freezer 1', 'FREEZER', 'm'),
    loc('o', 'Orphan Freezer', 'FREEZER', 'missing'),
  ];

  it('orders stores/kitchens by name with their freezers under them; keeps orphans at the end', () => {
    const rows = orderLocationTree(locations);
    expect(rows.map(row => [row.location.id, row.depth])).toEqual([
      ['m', 0],
      ['f1', 1],
      ['f2', 1],
      ['k', 0],
      ['o', 1],
    ]);
    expect(rows[1]?.parent?.id).toBe('m');
    expect(rows[4]?.parent).toBeUndefined();
  });

  it('builds the parent path for a freezer', () => {
    const byId = new Map(locations.map(location => [location.id, location]));
    expect(locationPath(locations[1]!, byId)).toBe('Main Store › Freezer 2');
    expect(locationPath(locations[0]!, byId)).toBe('Upper Kitchen');
  });
});

describe('format', () => {
  it('shows times in Asia/Karachi (UTC+5) as "03 Oct 2026, 10:12"', () => {
    expect(formatDateTime('2026-10-03T05:12:00Z')).toBe('03 Oct 2026, 10:12');
    expect(formatDateTime('2026-09-27T19:05:00Z')).toBe('28 Sep 2026, 00:05');
    expect(formatDateTime('garbage')).toBe('garbage');
  });

  it('maps errors to page messages without leaking internals', () => {
    expect(describeStockError(new ApiError(403, 'FORBIDDEN', 'x'))).toMatch(/only owner or manager/i);
    expect(describeStockError(new ApiError(401, 'UNAUTHENTICATED', 'x'))).toMatch(/not signed in/i);
    expect(describeStockError(new ApiError(404, 'NOT_FOUND', 'x'))).toMatch(/no longer exists — refresh/i);
    expect(describeStockError(new ApiError(500, 'INTERNAL_ERROR', 'Operation failed'))).toBe('Operation failed');
    expect(describeStockError(new Error('boom'))).toBe('Something went wrong.');
    expect(codeSuffix(new ApiError(409, 'NEGATIVE_BALANCE', 'x'))).toBe('(409 · NEGATIVE_BALANCE)');
  });
});

describe('stock api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(body: unknown = []) {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('sends only the two filters the server accepts', async () => {
    const fetchMock = stubFetch();
    await listBalances();
    await listBalances({ location_id: 'L1' });
    await listMovements({ item_id: 'I1', location_id: 'L1' });
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      '/api/inventory/stock/balances',
      '/api/inventory/stock/balances?location_id=L1',
      '/api/inventory/stock/movements?item_id=I1&location_id=L1',
    ]);
  });

  it('posts an adjustment with a decimal-string delta and patches a location by id', async () => {
    const fetchMock = stubFetch({});
    await createAdjustment({ item_id: 'I', location_id: 'L', quantity_delta: '-2.5', reason: 'r' });
    await updateLocation('a/b', { active: false });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/inventory/stock/adjustments');
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body as string)).toEqual({
      item_id: 'I',
      location_id: 'L',
      quantity_delta: '-2.5',
      reason: 'r',
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/inventory/locations/a%2Fb');
    expect(fetchMock.mock.calls[1]?.[1].method).toBe('PATCH');
  });
});
