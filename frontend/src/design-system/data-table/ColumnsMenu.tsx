import { useEffect, useId, useRef, useState } from 'react';
import { getButtonClassName } from '../components/Button';
import { Columns3Icon, LockIcon } from '../icons';
import type { TableSettings } from './useTableSettings';

/**
 * "Columns" button + show/hide checklist popover (desktop only; renders
 * nothing when `settings.enabled` is false). Required columns are shown
 * checked, disabled and with a lock. Hiding a column only changes what this
 * screen renders. Esc closes and returns focus to the button; clicking
 * outside or tabbing out closes it.
 * The popover is absolutely positioned: do not put the toolbar inside an
 * ancestor with `overflow: hidden`.
 */
export function ColumnsMenu({ settings }: { settings: TableSettings }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const headingId = useId();
  const { enabled, hiddenCount } = settings;

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  if (!enabled) return null;

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onBlur={event => {
        if (open && event.relatedTarget && !wrapperRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(value => !value)}
        className={getButtonClassName({
          variant: 'secondary',
          size: 'xs',
          className: hiddenCount > 0 ? 'border-action text-action' : '',
        })}
      >
        <Columns3Icon className="h-4 w-4" />
        Columns
        {hiddenCount > 0 ? (
          <span className="rounded-full bg-action px-1.5 py-px text-[11px] font-semibold text-on-action">
            {hiddenCount} hidden
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={headingId}
          className="absolute right-0 top-full z-30 mt-1 w-[264px] rounded-[12px] border border-line bg-canvas py-2 shadow-dropdown"
        >
          <p id={headingId} className="px-3.5 pb-2 pt-1.5 text-[11px] font-bold uppercase text-ink-muted">
            Show columns
          </p>
          <ul>
            {settings.columns.map(column => {
              const locked = Boolean(column.required);
              return (
                <li key={column.id}>
                  <label
                    className={`flex h-[34px] items-center gap-2.5 px-3.5 text-[13.5px] font-medium ${
                      locked ? 'cursor-not-allowed text-ink-muted' : 'cursor-pointer text-ink hover:bg-canvas-hover'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={settings.isVisible(column.id)}
                      disabled={locked}
                      // Explicit name: sibling text nodes would otherwise run together ("Item(required…").
                      aria-label={locked ? `${column.label} (required, cannot be hidden)` : undefined}
                      onChange={() => settings.toggleColumn(column.id)}
                      className="h-4 w-4 accent-action"
                    />
                    <span className="flex-1 truncate">{column.label}</span>
                    {locked ? (
                      <LockIcon className="h-3.5 w-3.5 text-ink-muted" data-testid={`lock-${column.id}`} />
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between border-t border-line px-3.5 pb-1 pt-2.5">
            <button
              type="button"
              onClick={settings.reset}
              className="rounded-control text-[13px] font-semibold text-action hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Reset to default
            </button>
            <span className="text-[11.5px] font-medium text-ink-muted">sizes + columns</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
