import { useCallback, useEffect, useLayoutEffect, useRef, type ComponentType, type SVGProps } from 'react';
import {
  EyeIcon,
  Maximize2Icon,
  MessageSquarePlusIcon,
  Minimize2Icon,
  SparklesIcon,
  XIcon,
} from '../../../design-system/icons';
import { Tooltip } from '../../../design-system/components/Tooltip';
import { useMediaQuery } from '../../../lib/use-media-query';
import { useResizableWidth } from '../../../lib/use-resizable-width';
import { useAiAssistant, useAiTriggerRef, type AiAssistantContextValue } from '../AiAssistantProvider';
import type { AiBlockedKind } from '../errors';
import { moduleLabel } from '../module';
import { providerLabel } from '../tool-labels';
import { Composer } from './Composer';
import { TurnView } from './Messages';
import { BlockedState, Welcome } from './PanelContent';
import {
  AI_PANEL_DEFAULT_WIDTH,
  AI_PANEL_MAX_WIDTH,
  AI_PANEL_MIN_WIDTH,
  AI_PANEL_WIDTH_KEY,
  PanelResizeHandle,
} from './PanelResizeHandle';

export type AiPanelVariant = 'desktop' | 'touch' | 'mobile';

/**
 * Layout follows input type like ERP Shell v2 (UI-AI-001 "Behaviour"):
 *  - desktop (≥ 768 px, mouse): 440 px under the header, over the content, no
 *    scrim, non-modal; Expand → 760 px. UI-REFRESH-001: the left edge can be
 *    dragged to any width from 440 to 760 px (remembered on this device).
 *  - touch (≥ 768 px, no hover — tablet): 480 px full-height sheet with scrim, modal.
 *  - mobile (< 768 px): full-screen sheet, modal, same components.
 */
export function useAiPanelVariant(): AiPanelVariant {
  const isWide = useMediaQuery('(min-width: 768px)');
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)');
  if (!isWide) return 'mobile';
  return canHover ? 'desktop' : 'touch';
}

/** True while the panel is open as a modal sheet — the shell behind it must be inert. */
export function useAiPanelIsModal(): boolean {
  const ai = useAiAssistant();
  const variant = useAiPanelVariant();
  return Boolean(ai?.open) && variant !== 'desktop';
}

function effectiveBlocked(ai: AiAssistantContextValue): AiBlockedKind | null {
  if (ai.blocked) return ai.blocked;
  if (ai.availability === 'disabled') return 'disabled';
  if (ai.availability === 'misconfigured') return 'misconfigured';
  return null;
}

function StatusPill({ ai, blocked }: { ai: AiAssistantContextValue; blocked: AiBlockedKind | null }) {
  let text = providerLabel(ai.status?.provider);
  let dot = 'bg-success-600';
  if (blocked === 'disabled') {
    text = 'Turned off';
    dot = 'bg-ink-muted';
  } else if (blocked === 'misconfigured') {
    text = 'Not set up';
    dot = 'bg-ink-muted';
  } else if (blocked === 'forbidden') {
    text = 'No access';
    dot = 'bg-ink-muted';
  } else if (ai.providerOffline) {
    text = 'Model offline';
    dot = 'bg-danger-600';
  }
  return (
    <span
      className="flex shrink-0 items-center gap-1.5 rounded-[10px] border border-line bg-canvas-sunken px-2 py-[3px] text-[11px] font-medium text-ink-secondary"
      data-testid="ai-status-pill"
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {text}
    </span>
  );
}

function IconButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  active,
  touch,
}: {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  touch: boolean;
}) {
  // Icon-only: the design-system Tooltip shows the label on hover and focus
  // (visual only — the aria-label already names the button).
  return (
    <Tooltip content={label} side="bottom" describe={false}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`flex shrink-0 items-center justify-center rounded-control text-ink-secondary hover:bg-canvas-hover hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-40 ${
          touch ? 'h-9 w-9' : 'h-7 w-7'
        } ${active ? 'bg-canvas-hover' : ''}`}
      >
        <Icon className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}

