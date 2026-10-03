import { SparklesIcon } from '../../../design-system/icons';
import { useAiAssistant, useAiTriggerRef } from '../AiAssistantProvider';

/**
 * Header "Ask AI" button (UI-AI-001 frame `Header/Ask AI`). Shown only when
 * GET /api/ai/status allows it (available: true, or enabled: false so the
 * panel can explain). The text label is shown on wide desktop headers; below
 * 1280 px it is icon-only, as in the approved tablet frame (12) and the mobile
 * header — the accessible name stays "Ask AI" in every size.
 */
export function AskAiButton() {
  const ai = useAiAssistant();
  const triggerRef = useAiTriggerRef();
  if (!ai || ai.availability === 'unknown' || ai.availability === 'hidden') return null;

  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={ai.togglePanel}
      aria-label="Ask AI"
      aria-expanded={ai.open}
      aria-controls={ai.open ? 'ai-assistant-panel' : undefined}
      data-testid="ask-ai-button"
      className="flex h-10 w-10 shrink-0 items-center justify-center gap-1.5 rounded-control border border-line-strong bg-canvas-hover text-[13px] font-medium text-ink hover:border-focus focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:h-9 md:w-9 xl:w-auto xl:px-3"
    >
      <SparklesIcon className="h-4 w-4 shrink-0" />
      <span className="hidden xl:inline">Ask AI</span>
    </button>
  );
}
