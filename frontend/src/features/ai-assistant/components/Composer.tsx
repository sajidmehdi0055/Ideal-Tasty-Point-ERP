import { useLayoutEffect, type KeyboardEvent, type RefObject } from 'react';
import { Tooltip } from '../../../design-system/components/Tooltip';
import { SendIcon } from '../../../design-system/icons';
import { MAX_MESSAGE_CHARS } from '../limits';

const COUNT_FORMAT = new Intl.NumberFormat('en-US');
const MAX_TEXTAREA_HEIGHT_PX = 120;

interface ComposerProps {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  /** One question at a time: locked while an answer is awaited. */
  locked: boolean;
  /** Hint while waiting (frame 02 wording for the local model). */
  waitHint: string;
  /** Inline message from a 400 response (shown in place of the hint). */
  serverError: string | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

/**
 * Panel composer (UI-AI-001): Enter sends, Shift+Enter is a new line, a
 * 4,000-character counter, and the over-limit check from frame 08. While an
 * answer is awaited the field is locked (frame 02).
 */
export function Composer({ value, onChange, onSend, locked, waitHint, serverError, textareaRef }: ComposerProps) {
  const length = value.length;
  const tooLong = length > MAX_MESSAGE_CHARS;
  const canSend = !locked && !tooLong && value.trim() !== '';

  // Grow with the text up to a few lines, then scroll inside the field.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  }, [value, textareaRef]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSend) onSend();
  }

  let hint = 'AI can make mistakes — verify important numbers.';
  if (locked) hint = waitHint;
  if (tooLong) hint = `Message is too long — maximum ${COUNT_FORMAT.format(MAX_MESSAGE_CHARS)} characters.`;
  else if (serverError) hint = serverError;
  const hintIsError = tooLong || (!locked && serverError !== null);

  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-t border-line bg-canvas px-4 py-3" data-testid="ai-composer">
      <div
        className={`flex items-end gap-2 rounded-control border py-2 pl-3 pr-2 ${
          tooLong
            ? 'border-danger-700 focus-within:ring-1 focus-within:ring-danger-700'
            : 'border-line-strong focus-within:border-focus focus-within:ring-1 focus-within:ring-focus'
        } ${locked ? 'bg-canvas-sunken' : 'bg-canvas'}`}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={locked ? '' : value}
          onChange={event => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={locked}
          placeholder={locked ? 'Waiting for the answer…' : 'Ask about stock, suppliers, rates or purchase orders…'}
          aria-label="Message to the AI Assistant"
          aria-describedby="ai-composer-hint"
          aria-invalid={tooLong || undefined}
          className="max-h-30 min-h-8 flex-1 resize-none self-center bg-transparent py-1.5 text-[13px] leading-5 text-ink outline-none placeholder:overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap placeholder:text-ink-muted disabled:cursor-not-allowed"
        />
        <Tooltip content="Send question" describe={false}>
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send question"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-control transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-not-allowed ${
              canSend ? 'bg-action text-on-action hover:bg-action-hover' : 'bg-canvas-hover text-ink-muted'
            }`}
          >
            <SendIcon className="h-4 w-4" />
          </button>
        </Tooltip>
      </div>
      <div className={`flex items-center gap-2 text-[11px] ${hintIsError ? 'text-danger-700' : 'text-ink-muted'}`}>
        <p id="ai-composer-hint" className="min-w-0 flex-1 leading-[15px]" aria-live="polite">
          {hint}
        </p>
        <p className={`shrink-0 whitespace-nowrap ${tooLong ? 'font-semibold' : ''}`} data-testid="ai-char-count">
          {COUNT_FORMAT.format(locked ? 0 : length)} / {COUNT_FORMAT.format(MAX_MESSAGE_CHARS)}
        </p>
      </div>
    </div>
  );
}
