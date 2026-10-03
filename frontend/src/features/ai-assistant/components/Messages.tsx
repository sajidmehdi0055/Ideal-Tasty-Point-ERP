import { useEffect, useState, type ComponentType, type ReactNode, type SVGProps } from 'react';
import {
  CheckIcon,
  ClockIcon,
  CopyIcon,
  DatabaseIcon,
  LockIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  SparklesIcon,
  TriangleAlertIcon,
  WifiOffIcon,
} from '../../../design-system/icons';
import { Markdown } from '../markdown';
import { providerLabel, toolChips, type ToolChip } from '../tool-labels';
import type { AiTurn, AiTurnError } from '../AiAssistantProvider';
import type { AiChatResponse } from '../types';

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex w-full justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[10px] rounded-br-[3px] bg-action px-3 py-2 text-[13px] leading-[19px] text-on-action">
        {text}
      </div>
    </div>
  );
}

function AiAvatar() {
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control border border-line bg-canvas-sunken text-ink-secondary">
      <SparklesIcon className="h-3.5 w-3.5" />
    </div>
  );
}

function AiRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="flex w-full items-start gap-2.5" aria-label={label} role="group">
      <AiAvatar />
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

const CHIP_STATUS: Record<ToolChip['tone'], { text: string; srText: string }> = {
  success: { text: '', srText: 'read' },
  denied: { text: 'not permitted', srText: 'not permitted' },
  failed: { text: 'failed', srText: 'failed' },
  proposed: { text: 'proposed', srText: 'proposed' },
};

function Chip({ chip }: { chip: ToolChip }) {
  const status = CHIP_STATUS[chip.tone];
  return (
    <li
      className="flex items-center gap-1 rounded-[4px] border border-line bg-canvas-sunken px-[7px] py-[3px] text-[11px] font-medium text-ink-secondary"
      data-tone={chip.tone}
    >
      <DatabaseIcon className="h-3 w-3 text-ink-muted" />
      <span>{chip.label}</span>
      {chip.tone === 'success' ? <CheckIcon className="h-3 w-3 text-success-600" /> : null}
      {chip.tone === 'denied' ? <LockIcon className="h-3 w-3 text-ink-muted" /> : null}
      {chip.tone === 'failed' ? <TriangleAlertIcon className="h-3 w-3 text-warning-600" /> : null}
      {status.text ? <span className={chip.tone === 'failed' ? 'text-warning-700' : 'text-ink-muted'}>{status.text}</span> : null}
      <span className="sr-only">{chip.tone === 'success' ? ` (${status.srText})` : ''}</span>
    </li>
  );
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const timer = window.setTimeout(() => setState('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard not available');
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="flex shrink-0 items-center gap-1 rounded-control px-1 text-[11px] text-ink-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
    >
      <CopyIcon className="h-3 w-3" />
      <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}</span>
    </button>
  );
}

