import type { ReactNode } from 'react';
import type { Density } from './types';
import type { TableSettings } from './useTableSettings';

interface DataTableToolbarProps {
  /** Filters: location select, search, checkboxes … */
  start?: ReactNode;
  /** Result count, Columns menu, density toggle. */
  end?: ReactNode;
  className?: string;
}

/** Row above the table: filters on the left, count + table settings on the right; wraps on narrow screens. */
export function DataTableToolbar({ start, end, className = '' }: DataTableToolbarProps) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 ${className}`}>
      {start ? <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">{start}</div> : null}
      {end ? <div className="ml-auto flex flex-wrap items-center justify-end gap-3">{end}</div> : null}
    </div>
  );
}

/** "8 balances · 3 zero hidden". Polite live region so filter changes are announced. */
export function ResultCount({ children }: { children: ReactNode }) {
  return (
    <p aria-live="polite" className="text-[12.5px] font-medium whitespace-nowrap text-ink-muted tabular-nums">
      {children}
    </p>
  );
}

export const TRUNCATION_MESSAGE = 'Showing the first 200 items. Search or choose a location to see the rest.';

/** Info banner shown above the table when the API truncated the list (X-Result-Truncated). */
export function TruncationBanner({ children = TRUNCATION_MESSAGE, className = '' }: { children?: ReactNode; className?: string }) {
  return (
    <div role="status" className={`rounded-control bg-info-50 px-3.5 py-2.5 text-[13px] font-semibold text-info-700 ${className}`}>
      {children}
    </div>
  );
}

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
];

/** Comfortable / Compact segmented control. Renders nothing on touch/tablet/mobile (`settings.enabled` false). */
export function DensityToggle({ settings }: { settings: TableSettings }) {
  if (!settings.enabled) return null;
  return (
    <div role="group" aria-label="Row density" className="inline-flex gap-0.5 rounded-control bg-canvas-muted p-[3px]">
      {DENSITY_OPTIONS.map(option => {
        const selected = settings.density === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => settings.setDensity(option.value)}
            className={`h-[27px] rounded-[7px] px-2.5 text-[12.5px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
              selected ? 'bg-canvas font-semibold text-ink shadow-card' : 'font-medium text-ink-muted hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
