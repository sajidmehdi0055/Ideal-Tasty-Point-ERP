import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatDayGroupLabel,
  formatQuantity,
  formatSignedQuantity,
  formatTime,
  groupByKarachiDay,
  karachiDayKey,
  unitLabel,
} from './format';

describe('formatQuantity', () => {
  it('adds thousands separators and drops trailing zeros', () => {
    expect(formatQuantity('1250.000000')).toEqual({ text: '1,250', full: '1,250' });
    expect(formatQuantity('38.500000')).toEqual({ text: '38.5', full: '38.5' });
    expect(formatQuantity('0.000000')).toEqual({ text: '0', full: '0' });
    expect(formatQuantity(1250.5)).toEqual({ text: '1,250.5', full: '1,250.5' });
  });

  it('shows at most 3 decimals, rounding half-up away from zero, with the full value kept', () => {
    expect(formatQuantity('1.23456')).toEqual({ text: '1.235', full: '1.23456' });
    expect(formatQuantity('1.234499')).toEqual({ text: '1.234', full: '1.234499' });
    expect(formatQuantity('2.0005')).toEqual({ text: '2.001', full: '2.0005' });
    expect(formatQuantity('999.9995')).toEqual({ text: '1,000', full: '999.9995' });
    expect(formatQuantity('-1.23456')).toEqual({ text: '−1.235', full: '−1.23456' });
  });

  it('uses a true minus sign for negatives', () => {
    expect(formatQuantity('-12.000000')).toEqual({ text: '−12', full: '−12' });
    expect(formatQuantity('-1234.5')).toEqual({ text: '−1,234.5', full: '−1,234.5' });
  });

  it('handles 12 integer digits exactly', () => {
    expect(formatQuantity('999999999999.999999')).toEqual({
      text: '1,000,000,000,000',
      full: '999,999,999,999.999999',
    });
    expect(formatQuantity('123456789012.125000')).toEqual({
      text: '123,456,789,012.125',
      full: '123,456,789,012.125',
    });
  });

  it('returns the raw input instead of throwing on invalid values', () => {
    expect(formatQuantity('abc')).toEqual({ text: 'abc', full: 'abc' });
    expect(formatQuantity('')).toEqual({ text: '', full: '' });
    expect(formatQuantity('1.1234567')).toEqual({ text: '1.1234567', full: '1.1234567' });
    expect(formatQuantity(Number.NaN)).toEqual({ text: 'NaN', full: 'NaN' });
  });
});

describe('formatSignedQuantity', () => {
  it('always shows the sign and reports direction', () => {
    expect(formatSignedQuantity('12.500000')).toEqual({ text: '+12.5', full: '+12.5', direction: 'in' });
    expect(formatSignedQuantity('-3.000000')).toEqual({ text: '−3', full: '−3', direction: 'out' });
    expect(formatSignedQuantity('0.000000')).toEqual({ text: '0', full: '0', direction: 'zero' });
    expect(formatSignedQuantity('1500.12345')).toEqual({ text: '+1,500.123', full: '+1,500.12345', direction: 'in' });
  });

  it('returns the raw input with direction zero when invalid', () => {
    expect(formatSignedQuantity('x')).toEqual({ text: 'x', full: 'x', direction: 'zero' });
  });
});

describe('unitLabel', () => {
  it('maps known codes and lowercases unknown ones', () => {
    expect(unitLabel('KG')).toBe('kg');
    expect(unitLabel('GRAM')).toBe('g');
    expect(unitLabel('LITER')).toBe('L');
    expect(unitLabel('ML')).toBe('ml');
    expect(unitLabel('PCS')).toBe('pcs');
    expect(unitLabel('DOZEN')).toBe('dozen');
  });
});

describe('Karachi date formatting', () => {
  it('formats date, time and date-time in Asia/Karachi', () => {
    expect(formatDate('2026-10-07T09:05:00Z')).toBe('07 Oct 2026');
    expect(formatTime('2026-10-07T09:05:00Z')).toBe('14:05');
    expect(formatDateTime('2026-10-07T09:05:00Z')).toBe('07 Oct 2026, 14:05');
    expect(formatDateTime(new Date('2026-09-03T05:12:00Z'))).toBe('03 Sep 2026, 10:12');
  });

  it('crosses Karachi midnight correctly', () => {
    expect(karachiDayKey('2026-10-06T19:30:00Z')).toBe('2026-10-07');
    expect(formatDateTime('2026-10-06T19:30:00Z')).toBe('07 Oct 2026, 00:30');
    expect(karachiDayKey('2026-10-06T18:59:59Z')).toBe('2026-10-06');
    expect(formatTime('2026-10-06T18:59:59Z')).toBe('23:59');
  });

  it('returns the raw string for invalid dates', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
    expect(formatTime('not-a-date')).toBe('not-a-date');
    expect(formatDateTime('not-a-date')).toBe('not-a-date');
    expect(karachiDayKey('not-a-date')).toBe('not-a-date');
  });
});

describe('formatDayGroupLabel', () => {
  // 07 Oct 2026, 00:30 in Karachi (still 06 Oct in UTC).
  const now = new Date('2026-10-06T19:30:00Z');

  it('labels today, yesterday and older days relative to Karachi now', () => {
    expect(formatDayGroupLabel('2026-10-07', now)).toBe('Today');
    expect(formatDayGroupLabel('2026-10-06', now)).toBe('Yesterday');
    expect(formatDayGroupLabel('2026-10-05', now)).toBe('Mon 05 Oct 2026');
    expect(formatDayGroupLabel('2026-09-30', now)).toBe('Wed 30 Sep 2026');
  });

  it('handles yesterday across a month boundary', () => {
    expect(formatDayGroupLabel('2026-09-30', new Date('2026-10-01T06:00:00Z'))).toBe('Yesterday');
  });

  it('returns an unrecognised key unchanged', () => {
    expect(formatDayGroupLabel('garbage', now)).toBe('garbage');
  });
});

describe('groupByKarachiDay', () => {
  it('groups by Karachi day and preserves input order', () => {
    const now = new Date('2026-10-07T09:00:00Z');
    const rows = [
      { id: 'a', at: '2026-10-07T08:00:00Z' },
      { id: 'b', at: '2026-10-06T19:30:00Z' }, // 07 Oct 00:30 Karachi
      { id: 'c', at: '2026-10-06T18:30:00Z' }, // 06 Oct 23:30 Karachi
      { id: 'd', at: '2026-10-05T10:00:00Z' },
    ];
    const groups = groupByKarachiDay(rows, row => row.at, now);
    expect(groups.map(g => [g.key, g.label, g.rows.map(r => r.id)])).toEqual([
      ['2026-10-07', 'Today', ['a', 'b']],
      ['2026-10-06', 'Yesterday', ['c']],
      ['2026-10-05', 'Mon 05 Oct 2026', ['d']],
    ]);
  });

  it('returns no groups for no rows', () => {
    expect(groupByKarachiDay([], () => '')).toEqual([]);
  });
});