export function AiAnswer({ response, elapsedMs }: { response: AiChatResponse; elapsedMs: number }) {
  const chips = toolChips(response.tool_calls);
  const lookups = response.tool_calls.length;
  const model = `${providerLabel(response.provider)}${response.metadata.fallback_used ? ' (fallback)' : ''}`;
  const meta = `${model} · ${lookups} ERP ${lookups === 1 ? 'lookup' : 'lookups'} · ${formatSeconds(elapsedMs)}`;

  return (
    <AiRow label="AI answer">
      <Markdown text={response.message} />
      {response.metadata.limit_reached ? (
        <p className="flex items-center gap-1.5 text-[11px] text-warning-700">
          <TriangleAlertIcon className="h-3 w-3" />
          Answer may be incomplete — the assistant reached its lookup limit.
        </p>
      ) : null}
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-ink-muted" aria-hidden="true">
            ERP data used
          </span>
          <ul className="flex flex-wrap items-center gap-1.5" aria-label="ERP data used">
            {chips.map(chip => (
              <Chip key={`${chip.label}|${chip.tone}`} chip={chip} />
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[11px] text-ink-muted" data-testid="ai-meta">
          {meta}
        </p>
        <CopyButton text={response.message} />
      </div>
    </AiRow>
  );
}

export function AiWaiting({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));

  return (
    <AiRow label="Waiting for the answer">
      <div className="flex w-full items-center gap-2" role="status">
        <span className="flex w-[26px] items-center gap-1" aria-hidden="true">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-secondary" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-secondary [animation-delay:150ms]" />
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-secondary [animation-delay:300ms]" />
        </span>
        <span className="text-[13px] text-ink-secondary">Checking ERP data…</span>
        <span className="flex-1" />
        {/* Hidden from screen readers: a live region would read it out every second. */}
        <span className="text-[11px] text-ink-muted" data-testid="ai-elapsed" aria-hidden="true">
          {seconds} s
        </span>
      </div>
      <div className="h-2.5 w-[340px] max-w-full rounded-[5px] bg-canvas-hover" aria-hidden="true" />
      <div className="h-2.5 w-[290px] max-w-full rounded-[5px] bg-canvas-hover" aria-hidden="true" />
      <div className="h-2.5 w-[200px] max-w-full rounded-[5px] bg-canvas-hover" aria-hidden="true" />
    </AiRow>
  );
}

interface CardCopy {
  tone: 'danger' | 'warning';
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  body: string;
  retry: boolean;
}

function cardCopy(error: AiTurnError): CardCopy {
  switch (error.kind) {
    case 'offline':
      return {
        tone: 'danger',
        icon: WifiOffIcon,
        title: 'AI model is offline',
        body: 'The AI model server is not responding, so this question was not answered. All ERP screens still work normally. Try again in a minute — if it keeps failing, tell the administrator.',
        retry: true,
      };
    case 'rate-limited':
      return {
        tone: 'warning',
        icon: ClockIcon,
        title: 'Too many questions — please wait',
        body: 'You have reached the per-minute limit for AI questions. Wait about a minute, then press Retry. Your question is kept.',
        retry: true,
      };
    case 'audit-failed':
      return {
        tone: 'danger',
        icon: ShieldAlertIcon,
        title: 'Stopped for safety — not answered',
        body: 'The ERP could not record this request in the AI audit log, so the assistant stopped without answering. Nothing was changed. Please inform the administrator.',
        retry: true,
      };
    case 'unauthenticated':
      // 401 is a shell-level sign-in state in the design (future, with real
      // auth). Until then it is reported plainly here — never hidden and
      // never answered with a fake sign-in.
      return {
        tone: 'danger',
        icon: LockIcon,
        title: 'Not signed in',
        body: 'The server did not accept this request because there is no signed-in user. Sign-in is not part of the ERP yet.',
        retry: false,
      };
    default:
      return {
        tone: 'danger',
        icon: TriangleAlertIcon,
        title: 'Could not get an answer',
        body: error.message,
        retry: true,
      };
  }
}

export function AiErrorCard({
  error,
  onRetry,
  canRetry,
}: {
  error: AiTurnError;
  onRetry: () => void;
  canRetry: boolean;
}) {
  const copy = cardCopy(error);
  const Icon = copy.icon;
  const code = error.status > 0 ? `${error.status} · ${error.code}` : error.code;
  return (
    <AiRow label="AI error">
      <div
        data-testid={`ai-error-${error.kind}`}
        className={`flex w-full flex-col gap-1.5 rounded-card p-3 ${copy.tone === 'warning' ? 'bg-warning-50' : 'bg-danger-50'}`}
      >
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 shrink-0 ${copy.tone === 'warning' ? 'text-warning-700' : 'text-danger-700'}`} />
          <p
            className={`min-w-0 flex-1 text-[13px] font-semibold leading-[18px] ${
              copy.tone === 'warning' ? 'text-warning-700' : 'text-danger-700'
            }`}
          >
            {copy.title}
          </p>
        </div>
        <p className="text-[12.5px] leading-[19px] text-ink-secondary">{copy.body}</p>
        <div className="flex items-center gap-2">
          {copy.retry && canRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="flex h-7 items-center gap-1.5 rounded-control border border-line-strong bg-canvas px-2.5 text-[12px] font-medium text-ink hover:bg-canvas-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
            >
              <RotateCcwIcon className="h-3.5 w-3.5" />
              Retry
            </button>
          ) : null}
          <span className="flex-1" />
          <span className="whitespace-nowrap text-[11px] font-medium text-ink-muted">{code}</span>
        </div>
      </div>
    </AiRow>
  );
}

export function TurnView({ turn, isLatest, onRetry }: { turn: AiTurn; isLatest: boolean; onRetry: (id: number) => void }) {
  return (
    <>
      <UserBubble text={turn.question} />
      {turn.state === 'waiting' ? <AiWaiting startedAt={turn.startedAt} /> : null}
      {turn.state === 'answered' && turn.response ? (
        <AiAnswer response={turn.response} elapsedMs={turn.elapsedMs ?? 0} />
      ) : null}
      {turn.state === 'failed' && turn.error ? (
        <AiErrorCard error={turn.error} canRetry={isLatest} onRetry={() => onRetry(turn.id)} />
      ) : null}
    </>
  );
}
