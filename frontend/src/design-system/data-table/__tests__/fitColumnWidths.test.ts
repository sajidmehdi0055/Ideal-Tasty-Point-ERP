import { describe, expect, it } from 'vitest';
import { fitColumnWidths, type ColumnDef } from '..';

// Same shape as Item Master (UI-REFRESH-001): one flexible column + defaults.
const COLUMNS: ColumnDef[] = [
  { id: 'item', label: 'Item', required: true, minWidth: 220 },
  { id: 'type', label: 'Primary type', minWidth: 140, defaultWidth: 220 },
  { id: 'base_uom', label: 'Base unit', minWidth: 90, defaultWidth: 130 },
  { id: 'brand', label: 'Brand', minWidth: 120, defaultWidth: 180 },
  { id: 'status', label: 'Status', minWidth: 100, defaultWidth: 130 },
  { id: 'actions', label: 'Actions', required: true, minWidth: 96, defaultWidth: 120 },
];
const none = () => undefined;
const total = (widths: Map<string, number | undefined>) =>
  COLUMNS.reduce((sum, column) => sum + (widths.get(column.id) ?? column.minWidth), 0);

describe('fitColumnWidths', () => {
  it('keeps the default widths when they fit (1440px card)', () => {
    const widths = fitColumnWidths(COLUMNS, none, 1318);
    expect(Object.fromEntries(widths)).toEqual({
      item: undefined,
      type: 220,
      base_uom: 130,
      brand: 180,
      status: 130,
      actions: 120,
    });
  });

  it('keeps the default widths while the container width is unknown', () => {
    expect(fitColumnWidths(COLUMNS, none, undefined).get('type')).toBe(220);
    expect(fitColumnWidths(COLUMNS, none, 0).get('type')).toBe(220);
  });

  it('shrinks default widths proportionally so every column fits a 1024px card (≈902px)', () => {
    const widths = fitColumnWidths(COLUMNS, none, 902);
    expect(total(widths)).toBeLessThanOrEqual(902);
    for (const column of COLUMNS) {
      const width = widths.get(column.id);
      if (column.defaultWidth === undefined) expect(width).toBeUndefined();
      else {
        expect(width).toBeGreaterThanOrEqual(column.minWidth);
        expect(width).toBeLessThan(column.defaultWidth);
      }
    }
  });

  it('never goes below minWidth; when even the minimums do not fit, the table keeps its inner scroll', () => {
    const widths = fitColumnWidths(COLUMNS, none, 500);
    for (const column of COLUMNS) {
      if (column.defaultWidth !== undefined) expect(widths.get(column.id)).toBe(column.minWidth);
    }
  });

  it('honours widths the user stored and shrinks only the defaults', () => {
    const storedWidthOf = (id: string) => (id === 'brand' ? 200 : undefined);
    const widths = fitColumnWidths(COLUMNS, storedWidthOf, 902);
    expect(widths.get('brand')).toBe(200);
    expect(widths.get('type')).toBeLessThan(220);
    expect(total(widths)).toBeLessThanOrEqual(902);
  });
});
