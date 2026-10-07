import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  SearchField,
  LoadingState,
  ErrorState,
  EmptyState,
  NoAccessState,
  PageIntro,
  SummaryTiles,
  getButtonClassName,
  type SummaryTile,
} from '../../design-system/components';
import {
  ColumnsMenu,
  DataTableToolbar,
  DensityToggle,
  ResultCount,
  TruncationBanner,
  useSlashFocus,
  useTableSettings,
} from '../../design-system/data-table';
import { useDevSession } from '../../lib/session';
import { ApiError } from '../../lib/api-client';
import { listItems } from './api';
import { ITEM_COLUMNS, ItemTable } from './components/ItemTable';
import { PRIMARY_ITEM_TYPES, PRIMARY_ITEM_TYPE_LABELS, type Item } from './types';

type Status = 'loading' | 'live' | 'error' | 'forbidden';

/** Wait this long after the last keystroke before asking the backend to search. */
export const ITEM_SEARCH_DEBOUNCE_MS = 300;
/** Backend limit for `search` (INV-ITEM-LIST-001). */
const ITEM_SEARCH_MAX_LENGTH = 100;

/**
 * Summary tiles are counted from the branch's full item list, so they are only
 * shown when the last unsearched load was complete (not X-Result-Truncated).
 * A capped list would make every count wrong, so no tiles beat misleading ones.
 */
function buildTiles(items: Item[]): SummaryTile[] {
  const active = items.filter(item => item.active).length;
  const typesInUse = PRIMARY_ITEM_TYPES.filter(type => items.some(item => item.primary_item_type === type));
  return [
    { id: 'total', label: 'Total items', value: items.length, note: 'in this branch' },
    { id: 'active', label: 'Active', value: active, note: 'shown in item pickers' },
    { id: 'inactive', label: 'Inactive', value: items.length - active, note: 'hidden from pickers', tone: 'neutral' },
    {
      id: 'types',
      label: 'Primary types in use',
      value: typesInUse.length,
      note: typesInUse.length ? typesInUse.map(type => PRIMARY_ITEM_TYPE_LABELS[type]).join(' · ') : 'none yet',
    },
  ];
}

export function ItemListPage() {
  const { canEditItems } = useDevSession();
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  // The search runs on the backend (name or code, branch-scoped), so items
  // beyond the list cap are still findable; this is the debounced term sent.
  const [appliedSearch, setAppliedSearch] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  // Last complete, unsearched list — the only source the summary tiles use.
  const [branchItems, setBranchItems] = useState<Item[] | null>(null);

  const settings = useTableSettings('items', ITEM_COLUMNS);
  const searchRef = useRef<HTMLInputElement>(null);
  useSlashFocus(searchRef, { onClear: () => setSearch('') });

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
        if (!appliedSearch) setBranchItems(result.truncated ? null : result.items);
        setStatus('live');
      } catch (err) {
        if (ignore) return;
        // No local fallback: a failed read is shown as an error with Try again,
        // never replaced by cached or partial data.
        if (!appliedSearch) setBranchItems(null);
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

  const tiles = useMemo(() => (branchItems ? buildTiles(branchItems) : null), [branchItems]);

  const newItemLink = (size: 'sm' | 'md') => (
    <Link to="/items/new" className={getButtonClassName({ variant: 'primary', size })}>
      New item
    </Link>
  );

  const intro = (
    <PageIntro
      title="All items"
      description="Every item the restaurant buys, makes or sells. Item code is given by the system and never changes."
      actions={canEditItems && status !== 'forbidden' ? newItemLink('md') : undefined}
    />
  );

  if (status === 'forbidden') {
    return (
      <div className="flex flex-col gap-4">
        {intro}
        <NoAccessState who="Owner or Manager" message="Only Owner or Manager can view items. Ask the owner for access." />
      </div>
    );
  }

  const countText = truncated
    ? `First ${items.length} items`
    : `${items.length} ${items.length === 1 ? 'item' : 'items'}`;

  return (
    <div className="flex flex-col gap-4">
      {intro}

      {tiles ? <SummaryTiles tiles={tiles} ariaLabel="Item summary" /> : null}

      <div className="rounded-card border border-line bg-canvas shadow-card">
        <DataTableToolbar
          start={
            <SearchField
              ref={searchRef}
              shortcutHint="/"
              label="Search items by name or code"
              placeholder="Search item name or code"
              value={search}
              onChange={event => setSearch(event.target.value)}
              onClear={() => setSearch('')}
              maxLength={ITEM_SEARCH_MAX_LENGTH}
              className="w-full max-w-xs"
            />
          }
          end={
            <>
              {status === 'live' ? <ResultCount>{countText}</ResultCount> : null}
              <ColumnsMenu settings={settings} />
              <DensityToggle settings={settings} />
            </>
          }
        />

        {status === 'live' && truncated ? <TruncationBanner className="mx-4 mb-3" /> : null}

        {status === 'loading' ? <LoadingState label="Loading items…" /> : null}

        {status === 'error' ? <ErrorState message={error} onRetry={() => setReloadToken(token => token + 1)} /> : null}

        {status === 'live' ? (
          items.length === 0 ? (
            <EmptyState
              title={appliedSearch ? 'No items match your search' : 'No items yet'}
              message={
                appliedSearch
                  ? 'Check the spelling, or search by item code instead.'
                  : canEditItems
                    ? 'Create your first item to get started. Its item code is given automatically.'
                    : 'Only Owner or Manager can create items.'
              }
              action={!appliedSearch && canEditItems ? newItemLink('sm') : undefined}
            />
          ) : (
            <ItemTable items={items} canEdit={canEditItems} settings={settings} />
          )
        ) : null}
      </div>
    </div>
  );
}
