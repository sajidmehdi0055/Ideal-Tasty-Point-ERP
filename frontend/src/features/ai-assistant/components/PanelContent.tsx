import type { ComponentType, SVGProps } from 'react';
import {
  ClipboardListIcon,
  HistoryIcon,
  InfoIcon,
  LockIcon,
  PackageCheckIcon,
  PackageIcon,
  PowerOffIcon,
  ReceiptTextIcon,
  ScaleIcon,
  SparklesIcon,
} from '../../../design-system/icons';
import type { AiBlockedKind } from '../errors';

interface Suggestion {
  text: string;
  tool: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

// Frame 01: suggestions only for the AI-S01 read-only tools (generic text —
// owner correction: no sample supplier name).
const SUGGESTIONS: Suggestion[] = [
  { text: 'Current stock of cooking oil in all locations', tool: 'Stock balances', icon: PackageIcon },
  { text: 'Stock ledger for chicken this week', tool: 'Stock ledger', icon: HistoryIcon },
  { text: 'Compare supplier rates for cooking oil', tool: 'Rate comparison', icon: ScaleIcon },
  { text: 'Purchase history from a supplier, last 30 days', tool: 'Purchase history', icon: ReceiptTextIcon },
  { text: 'Kaun se purchase orders abhi open hain?', tool: 'Purchase orders', icon: ClipboardListIcon },
  { text: 'Goods received this week', tool: 'Goods receipts', icon: PackageCheckIcon },
];

/** Frame 01 — welcome / empty conversation. A suggestion fills the composer; it is not sent automatically. */
export function Welcome({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex w-full flex-col gap-3.5">
      <div className="flex flex-col gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-control bg-action text-on-action">
          <SparklesIcon className="h-5 w-5" />
        </div>
        <p className="text-[17px] font-semibold leading-6 text-ink">Ask about your inventory data</p>
        <p className="text-[13px] leading-5 text-ink-secondary">
          Answers use live ERP data that your role is allowed to see. Read-only — the assistant never creates or changes
          records. Ask in Roman Urdu, Urdu or English.
        </p>
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">Try asking</p>
      <ul className="flex flex-col gap-1.5" aria-label="Suggested questions">
        {SUGGESTIONS.map(suggestion => {
          const Icon = suggestion.icon;
          return (
            <li key={suggestion.text}>
              <button
                type="button"
                onClick={() => onPick(suggestion.text)}
                className="flex w-full items-center gap-2.5 rounded-control border border-line bg-canvas px-3 py-[9px] text-left hover:bg-canvas-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
              >
                <Icon className="h-4 w-4 shrink-0 text-ink-secondary" />
                <span className="min-w-0 flex-1 text-[13px] leading-[18px] text-ink">{suggestion.text}</span>
                <span className="shrink-0 whitespace-nowrap text-[11px] text-ink-muted">{suggestion.tool}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-start gap-2 rounded-control bg-canvas-sunken px-3 py-2.5">
        <InfoIcon className="mt-px h-4 w-4 shrink-0 text-ink-muted" />
        <p className="min-w-0 flex-1 text-[12px] leading-[18px] text-ink-secondary">
          <span className="font-semibold">Not available yet:</span> sales, cash, wastage, HR, attendance and low-stock
          alerts — these ERP modules are not built.
        </p>
      </div>
    </div>
  );
}

const BLOCKED_COPY: Record<AiBlockedKind, { icon: ComponentType<SVGProps<SVGSVGElement>>; title: string; body: string; badge: string }> = {
  disabled: {
    icon: PowerOffIcon,
    title: 'AI Assistant is turned off',
    body: 'An administrator has switched off the AI assistant for this ERP. All other ERP screens work normally.',
    badge: 'Status: DISABLED',
  },
  // Frame 09 variant: 503 AI_UNAVAILABLE / state MISCONFIGURED.
  misconfigured: {
    icon: PowerOffIcon,
    title: 'AI Assistant is not available',
    body: 'AI Assistant is not set up correctly. Please contact the administrator. All other ERP screens work normally.',
    badge: 'Status: MISCONFIGURED',
  },
  forbidden: {
    icon: LockIcon,
    title: 'Not available for your role',
    body: 'Your role does not have access to the AI assistant. Ask the Owner or a Manager if you need it.',
    badge: '403 · AI_FORBIDDEN',
  },
};

/** Frames 09 / 10 — the whole panel explains why the assistant cannot be used. */
export function BlockedState({ kind }: { kind: AiBlockedKind }) {
  const copy = BLOCKED_COPY[kind];
  const Icon = copy.icon;
  return (
    <div className="flex flex-1 items-center justify-center p-4" data-testid={`ai-blocked-${kind}`}>
      <div className="flex w-full flex-col items-center gap-3 px-5 text-center">
        <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-line bg-canvas-sunken text-ink-secondary">
          <Icon className="h-[22px] w-[22px]" />
        </div>
        <p className="text-base font-semibold leading-[22px] text-ink">{copy.title}</p>
        <p className="text-[13px] leading-5 text-ink-secondary">{copy.body}</p>
        <span className="rounded-[4px] border border-line bg-canvas-sunken px-[7px] py-0.5 text-[11px] font-semibold text-ink-secondary">
          {copy.badge}
        </span>
      </div>
    </div>
  );
}
