import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { ChevronDownIcon } from '../../../design-system/icons';
import { listItemsPage } from '../../items/api';
import type { Item } from '../../items/types';
import { describeStockError } from '../format';

/**
 * One picker request returns at most this many items (a technical page size,
 * not a business rule). The server says when more matched
 * (`X-Result-Truncated`), and the picker then asks the user to type more.
 */
export const ITEM_PICKER_LIMIT = 50;
/** Wait for a short typing pause before asking the server. */
export const ITEM_SEARCH_DELAY_MS = 250;
/** Server limit for `search` (INV-ITEM-LIST-001). */
const SEARCH_MAX_LENGTH = 100;

type Results =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'live'; items: Item[]; truncated: boolean };

interface ItemPickerProps {
  value: Item | null;
  onChange: (item: Item | null) => void;
  error?: string | undefined;
  disabled?: boolean;
}

export function itemLabel(item: Item): string {
  return `${item.item_name} · ${item.item_code}`;
}

/**
 * G4 item picker: a combobox over `GET /api/inventory/items?search=…&active=true`.
 * Only active items are offered (stock cannot be recorded for an inactive
 * item); the server stays the final guard (409 ITEM_INACTIVE).
 */
export function ItemPicker({ value, onChange, error, disabled = false }: ItemPickerProps) {
  const inputId = useId();
  const listId = useId();
  const hintId = useId();
  const [text, setText] = useState(value ? itemLabel(value) : '');
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<{ key: string; results: Results } | null>(null);
  const [active, setActive] = useState(-1);
  const [retryToken, setRetryToken] = useState(0);

  // While an item is chosen the input shows its label; opening the list again
  // then shows every item rather than searching for that label.
  const term = value ? '' : text.trim();
  // Results belong to one search term (and retry); anything else is still loading.
  const requestKey = `${retryToken}:${term}`;
  const results: Results = answer?.key === requestKey ? answer.results : { status: 'loading' };

  useEffect(() => {
    if (!open) return;
    let ignore = false;
    const timer = window.setTimeout(() => {
      listItemsPage({ search: term, active: true, limit: ITEM_PICKER_LIMIT })
        .then(page => {
          if (!ignore) setAnswer({ key: requestKey, results: { status: 'live', items: page.items, truncated: page.truncated } });
        })
        .catch((reason: unknown) => {
          if (!ignore) setAnswer({ key: requestKey, results: { status: 'error', message: describeStockError(reason) } });
        });
    }, ITEM_SEARCH_DELAY_MS);
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [open, term, requestKey]);

  const items = results.status === 'live' ? results.items : [];

  function openList() {
    if (open) return;
    setActive(-1);
    setOpen(true);
  }

  function choose(item: Item) {
    onChange(item);
    setText(itemLabel(item));
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openList();
        return;
      }
      if (items.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive(index => (index + step + items.length) % items.length);
    } else if (event.key === 'Enter' && open) {
      // Never submit the dialog form from inside the picker.
      event.preventDefault();
      const item = items[active];
      if (item) choose(item);
    } else if (event.key === 'Escape' && open) {
      // Close the list only — not the dialog around it.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }

  let statusText: string | undefined;
  if (results.status === 'loading') statusText = 'Searching items…';
  else if (results.status === 'error') statusText = `Could not load items: ${results.message}`;
  else if (results.items.length === 0) {
    statusText = term ? `No active item matches “${term}”.` : 'No active items yet — add items in Item Master first.';
  } else if (results.truncated) {
    statusText = `Showing the first ${results.items.length} matches — type more of the name or code to narrow the search.`;
  }

  const activeId = open && items[active] ? `${listId}-${items[active].id}` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        Item
      </label>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-invalid={error ? true : undefined}
          aria-describedby={hintId}
          autoComplete="off"
          maxLength={SEARCH_MAX_LENGTH}
          placeholder="Search item name or code…"
          value={text}
          disabled={disabled}
          onChange={event => {
            setText(event.target.value);
            if (value) onChange(null);
            setActive(-1);
            setOpen(true);
          }}
          onClick={openList}
          onKeyDown={handleKeyDown}
          onBlur={() => setOpen(false)}
          className={`h-10 w-full rounded-control border bg-canvas pl-3 pr-9 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:bg-canvas-muted disabled:text-ink-muted ${
            error ? 'border-danger-600' : 'border-line'
          }`}
        />
        <ChevronDownIcon className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-ink-secondary" />
        {open ? (
          <div
            // Keep focus in the input while choosing with the mouse.
            onMouseDown={event => event.preventDefault()}
            className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-control border border-line bg-canvas shadow-modal"
          >
            <ul id={listId} role="listbox" aria-label="Items" className="max-h-52 overflow-y-auto py-1">
              {items.map((item, index) => (
                <li
                  key={item.id}
                  id={`${listId}-${item.id}`}
                  role="option"
                  aria-selected={value?.id === item.id}
                  onClick={() => choose(item)}
                  onMouseEnter={() => setActive(index)}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-[13px] ${
                    index === active ? 'bg-canvas-muted' : ''
                  }`}
                >
                  <span className="truncate font-medium text-ink">{item.item_name}</span>
                  <span className="shrink-0 text-xs text-ink-muted">
                    {item.item_code} · {item.base_uom}
                  </span>
                </li>
              ))}
            </ul>
            {statusText ? (
              <div
                role="status"
                className={`flex items-center justify-between gap-3 border-t border-line px-3 py-2 text-xs ${
                  results.status === 'error' ? 'text-danger-700' : 'text-ink-muted'
                }`}
              >
                <span>{statusText}</span>
                {results.status === 'error' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActive(-1);
                      setRetryToken(token => token + 1);
                    }}
                    className="shrink-0 font-semibold text-action hover:underline"
                  >
                    Retry
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {error ? (
        <p id={hintId} role="alert" className="text-xs font-medium text-danger-600">
          {error}
        </p>
      ) : (
        <p id={hintId} className="text-xs text-ink-muted">
          Active items only. Type part of the name or code.
        </p>
      )}
    </div>
  );
}
