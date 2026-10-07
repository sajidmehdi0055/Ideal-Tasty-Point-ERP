import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-neutral-50 text-neutral-700',
  info: 'bg-info-50 text-info-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
};

const dotClasses: Record<BadgeTone, string> = {
  neutral: 'bg-neutral-600',
  info: 'bg-info-600',
  success: 'bg-success-600',
  warning: 'bg-warning-600',
  danger: 'bg-danger-600',
};

interface BadgeProps {
  tone?: BadgeTone;
  /** Small coloured dot before the text. Colour is never the only signal — the text always says the status. */
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

/** Pill-shaped status/type label (location type, item status, …). */
export function Badge({ tone = 'neutral', dot = false, children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] leading-[normal] font-semibold ${toneClasses[tone]} ${className}`}
    >
      {dot ? <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClasses[tone]}`} /> : null}
      {children}
    </span>
  );
}

/** Dot + "Active" / "Inactive" — the one shared rendering of a master record's active flag. */
export function ActiveStatusBadge({ active }: { active: boolean }) {
  return (
    <Badge tone={active ? 'success' : 'neutral'} dot>
      {active ? 'Active' : 'Inactive'}
    </Badge>
  );
}
