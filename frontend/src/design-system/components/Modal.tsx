import { useEffect, useId, useRef, type ReactNode } from 'react';

const SIZE_CLASS = { md: 'max-w-md', lg: 'max-w-[480px]', xl: 'max-w-[520px]' } as const;

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Optional icon before the title (e.g. a warning or power icon). */
  icon?: ReactNode;
  /** `md` = 448px (default), `lg` = 480px (stock dialogs, UI-STOCK-001), `xl` = 520px (Opening stock, G4). */
  size?: 'md' | 'lg' | 'xl';
  /**
   * `false` while a write is in flight: Esc, the backdrop and ✕ are ignored so
   * the result (or error) of the request is not lost. Defaults to `true`.
   */
  dismissible?: boolean;
}

/**
 * Built on the native <dialog> element: free focus trap, Escape-to-close
 * and top-layer stacking, no extra dependency for a single-use pattern.
 */
export function Modal({ open, title, onClose, children, footer, icon, size = 'md', dismissible = true }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={event => {
        if (!dismissible) event.preventDefault();
      }}
      onClick={event => {
        if (dismissible && event.target === dialogRef.current) onClose();
      }}
      aria-labelledby={titleId}
      className={`m-auto w-full ${SIZE_CLASS[size]} rounded-card border border-line bg-canvas p-0 shadow-modal backdrop:bg-overlay`}
    >
      <div onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id={titleId} className="flex items-center gap-2 text-base font-semibold text-ink">
            {icon}
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={!dismissible}
            aria-label="Close dialog"
            className="rounded-control p-1 text-ink-muted hover:bg-canvas-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-line px-5 py-4">{footer}</div> : null}
      </div>
    </dialog>
  );
}
