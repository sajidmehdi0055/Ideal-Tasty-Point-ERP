import { Card, StatusBadge } from '../../design-system/components';

interface PlaceholderPageProps {
  title: string;
  description: string;
}

/** Marks a screen that exists only as navigation + layout, not wired to any unmerged API. */
export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <Card title={title}>
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <StatusBadge label="Pending S-02 backend merge" tone="warning" />
        <p className="max-w-md text-sm text-ink-muted">{description}</p>
      </div>
    </Card>
  );
}
