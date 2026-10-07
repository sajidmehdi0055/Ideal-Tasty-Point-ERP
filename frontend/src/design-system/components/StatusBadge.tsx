import { Badge, type BadgeTone } from './Badge';

interface StatusBadgeProps {
  label: string;
  tone: BadgeTone;
}

/** Original `label`-prop API, kept for existing screens; renders the shared `Badge`. */
export function StatusBadge({ label, tone }: StatusBadgeProps) {
  return <Badge tone={tone}>{label}</Badge>;
}
