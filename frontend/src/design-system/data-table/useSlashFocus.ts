import { useEffect, useRef, type RefObject } from 'react';

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function dialogIsOpen(): boolean {
  return document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]') !== null;
}

interface SlashFocusOptions {
  /** Called when Esc is pressed in a non-empty search box (clear the controlled value here). */
  onClear?: () => void;
}

/**
 * Keyboard shortcuts for a list screen's search box:
 *  - "/" anywhere on the page focuses the box — unless focus is already in an
 *    input/textarea/select/contenteditable, a modifier key is held, another
 *    handler already used the key, or a dialog is open.
 *  - Esc in the box: clears it when it has text (via `onClear`), otherwise blurs it.
 */
export function useSlashFocus(inputRef: RefObject<HTMLInputElement | null>, options: SlashFocusOptions = {}): void {
  const onClearRef = useRef(options.onClear);
  useEffect(() => {
    onClearRef.current = options.onClear;
  });

  useEffect(() => {
    // One document listener (not one on the input) so it also works when the
    // search box mounts after the screen, e.g. once loading has finished.
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      const input = inputRef.current;
      if (!input || input.disabled || !input.isConnected) return;

      if (event.key === 'Escape' && event.target === input) {
        // Replaces the browser's native "clear search" so clearing happens once.
        event.preventDefault();
        if (input.value !== '' && onClearRef.current) onClearRef.current();
        else input.blur();
        return;
      }

      if (event.key !== '/' || event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditable(event.target) || dialogIsOpen()) return;
      event.preventDefault();
      input.focus();
    };
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => document.removeEventListener('keydown', onDocumentKeyDown);
  }, [inputRef]);
}
