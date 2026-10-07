import type { ReactNode } from 'react';

export type SummaryTileTone = 'default' | 'neutral' | 'info';

export interface SummaryTile {
  id: string;
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: SummaryTileTone;
}

const valueTone: Record<SummaryTileTone, string> = {
  default: 'text-ink',
  neutral: 'text-ink-secondary',
  info: 'text-info-600',
};

interface SummaryTilesProps {
  tiles: SummaryTile[];
  /** Accessible name for the group, e.g. "Stock summary". */
  ariaLabel?: string;
}

/** KPI cards: label, big number, one-line note. 4 columns on desktop, 2 on tablet, 1 on mobile. */
export function SummaryTiles({ tiles, ariaLabel = 'Summary' }: SummaryTilesProps) {
  return (
    <dl aria-label={ariaLabel} className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map(tile => (
        <div
          key={tile.id}
          className="flex min-w-0 flex-col gap-0.5 rounded-card border border-line bg-canvas px-[18px] py-4 shadow-card"
        >
          <dt className="truncate text-[12.5px] leading-[normal] font-semibold text-ink-muted">{tile.label}</dt>
          <dd className={`text-[26px] leading-[normal] font-extrabold tabular-nums ${valueTone[tile.tone ?? 'default']}`}>
            {tile.value}
          </dd>
          {tile.note ? <dd className="truncate text-xs leading-[normal] text-ink-muted">{tile.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}
