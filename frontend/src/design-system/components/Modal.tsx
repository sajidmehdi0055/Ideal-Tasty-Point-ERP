import { useEffect, useId, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Built on the native <dialog> element: free focus trap, Escape-to-close
 * and top-layer stacking, no extra dependency for a single-use pattern.
 */
export function Modal({ open, title, onClose, children, footer }: ModalProps) {
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
      onClick={event => {
        if (event.target === dialogRef.current) onClose();
      }}
      aria-labelledby={titleId}
      className="m-auto w-full max-w-md rounded-card border border-line bg-canvas p-0 shadow-modal backdrop:bg-slate-900/40"
    >
      <div onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-control p-1 text-ink-muted hover:bg-canvas-muted hover:text-ink"
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
