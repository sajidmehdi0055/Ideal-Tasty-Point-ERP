import type { ReactNode } from 'react';
import { Spinner } from './Spinner';
import { Button } from './Button';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-ink-muted">
      <Spinner />
      <p className="text-sm">{label}</p>
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: (() => void) | undefined;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-card border border-danger-50 bg-danger-50 px-6 py-12 text-center"
    >
      <p className="text-sm font-semibold text-danger-700">{title}</p>
      <p className="max-w-md text-sm text-danger-700">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  message?: string | undefined;
  action?: ReactNode | undefined;
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line px-6 py-16 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {message ? <p className="max-w-md text-sm text-ink-muted">{message}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
