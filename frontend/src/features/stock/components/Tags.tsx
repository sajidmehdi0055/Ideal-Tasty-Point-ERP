import { LOCATION_TYPE_LABELS, type LocationType, type MovementType } from '../types';

type TagTone = 'neutral' | 'info' | 'success' | 'warning';

const TAG_TONES: Record<TagTone, string> = {
  neutral: 'border border-line bg-canvas-sunken text-ink-secondary',
  info: 'bg-info-50 text-info-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
};

/** `Stock/Badge/Tag` (UI-STOCK-001 local component 110:10054). */
export function Tag({ label, tone }: { label: string; tone: TagTone }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium ${TAG_TONES[tone]}`}>
      {label}
    </span>
  );
}

export function LocationTypeTag({ type }: { type: LocationType }) {
  return <Tag label={LOCATION_TYPE_LABELS[type]} tone={type === 'FREEZER' ? 'info' : 'neutral'} />;
}

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  OPENING: 'Opening',
  ADJUSTMENT: 'Adjustment',
  RECEIPT: 'Receipt',
  TRANSFER_OUT: 'Transfer out',
  TRANSFER_IN: 'Transfer in',
  TRANSFER_RETURN: 'Transfer return',
};

const MOVEMENT_TONES: Record<MovementType, TagTone> = {
  OPENING: 'info',
  ADJUSTMENT: 'warning',
  RECEIPT: 'success',
  TRANSFER_OUT: 'neutral',
  TRANSFER_IN: 'neutral',
  TRANSFER_RETURN: 'neutral',
};

export function MovementTypeTag({ type }: { type: MovementType }) {
  // An unknown future type still renders (raw name, neutral) instead of breaking the row.
  return <Tag label={MOVEMENT_TYPE_LABELS[type] ?? type} tone={MOVEMENT_TONES[type] ?? 'neutral'} />;
}

/** `Stock/Badge/Status`: dot + Active / Inactive. */
export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        active ? 'bg-success-50 text-success-700' : 'border border-line bg-canvas-sunken text-ink-muted'
      }`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-success-600' : 'bg-ink-muted'}`} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}
