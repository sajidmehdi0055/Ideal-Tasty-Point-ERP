/**
 * Exact decimal arithmetic for stock quantities (NUMERIC(18,6) on the
 * server, decimal strings on the wire). Values are held as BigInt counts of
 * millionths so a client-side preview never drifts like float maths would
 * (e.g. 0.1 + 0.2). The server stays the final authority on every balance.
 */
export const QUANTITY_DECIMALS = 6;
const SCALE = 10n ** BigInt(QUANTITY_DECIMALS);

/** Same shape the server accepts for an adjustment quantity (before the sign). */
export const QUANTITY_INPUT_PATTERN = /^\d{1,12}(\.\d{1,6})?$/;

const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;
const GROUPING = new Intl.NumberFormat('en-US');

/** Parses a plain decimal string into millionths; `null` if it is not one or has more than 6 decimals. */
export function parseQuantity(text: string): bigint | null {
  const match = DECIMAL_PATTERN.exec(text.trim());
  if (!match) return null;
  const [, sign, whole = '0', fraction = ''] = match;
  if (fraction.length > QUANTITY_DECIMALS) {
    // The server pads to 6 places; anything longer must only be trailing zeros.
    if (!/^0*$/.test(fraction.slice(QUANTITY_DECIMALS))) return null;
  }
  const paddedFraction = fraction.slice(0, QUANTITY_DECIMALS).padEnd(QUANTITY_DECIMALS, '0');
  const value = BigInt(whole) * SCALE + BigInt(paddedFraction);
  return sign === '-' ? -value : value;
}

/** Plain decimal string without trailing zeros, e.g. 2_500_000n → "2.5". */
export function toDecimalString(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE).toString().padStart(QUANTITY_DECIMALS, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole.toString()}${fraction ? `.${fraction}` : ''}`;
}

/** Display form: thousands separators, no trailing zeros, true minus sign. */
export function formatQuantityValue(value: bigint, options: { signed?: boolean } = {}): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE).toString().padStart(QUANTITY_DECIMALS, '0').replace(/0+$/, '');
  const body = `${GROUPING.format(whole)}${fraction ? `.${fraction}` : ''}`;
  if (negative) return `−${body}`;
  if (options.signed && value > 0n) return `+${body}`;
  return body;
}

/** Formats a server quantity string; shows the raw text if it cannot be parsed. */
export function formatQuantity(text: string, options: { signed?: boolean } = {}): string {
  const value = parseQuantity(text);
  return value === null ? text : formatQuantityValue(value, options);
}

export function isZeroQuantity(text: string): boolean {
  return parseQuantity(text) === 0n;
}

export function isPositiveQuantity(text: string): boolean {
  const value = parseQuantity(text);
  return value !== null && value > 0n;
}