const PANEL_SHADOW = 'shadow-[-1px_0_2px_0_rgb(0_0_0/0.1),-10px_0_32px_0_rgb(0_0_0/0.3)]';

export function AiAssistantPanel() {
  const ai = useAiAssistant();
  const variant = useAiPanelVariant();
  if (!ai || !ai.open) return null;
  return <PanelBody ai={ai} variant={variant} />;
}

function PanelBody({ ai, variant }: { ai: AiAssistantContextValue; variant: AiPanelVariant }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const modal = variant !== 'desktop';
  const touch = variant !== 'desktop';
  const blocked = effectiveBlocked(ai);
  const { closePanel } = ai;
  const triggerRef = useAiTriggerRef();
  const panelWidth = useResizableWidth({
    storageKey: AI_PANEL_WIDTH_KEY,
    min: AI_PANEL_MIN_WIDTH,
    max: AI_PANEL_MAX_WIDTH,
    defaultWidth: AI_PANEL_DEFAULT_WIDTH,
  });
  // Only the desktop side panel is resizable; the touch/mobile sheets keep
  // their fixed layout, and Expand keeps its fixed 760 px.
  const resizable = variant === 'desktop' && !ai.expanded;

  const close = useCallback(() => {
    closePanel();
    // After the commit that removes `inert` from the shell, so focus() works.
    window.setTimeout(() => triggerRef?.current?.focus(), 0);
  }, [closePanel, triggerRef]);

  // Move focus into the panel when it opens.
  useEffect(() => {
    if (textareaRef.current && !textareaRef.current.disabled) textareaRef.current.focus();
    else closeRef.current?.focus();
    // Only on open (mount); later re-renders must not steal focus.
  }, []);

  // Esc closes: always for a modal sheet; for the non-modal desktop panel only
  // when focus is inside it, so Esc keeps working for dialogs in the content.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const focusInside = panelRef.current?.contains(document.activeElement) ?? false;
      if (!modal && !focusInside) return;
      close();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modal, close]);

  // Keep the newest message in view. The welcome screen (no turns) stays at
  // the top so its title is visible on short screens.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element && ai.turns.length > 0) element.scrollTop = element.scrollHeight;
  }, [ai.turns]);

  // Focus returns to the composer when an answer (or error) arrives.
  const wasWaitingRef = useRef(ai.waiting);
  useEffect(() => {
    if (wasWaitingRef.current && !ai.waiting) {
      // The locked composer dropped focus to <body>; give it back unless the
      // user has moved on to something else on the page meanwhile.
      const active = document.activeElement;
      if (!active || active === document.body || panelRef.current?.contains(active)) textareaRef.current?.focus();
    }
    wasWaitingRef.current = ai.waiting;
  }, [ai.waiting]);

  function pickSuggestion(text: string) {
    ai?.setDraft(text);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  }

  const width = ai.expanded ? 'md:w-[760px]' : variant === 'touch' ? 'md:w-[480px]' : 'md:w-[440px]';
  const position =
    variant === 'mobile'
      ? 'fixed inset-0 z-50'
      : variant === 'touch'
        ? `fixed inset-y-0 right-0 z-50 max-w-[calc(100vw-4rem)] ${width} border-l border-line-strong ${PANEL_SHADOW}`
        : `fixed bottom-0 right-0 top-16 z-30 max-w-[calc(100vw-4rem)] ${width} border-l border-line-strong ${PANEL_SHADOW}`;
  const lastTurn = ai.turns[ai.turns.length - 1];

  return (
    <>
      {modal && variant === 'touch' ? (
        // Pointer-only dismiss target (tap outside closes); keyboard users use Esc or ✕.
        <div aria-hidden="true" data-testid="ai-scrim" className="fixed inset-0 z-40 bg-overlay" onClick={close} />
      ) : null}
      <div
        ref={panelRef}
        id="ai-assistant-panel"
        role="dialog"
        aria-modal={modal ? true : undefined}
        aria-label="AI Assistant"
        data-testid="ai-panel"
        data-variant={variant}
        data-expanded={ai.expanded ? 'true' : 'false'}
        className={`${position} flex flex-col bg-canvas`}
        // The 440 px class is the default; a remembered width overrides it.
        style={resizable ? { width: `${panelWidth.width}px` } : undefined}
      >
        {resizable ? (
          <PanelResizeHandle
            width={panelWidth.width}
            onPreview={panelWidth.preview}
            onCommit={panelWidth.commit}
            onReset={panelWidth.reset}
          />
        ) : null}
        <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-line pl-4 pr-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-action text-on-action">
            <SparklesIcon className="h-4 w-4" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-px">
            <h2 className="truncate text-sm font-semibold leading-[18px] text-ink">AI Assistant</h2>
            <p className="truncate text-[11px] leading-[14px] text-ink-muted">Answers from live ERP data</p>
          </div>
          <StatusPill ai={ai} blocked={blocked} />
          <div className="flex shrink-0 items-center gap-0.5">
            {!blocked ? (
              <>
                <IconButton
                  label="New chat"
                  icon={MessageSquarePlusIcon}
                  onClick={() => {
                    ai.newChat();
                    textareaRef.current?.focus();
                  }}
                  disabled={ai.waiting}
                  touch={touch}
                />
                {variant !== 'mobile' ? (
                  <IconButton
                    label={ai.expanded ? 'Collapse panel' : 'Expand panel'}
                    icon={ai.expanded ? Minimize2Icon : Maximize2Icon}
                    onClick={ai.toggleExpanded}
                    active={ai.expanded}
                    touch={touch}
                  />
                ) : null}
              </>
            ) : null}
            <Tooltip content="Close" side="bottom" describe={false}>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                aria-label="Close AI Assistant"
                className={`flex shrink-0 items-center justify-center rounded-control text-ink-secondary hover:bg-canvas-hover hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus ${
                  touch ? 'h-9 w-9' : 'h-7 w-7'
                }`}
              >
                <XIcon className="h-4 w-4" />
              </button>
            </Tooltip>
          </div>
        </div>

        {blocked ? (
          <BlockedState kind={blocked} />
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-1.5 border-b border-line bg-canvas-sunken px-4 py-1.5">
              {ai.currentModule ? (
                <>
                  <span className="text-[11px] text-ink-muted">Context</span>
                  <span
                    className="rounded-[4px] border border-line bg-canvas px-1.5 py-px text-[11px] font-medium text-ink-secondary"
                    data-testid="ai-context-chip"
                  >
                    {moduleLabel(ai.currentModule)}
                  </span>
                </>
              ) : null}
              <span className="flex-1" />
              {ai.status?.write_actions_enabled !== true ? (
                <span className="flex items-center gap-1 rounded-[4px] bg-info-50 px-[7px] py-0.5 text-[11px] font-semibold text-info-700">
                  <EyeIcon className="h-3 w-3" />
                  Read-only
                </span>
              ) : null}
            </div>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" data-testid="ai-messages">
              <div
                className={`flex min-h-full flex-col gap-[18px] p-4 ${ai.turns.length > 0 ? 'justify-end' : ''}`}
                role="log"
                aria-label="Conversation"
                aria-live="polite"
              >
                {ai.turns.length === 0 ? <Welcome onPick={pickSuggestion} /> : null}
                {ai.turns.map(turn => (
                  <TurnView key={turn.id} turn={turn} isLatest={turn === lastTurn && !ai.waiting} onRetry={ai.retry} />
                ))}
              </div>
            </div>

            <Composer
              value={ai.draft}
              onChange={ai.setDraft}
              onSend={ai.send}
              locked={ai.waiting}
              waitHint={
                ai.status?.provider === 'local' || !ai.status?.provider
                  ? 'The local model can take a little time. One question at a time.'
                  : 'The AI model can take a little time. One question at a time.'
              }
              serverError={ai.composerError}
              textareaRef={textareaRef}
            />
          </>
        )}
      </div>
    </>
  );
}
