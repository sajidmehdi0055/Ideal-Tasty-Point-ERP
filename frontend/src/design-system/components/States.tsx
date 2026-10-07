import type { ReactNode } from 'react';
import { Button } from './Button';
import { CircleAlertIcon, LockIcon } from '../icons';

/*
 * Screen states (Direction A Figma: Loading 133:14582, Empty 133:15002,
 * Error 133:15381, No access 133:15759). Every list has all four — a screen
 * is never blank.
 */

const SKELETON_WIDTHS = ['w-2/5', 'w-1/3', 'w-1/2', 'w-1/4', 'w-2/5', 'w-1/3', 'w-5/12', 'w-1/4'];
const bar = 'rounded-full bg-canvas-hover animate-pulse motion-reduce:animate-none';

interface LoadingStateProps {
  /** Announced to screen readers (visually hidden); the skeleton is what sighted users see. */
  label?: string;
  /** Number of skeleton rows. */
  rows?: number;
}

export function LoadingState({ label = 'Loading…', rows = 6 }: LoadingStateProps) {
  return (
    <div aria-busy="true" className="flex flex-col divide-y divide-line px-4">
      <p className="sr-only">{label}</p>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} data-testid="skeleton-row" aria-hidden="true" className="flex items-center gap-4 py-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <span className={`h-3 ${bar} ${SKELETON_WIDTHS[index % SKELETON_WIDTHS.length]}`} />
            <span className={`h-2 w-16 ${bar}`} />
          </div>
          <span className={`h-3 w-16 ${bar}`} />
          <span className="h-6 w-14 animate-pulse rounded-control bg-canvas-hover motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

function StateIcon({ tone, children }: { tone: 'danger' | 'warning' | 'info'; children: ReactNode }) {
  const toneClass = {
    danger: 'bg-danger-50 text-danger-600',
    warning: 'bg-warning-50 text-warning-600',
    info: 'bg-info-50 text-info-600',
  }[tone];
  return (
    <span aria-hidden="true" className={`flex rounded-full p-3.5 [&>svg]:h-6 [&>svg]:w-6 ${toneClass}`}>
      {children}
    </span>
  );
}

const blockClass = 'flex flex-col items-center justify-center gap-3 px-6 py-14 text-center';
const titleClass = 'text-lg font-bold text-ink';
const messageClass = 'max-w-[460px] text-[13.5px] text-ink-secondary';

interface ErrorStateProps {
  title?: string;
  /** The plain reason, e.g. "The server did not answer." — no codes or SQL. */
  message: string;
  onRetry?: (() => void) | undefined;
  /** Adds "Your data is safe — nothing was changed." Defaults to `true`; pass `false` where that would not be true. */
  safeNote?: boolean;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, safeNote = true }: ErrorStateProps) {
  return (
    <div role="alert" className={blockClass}>
      <StateIcon tone="danger">
        <CircleAlertIcon />
      </StateIcon>
      <p className={titleClass}>{title}</p>
      <p className={messageClass}>{message}</p>
      {safeNote ? <p className={messageClass}>Your data is safe — nothing was changed.</p> : null}
      {onRetry ? (
        <div className="pt-2">
          <Button onClick={onRetry}>Try again</Button>
        </div>
      ) : null}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  /** What to do next. */
  message?: string | undefined;
  /** The button(s) for that next step. */
  action?: ReactNode | undefined;
  /** Optional icon shown in a soft circle above the title. */
  icon?: ReactNode | undefined;
}

export function EmptyState({ title, message, action, icon }: EmptyStateProps) {
  return (
    <div className={blockClass}>
      {icon ? <StateIcon tone="info">{icon}</StateIcon> : null}
      <p className={titleClass}>{title}</p>
      {message ? <p className={messageClass}>{message}</p> : null}
      {action ? <div className="flex flex-wrap items-center justify-center gap-2 pt-2">{action}</div> : null}
    </div>
  );
}

interface NoAccessStateProps {
  title?: string;
  /** Who can see the page, e.g. "the Owner and Managers". */
  who: string;
  /** Replaces the default "Only {who} can see this page. Ask the owner for access." */
  message?: string;
  /** e.g. a link-button back to a screen the user can open. */
  action?: ReactNode;
}

export function NoAccessState({ title = "You don't have access to this page", who, message, action }: NoAccessStateProps) {
  return (
    <div className={`${blockClass} rounded-card border border-line bg-canvas`}>
      <StateIcon tone="warning">
        <LockIcon />
      </StateIcon>
      <p className={titleClass}>{title}</p>
      <p className={messageClass}>{message ?? `Only ${who} can see this page. Ask the owner for access.`}</p>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
