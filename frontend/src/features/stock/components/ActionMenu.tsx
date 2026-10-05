import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { EllipsisVerticalIcon } from '../../../design-system/icons';

export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  tone?: 'default' | 'danger' | 'info';
}

const ITEM_TONES = {
  default: 'text-ink',
  danger: 'text-danger-700',
  info: 'text-info-700',
} as const;

/**
 * Mobile row actions (UI-STOCK-001 L8 / G7): a ⋮ button opening a small menu.
 * Arrow keys move between items, Esc closes and returns focus, a tap outside
 * closes.
 */
export function ActionMenu({ label, items }: { label: string; items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open]);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = itemRefs.current.findIndex(item => item === document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = (current + step + items.length) % items.length;
      itemRefs.current[next]?.focus();
    } else if (event.key === 'Tab') {
      close(false);
    }
  }

  if (items.length === 0) return null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(value => !value)}
        className="flex h-9 w-9 items-center justify-center rounded-control text-ink-secondary hover:bg-canvas-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
      >
        <EllipsisVerticalIcon className="h-5 w-5" />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-full z-20 mt-1 flex min-w-40 flex-col rounded-card border border-line bg-canvas py-1 shadow-dropdown"
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={element => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role="menuitem"
              onClick={() => {
                close(false);
                item.onSelect();
              }}
              className={`px-3 py-2.5 text-left text-[13px] font-medium hover:bg-canvas-hover focus-visible:bg-canvas-hover focus-visible:outline-none ${
                ITEM_TONES[item.tone ?? 'default']
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
