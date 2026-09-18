import { useEffect, useMemo, useState } from 'react';
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
import { sessionItemCache } from './session-cache';
import { ItemTable } from './components/ItemTable';
import type { Item } from './types';

type Status = 'loading' | 'live' | 'session-cache' | 'error';

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
  const [reloadToken, setReloadToken] = useState(0);
  const successMessage = (location.state as ListLocationState | null)?.successMessage;

  useEffect(() => {
    let ignore = false;

    async function load() {
      setStatus('loading');
      setError('');
      try {
        const result = await listItems();
        if (ignore) return;
        setItems(result);
        setStatus('live');
      } catch (err) {
        if (ignore) return;
        if (err instanceof ApiError && (err.status === 404 || err.code === 'NETWORK_ERROR')) {
          setItems(sessionItemCache.all());
          setStatus('session-cache');
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
  }, [reloadToken]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter(
      item => item.item_name.toLowerCase().includes(query) || item.item_code.toLowerCase().includes(query),
    );
  }, [items, search]);

  return (
    <div className="flex flex-col gap-4">
      {successMessage ? (
        <p role="status" className="rounded-control border border-success-50 bg-success-50 px-3 py-2 text-sm text-success-700">
          {successMessage}
        </p>
      ) : null}

      {status === 'session-cache' ? (
        <p role="status" className="rounded-control border border-line bg-canvas-muted px-3 py-2 text-sm text-ink-muted">
          Showing items created or edited in this browser session. The stable backend does not have a list endpoint
          for items yet, so this is not the full item catalog — see backend/README.md.
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <SearchField
          label="Search items by name or code"
          value={search}
          onChange={event => setSearch(event.target.value)}
          onClear={() => setSearch('')}
          className="w-full max-w-sm"
        />
        {canEditItems ? (
          <Link to="/items/new" className={getButtonClassName({ variant: 'primary' })}>
            New item
          </Link>
        ) : null}
      </div>

      {status === 'loading' ? <LoadingState label="Loading items…" /> : null}

      {status === 'error' ? <ErrorState message={error} onRetry={() => setReloadToken(token => token + 1)} /> : null}

      {status === 'live' || status === 'session-cache' ? (
        filteredItems.length === 0 ? (
          <EmptyState
            title={items.length === 0 ? 'No items yet' : 'No items match your search'}
            message={
              items.length === 0
                ? canEditItems
                  ? 'Create your first item to get started.'
                  : 'Only Owner or Manager can create items (INV-11).'
                : undefined
            }
            action={
              items.length === 0 && canEditItems ? (
                <Link to="/items/new" className={getButtonClassName({ variant: 'primary', size: 'sm' })}>
                  New item
                </Link>
              ) : undefined
            }
          />
        ) : (
          <ItemTable items={filteredItems} canEdit={canEditItems} />
        )
      ) : null}
    </div>
  );
}
