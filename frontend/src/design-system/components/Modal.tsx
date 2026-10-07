import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { XIcon } from '../icons';

/**
 * Dialog widths (Direction A Figma: Dialog/Small 122:13751, Dialog/Medium 122:13801).
 * - `small`  440px — a confirm or up to ~4 fields (Adjust stock, Deactivate, UOM).
 * - `medium` 640px — a searchable picker or 5–10 fields (Opening stock, Location).
 * Legacy sizes are still accepted until every screen migrates:
 * @deprecated `md` and `lg` render as `small` (440px); `xl` keeps 520px.
 */
export type ModalSize = 'small' | 'medium' | 'md' | 'lg' | 'xl';

const WIDTH_CLASS: Record<ModalSize, string> = {
  small: 'md:max-w-[440px]',
  medium: 'md:max-w-[640px]',
  md: 'md:max-w-[440px]',
  lg: 'md:max-w-[440px]',
  xl: 'md:max-w-[520px]',
};

export interface ModalControls {
  /**
   * Close the dialog the same way Esc / ✕ / the backdrop do: ignored while
   * not dismissible, and — when `dirty` — asks "Discard unsaved changes?"
   * first. Wire a dialog's Cancel button to this instead of `onClose`.
   */
  requestClose: () => void;
}

const ModalContext = createContext<ModalControls | null>(null);

/** For components rendered inside a Modal's body/footer that need the guarded close. */
export function useModalControls(): ModalControls {
  const controls = useContext(ModalContext);
  if (!controls) throw new Error('useModalControls must be used inside a <Modal>.');
  return controls;
}

interface ModalProps {
  open: boolean;
  title: string;
  /** Called when the dialog should close (after the discard confirm, when `dirty`). */
  onClose: () => void;
  children: ReactNode;
  /** Footer buttons. Pass a function to get `requestClose` for a guarded Cancel button. */
  footer?: ReactNode | ((controls: ModalControls) => ReactNode);
  /** Optional icon before the title (e.g. a warning or power icon). */
  icon?: ReactNode;
  /** Defaults to `md` (= small, 440px) so existing callers keep their size. */
  size?: ModalSize | undefined;
  /**
   * `false` while a write is in flight: Esc, the backdrop and ✕ are ignored so
   * the result (or error) of the request is not lost. Defaults to `true`.
   */
  dismissible?: boolean | undefined;
  /**
   * `true` when the form has unsaved changes: Esc / ✕ / backdrop /
   * `requestClose` show an inline "Discard unsaved changes?" confirm
   * (Keep editing / Discard) instead of closing straight away.
   */
  dirty?: boolean | undefined;
}

/**
 * Built on the native <dialog> element: focus trap and top-layer stacking
 * for free. Escape is handled here (not by the browser's own cancel) so the
 * `dismissible` and `dirty` guards apply to it; focus returns to the element
 * that opened the dialog when it closes. Below 768px it is a full-screen
 * sheet with the header and footer fixed and the body scrolling.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  icon,
  size = 'md',
  dismissible = true,
  dirty = false,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const escapeHandledRef = useRef(false);
  const closingByOwnerRef = useRef(false);
  const titleId = useId();
  const confirmId = useId();
  const [confirming, setConfirming] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  // Reset the discard confirm whenever the dialog is (re)opened or closed by its owner.
  if (wasOpen !== open) {
    setWasOpen(open);
    setConfirming(false);
  }
  const showConfirm = confirming && dirty;

  const requestClose = () => {
    if (!dismissible) return;
    if (dirty) setConfirming(true);
    else onClose();
  };

  // Latest values for the document-level Escape listener and the native
  // close event, without re-subscribing on every render.
  const latest = useRef({ open, showConfirm, requestClose });
  useEffect(() => {
    latest.current = { open, showConfirm, requestClose };
  });

  // Open/close the native dialog; remember and restore the opener's focus.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) {
        // Guards a close() whose `close` event fires synchronously (jsdom, some polyfills):
        // the owner already knows. Browsers queue the event; the !dialog.open check covers those.
        closingByOwnerRef.current = true;
        dialog.close();
        closingByOwnerRef.current = false;
      }
      if (opener && opener.isConnected && opener !== document.body) opener.focus();
    };
  }, [open]);

  // Escape: listen on the document so it works wherever focus is while this
  // dialog is open. Inner widgets (pickers, menus, tooltips) that use Escape
  // themselves call preventDefault, and this then leaves it alone.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const dialog = dialogRef.current;
      const owner = event.target instanceof Element ? event.target.closest('dialog[open]') : null;
      if (owner && owner !== dialog) return; // belongs to another (stacked) dialog
      event.preventDefault(); // also stops the browser's own cancel-and-close
      escapeHandledRef.current = true;
      setTimeout(() => {
        escapeHandledRef.current = false;
      }, 0);
      if (latest.current.showConfirm) setConfirming(false);
      else latest.current.requestClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (showConfirm) keepEditingRef.current?.focus();
  }, [showConfirm]);

  const controls: ModalControls = { requestClose };
  const footerContent = typeof footer === 'function' ? footer(controls) : footer;

  return (
    <dialog
      ref={dialogRef}
      onClose={() => {
        // Safety net: if the browser ever closes the dialog by itself (e.g. a
        // forced close request), keep the owner's `open` state in sync.
        // The `close` event is queued, so a close-then-reopen (React StrictMode
        // re-running the effect in dev) must not count: only sync when it is
        // still closed when the event arrives.
        if (!closingByOwnerRef.current && latest.current.open && !dialogRef.current?.open) onClose();
      }}
      onCancel={event => {
        // Never let the browser close the dialog by itself: the guards above decide.
        event.preventDefault();
        if (!escapeHandledRef.current) requestClose();
      }}
      onClick={event => {
        if (event.target === dialogRef.current) requestClose();
      }}
      aria-labelledby={titleId}
      data-size={size}
      className={`m-0 h-full max-h-none w-full max-w-none overflow-hidden rounded-none border-0 bg-canvas p-0 shadow-modal backdrop:bg-overlay md:m-auto md:h-fit md:w-full md:rounded-dialog md:border md:border-line ${WIDTH_CLASS[size]}`}
    >
      <ModalContext.Provider value={controls}>
        <div
          onClick={event => event.stopPropagation()}
          className="flex h-full flex-col md:h-auto md:max-h-[calc(100dvh-4rem)]"
        >
          <div className="flex shrink-0 items-center gap-2.5 py-4 pl-5 pr-3.5">
            <h2 id={titleId} className="flex min-w-0 flex-1 items-center gap-2 text-base font-bold text-ink">
              {icon}
              {title}
            </h2>
            <button
              type="button"
              onClick={requestClose}
              disabled={!dismissible}
              aria-label="Close dialog"
              className="rounded-control p-1 text-ink-muted hover:bg-canvas-hover hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50"
            >
              <XIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-1">{children}</div>
          {showConfirm ? (
            <div
              role="alertdialog"
              aria-labelledby={confirmId}
              className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line bg-canvas-sunken px-5 py-3.5"
            >
              <p id={confirmId} className="text-sm font-semibold text-ink">
                Discard unsaved changes?
              </p>
              <div className="flex gap-2">
                <Button ref={keepEditingRef} variant="secondary" onClick={() => setConfirming(false)}>
                  Keep editing
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setConfirming(false);
                    onClose();
                  }}
                >
                  Discard
                </Button>
              </div>
            </div>
          ) : footerContent ? (
            <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line bg-canvas-sunken px-5 py-3.5">
              {footerContent}
            </div>
          ) : null}
        </div>
      </ModalContext.Provider>
    </dialog>
  );
}
