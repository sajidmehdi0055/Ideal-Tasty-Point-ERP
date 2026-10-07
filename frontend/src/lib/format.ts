/**
 * Shared display formatting (UI-REFRESH-001). Screens adopt these helpers so
 * quantities, units and Asia/Karachi dates look the same everywhere.
 *
 * Quantities use the exact BigInt millionths arithmetic from
 * features/stock/quantity.ts (server NUMERIC(18,6) decimal strings), so no
 * float rounding can creep in.
 *
 * Invalid input never throws: quantity helpers return the raw input as both
 * `text` and `full` (direction 'zero' for the signed form); date helpers
 * return the raw input string. The caller still shows something, and the
 * oddity stays visible instead of being hidden as "0".
 */
import { QUANTITY_DECIMALS, parseQuantity } from '../features/stock/quantity';

const SCALE = 10n ** BigInt(QUANTITY_DECIMALS);
const DISPLAY_DECIMALS = 3;
const DISPLAY_STEP = 10n ** BigInt(QUANTITY_DECIMALS - DISPLAY_DECIMALS);
const GROUPING = new Intl.NumberFormat('en-US');
const MINUS = '−';

export interface FormattedQuantity {
  /** Display text: thousands separators, at most 3 decimals, no trailing zeros. */
  text: string;
  /** Full value (up to 6 decimals, no trailing zeros) for a tooltip/title; equals `text` when nothing was rounded. */
  full: string;
}

export interface FormattedSignedQuantity extends FormattedQuantity {
  direction: 'in' | 'out' | 'zero';
}

/** Unsigned body of a non-negative millionths value, e.g. 1_250_500_000n → "1,250.5". */
function body(absolute: bigint): string {
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE).toString().padStart(QUANTITY_DECIMALS, '0').replace(/0+$/, '');
  return `${GROUPING.format(whole)}${fraction ? `.${fraction}` : ''}`;
}

/** Rounds |value| to 3 decimals, half-up away from zero, still in millionths. */
function roundForDisplay(absolute: bigint): bigint {
  return ((absolute + DISPLAY_STEP / 2n) / DISPLAY_STEP) * DISPLAY_STEP;
}

function parse(value: string | number): bigint | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? parseQuantity(String(value)) : null;
  }
  return parseQuantity(value);
}

function build(value: bigint, signed: boolean): FormattedQuantity {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const sign = negative ? MINUS : signed && value > 0n ? '+' : '';
  const rounded = roundForDisplay(absolute);
  // A tiny value that rounds to zero keeps its sign so "in"/"out" stays truthful (e.g. "−0").
  return { text: `${sign}${body(rounded)}`, full: `${sign}${body(absolute)}` };
}

/** "38.500000" → { text: "38.5", full: "38.5" }; "1.23456" → { text: "1.235", full: "1.23456" }; negatives use "−". */
export function formatQuantity(value: string | number): FormattedQuantity {
  const parsed = parse(value);
  if (parsed === null) return { text: String(value), full: String(value) };
  return build(parsed, false);
}

/** Movement quantity with the sign always shown: "+12.5" (in), "−3" (out), "0" (zero). */
export function formatSignedQuantity(value: string): FormattedSignedQuantity {
  const parsed = parseQuantity(value);
  if (parsed === null) return { text: value, full: value, direction: 'zero' };
  const direction = parsed > 0n ? 'in' : parsed < 0n ? 'out' : 'zero';
  return { ...build(parsed, true), direction };
}

const UNIT_LABELS: Record<string, string> = {
  KG: 'kg',
  GRAM: 'g',
  LITER: 'L',
  ML: 'ml',
  PCS: 'pcs',
};

/** Display label for a UOM code (KG → kg, LITER → L, …); unknown codes are lowercased. */
export function unitLabel(code: string): string {
  return UNIT_LABELS[code.toUpperCase()] ?? code.toLowerCase();
}

// ---------------------------------------------------------------------------
// Dates — always Asia/Karachi, independent of the device's zone. Month and
// weekday names come from fixed tables so ICU quirks ("Sept") never leak in.
// ---------------------------------------------------------------------------

const KARACHI_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Karachi',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface KarachiParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

function karachiParts(iso: string | Date): KarachiParts | null {
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts: Record<string, string> = {};
  for (const part of KARACHI_PARTS.formatToParts(date)) parts[part.type] = part.value;
  const { year = '', month = '', day = '', hour = '', minute = '' } = parts;
  return { year, month, day, hour, minute };
}

function raw(iso: string | Date): string {
  return iso instanceof Date ? String(iso) : iso;
}

function monthName(month: string): string {
  return MONTHS[Number(month) - 1] ?? month;
}

/** "07 Oct 2026" (Asia/Karachi). */
export function formatDate(iso: string | Date): string {
  const p = karachiParts(iso);
  return p ? `${p.day} ${monthName(p.month)} ${p.year}` : raw(iso);
}

/** "14:05" — 24-hour clock, Asia/Karachi. */
export function formatTime(iso: string | Date): string {
  const p = karachiParts(iso);
  return p ? `${p.hour}:${p.minute}` : raw(iso);
}

/** "07 Oct 2026, 14:05" (Asia/Karachi) — same style as features/stock/format.ts. */
export function formatDateTime(iso: string | Date): string {
  const p = karachiParts(iso);
  return p ? `${p.day} ${monthName(p.month)} ${p.year}, ${p.hour}:${p.minute}` : raw(iso);
}

/** Karachi calendar date "2026-10-07", for grouping rows by day. */
export function karachiDayKey(iso: string | Date): string {
  const p = karachiParts(iso);
  return p ? `${p.year}-${p.month}-${p.day}` : raw(iso);
}

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Day key of the calendar day before `dayKey` (pure date arithmetic, no zone involved). */
function previousDayKey(dayKey: string): string {
  const [, y, m, d] = DAY_KEY_PATTERN.exec(dayKey) ?? [];
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d) - 1));
  return date.toISOString().slice(0, 10);
}

/** "Today" / "Yesterday" / "Mon 05 Oct 2026", relative to Karachi's current date. */
export function formatDayGroupLabel(dayKey: string, now: Date = new Date()): string {
  const match = DAY_KEY_PATTERN.exec(dayKey);
  if (!match) return dayKey;
  const todayKey = karachiDayKey(now);
  if (dayKey === todayKey) return 'Today';
  if (DAY_KEY_PATTERN.test(todayKey) && dayKey === previousDayKey(todayKey)) return 'Yesterday';
  const [, y = '', m = '', d = ''] = match;
  const weekday = WEEKDAYS[new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).getUTCDay()];
  return `${weekday} ${d} ${monthName(m)} ${y}`;
}

/**
 * Groups rows by Karachi calendar day. Groups appear in order of first
 * appearance and rows keep their input order (the server sends newest first).
 */
export function groupByKarachiDay<T>(
  rows: T[],
  getIso: (row: T) => string,
  now: Date = new Date(),
): Array<{ key: string; label: string; rows: T[] }> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = karachiDayKey(getIso(row));
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  return [...groups].map(([key, groupRows]) => ({ key, label: formatDayGroupLabel(key, now), rows: groupRows }));
}
