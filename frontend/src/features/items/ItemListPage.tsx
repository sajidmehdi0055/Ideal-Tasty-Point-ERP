import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  SearchField,
  LoadingState,
  ErrorState,
  EmptyState,
  getButtonClassName,
} from '../../design-system/components';
import { useDevSession } from '../../lib/session';
import { ApiError } from '../../lib/api-client';
import { listItems } from './api';
import { ItemTable } from './components/ItemTable';
import type { Item } from './types';

type Status = 'loading' | 'live' | 'error' | 'forbidden';

/** Wait this long after the last keystroke before asking the backend to search. */
export const ITEM_SEARCH_DEBOUNCE_MS = 300;
/** Backend limit for `search` (INV-ITEM-LIST-001). */
const ITEM_SEARCH_MAX_LENGTH = 100;

interface ListLocationState {
  successMessage?: string;
}

export function ItemListPage() {
  const { canEditItems } = useDevSession();
  const location = useLocation();
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  // The search runs on the backend (name or code, branch-scoped), so items
  // beyond the list cap are still findable; this is the debounced term sent.
  const [appliedSearch, setAppliedSearch] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  // location.state never changes again for as long as this component stays
  // mounted, so reading successMessage from it directly showed the same
  // banner on every re-render — including ones triggered by search/filter/
  // retry, long after the create/edit it confirmed. `dismissed` makes it a
  // true one-time confirmation: it goes away the moment the user does
  // anything else on this page.
  const [dismissed, setDismissed] = useState(false);
  const successMessage = dismissed ? undefined : (location.state as ListLocationState | null)?.successMessage;

  useEffect(() => {
    const term = search.trim();
    if (term === appliedSearch) return;
    const timer = window.setTimeout(() => setAppliedSearch(term), ITEM_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search, appliedSearch]);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setStatus('loading');
      setError('');
      try {
        const result = await listItems(appliedSearch ? { search: appliedSearch } : {});
        if (ignore) return;
        setItems(result.items);
        setTruncated(result.truncated);
        setStatus('live');
      } catch (err) {
        if (ignore) return;
        // No local fallback: a failed read is shown as an error with Retry,
        // never replaced by cached or partial data.
        if (err instanceof ApiError && err.status === 403) {
          // The list endpoint is OWNER/MANAGER only (INV-11); retrying cannot help.
          setStatus('forbidden');
          return;
        }
        setError(err instanceof ApiError ? err.message : 'Something went wrong.');
        setStatus('error');
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [reloadToken, appliedSearch]);

  return (
    <div className="flex flex-col gap-4">
      {successMessage ? (
        <p role="status" className="rounded-control border border-success-50 bg-success-50 px-3 py-2 text-sm text-success-700">
          {successMessage}
        </p>
      ) : null}

      {status === 'live' && truncated ? (
        <p role="status" className="rounded-control border border-line bg-canvas-muted px-3 py-2 text-sm text-ink-muted">
          Showing the first {items.length} {appliedSearch ? 'matching items' : 'items'} (A–Z). More items exist — search by
          name or code to narrow the list.
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <SearchField
          label="Search items by name or code"
          value={search}
          onChange={event => {
            setSearch(event.target.value);
            setDismissed(true);
          }}
          onClear={() => setSearch('')}
          maxLength={ITEM_SEARCH_MAX_LENGTH}
          className="w-full max-w-sm"
        />
        {canEditItems ? (
          <Link to="/items/new" className={getButtonClassName({ variant: 'primary' })}>
            New item
          </Link>
        ) : null}
      </div>

      {status === 'loading' ? <LoadingState label="Loading items…" /> : null}

      {status === 'error' ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setReloadToken(token => token + 1);
            setDismissed(true);
          }}
        />
      ) : null}

      {status === 'forbidden' ? (
        <ErrorState
          title="No access to the item list"
          message="Only Owner or Manager can view items (INV-11). Your current role does not have this permission."
        />
      ) : null}

      {status === 'live' ? (
        items.length === 0 ? (
          <EmptyState
            title={appliedSearch ? 'No items match your search' : 'No items yet'}
            message={
              !appliedSearch
                ? canEditItems
                  ? 'Create your first item to get started.'
                  : 'Only Owner or Manager can create items (INV-11).'
                : undefined
            }
            action={
              !appliedSearch && canEditItems ? (
                <Link to="/items/new" className={getButtonClassName({ variant: 'primary', size: 'sm' })}>
                  New item
                </Link>
              ) : undefined
            }
          />
        ) : (
          <ItemTable items={items} canEdit={canEditItems} />
        )
      ) : null}
    </div>
  );
}
