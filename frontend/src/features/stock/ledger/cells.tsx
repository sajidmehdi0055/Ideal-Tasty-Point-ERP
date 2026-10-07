import type { Density } from '../../../design-system/data-table';
import { formatQuantity, formatSignedQuantity, unitLabel } from '../../../lib/format';

/**
 * Item name + code. Comfortable: code on its own line under the name;
 * Compact: code on the same line (Figma R1 / R4).
 */
export function ItemNameCode({
  name,
  code,
  density,
  large = false,
}: {
  name: string;
  code: string;
  density: Density;
  /** 14px name (Movements, Figma R6); default 13px (Balances, R1). */
  large?: boolean;
}) {
  const nameClass = `truncate font-semibold text-ink ${large ? 'text-sm' : ''}`;
  if (density === 'compact') {
    return (
      <span data-item-layout="inline" className="flex min-w-0 items-baseline gap-2.5">
        <span className={nameClass}>{name}</span>
        <span className="shrink-0 text-xs font-medium text-ink-muted">{code}</span>
      </span>
    );
  }
  return (
    <span data-item-layout="stacked" className="flex min-w-0 flex-col gap-px leading-[normal]">
      <span className={nameClass}>{name}</span>
      <span className="truncate text-xs font-medium text-ink-muted">{code}</span>
    </span>
  );
}

/** "125 kg": number (≤ 3 decimals, full value in the title when rounded) then the unit label. */
export function QuantityText({ value, unit, large = false }: { value: string; unit: string | undefined; large?: boolean }) {
  const quantity = formatQuantity(value);
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap tabular-nums">
      <span
        title={quantity.full !== quantity.text ? quantity.full : undefined}
        className={`font-semibold text-ink ${large ? 'text-[15px]' : ''}`}
      >
        {quantity.text}
      </span>
      {unit ? <span className="text-[12.5px] font-medium text-ink-muted">{unitLabel(unit)}</span> : null}
    </span>
  );
}

const DIRECTION_CLASS = {
  in: 'text-success-700',
  out: 'text-danger-700',
  zero: 'text-ink',
} as const;

/** Movement change with the sign always shown: "+12.5" success, "−3" danger, then the unit. */
export function SignedQuantity({ value, unit }: { value: string; unit: string | undefined }) {
  const quantity = formatSignedQuantity(value);
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap tabular-nums">
      <span
        title={quantity.full !== quantity.text ? quantity.full : undefined}
        className={`text-sm font-bold ${DIRECTION_CLASS[quantity.direction]}`}
      >
        {quantity.text}
      </span>
      {unit ? <span className="text-[12.5px] font-medium text-ink-muted">{unitLabel(unit)}</span> : null}
    </span>
  );
}
