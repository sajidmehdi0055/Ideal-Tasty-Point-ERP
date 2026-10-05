import { useEffect, useMemo, useState } from 'react';
import { Button, ErrorState, LoadingState, SearchField } from '../../../design-system/components';
import { LockIcon, PlusIcon, WarehouseIcon } from '../../../design-system/icons';
import { ApiError } from '../../../lib/api-client';
import { useDevSession } from '../../../lib/session';
import { useMediaQuery } from '../../../lib/use-media-query';
import { createLocation, listBalances, listLocations, updateLocation } from '../api';
import { Checkbox } from '../components/Checkbox';
import { describeStockError } from '../format';
import { orderLocationTree } from '../locations-tree';
import { isPositiveQuantity } from '../quantity';
import type { StockLocation } from '../types';
import { CannotDeactivateDialog, DeactivateDialog, isBlockedReason, type BlockedReason } from './DeactivateDialogs';
import { LocationFormDialog, type LocationFormValues } from './LocationFormDialog';
import { LocationCards, LocationsTable } from './LocationsList';

type Status = 'loading' | 'live' | 'error';

type DialogState =
  | { kind: 'create' }
  | { kind: 'rename'; location: StockLocation }
  | { kind: 'deactivate'; location: StockLocation }
  | { kind: 'blocked'; location: StockLocation; reason: BlockedReason };

/** Stock Locations screen (UI-STOCK-001 L1–L8). Reads and writes are Owner / Manager; `active` is Owner only. */
export function StockLocationsPage() {
  const { canEditItems, identity } = useDevSession();
  if (!canEditItems) {
    return (
      <ErrorState
        title="You don't have access to Stock Locations"
        message="Your current role doesn't have permission — only Owner or Manager can view or manage stock locations."
      />
    );
  }
  return <StockLocationsContent isOwner={identity.role === 'OWNER'} />;
}

function StockLocationsContent({ isOwner }: { isOwner: boolean }) {
  const isWide = useMediaQuery('(min-width: 768px)');
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [itemsInStock, setItemsInStock] = useState<Map<string, number>>(new Map());
  const [status, setStatus] = useState<Status>('loading');
  const [loadError, setLoadError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [search, setSearch] = useState('');
  // The approved L1 frame shows "Show inactive" ticked by default.
  const [showInactive, setShowInactive] = useState(true);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [actionError, setActionError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();

  useEffect(() => {
    let ignore = false;
    async function load() {
      setStatus(current => (current === 'live' ? 'live' : 'loading'));
      try {
        const [locationList, balances] = await Promise.all([listLocations(), listBalances()]);
        if (ignore) return;
        const counts = new Map<string, number>();
        for (const balance of balances) {
          if (isPositiveQuantity(balance.quantity)) {
            counts.set(balance.location_id, (counts.get(balance.location_id) ?? 0) + 1);
          }
        }
        setLocations(locationList);
        setItemsInStock(counts);
        setStatus('live');
      } catch (error) {
        if (ignore) return;
        setLoadError(describeStockError(error));
        setStatus('error');
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [reloadToken]);

  const reload = () => setReloadToken(token => token + 1);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orderLocationTree(locations).filter(
      row => (showInactive || row.location.active) && (!query || row.location.name.toLowerCase().includes(query)),
    );
  }, [locations, search, showInactive]);

  const inactiveCount = locations.filter(location => !location.active).length;

  async function handleFormSubmit(values: LocationFormValues) {
    if (dialog?.kind === 'rename') {
      await updateLocation(dialog.location.id, { name: values.name });
    } else {
      await createLocation(values);
    }
    setDialog(null);
    reload();
  }

  function requestDeactivate(location: StockLocation) {
    setActionError(undefined);
    // Known from the loaded data: say so straight away instead of a confirmation
    // that would claim the location is empty. The server stays the final guard.
    if ((itemsInStock.get(location.id) ?? 0) > 0) {
      setDialog({ kind: 'blocked', location, reason: 'LOCATION_HAS_STOCK' });
    } else if (locations.some(child => child.parent_id === location.id && child.active)) {
      setDialog({ kind: 'blocked', location, reason: 'LOCATION_HAS_ACTIVE_CHILDREN' });
    } else {
      setDialog({ kind: 'deactivate', location });
    }
  }

  async function confirmDeactivate(location: StockLocation) {
    try {
      await updateLocation(location.id, { active: false });
      setDialog(null);
      reload();
    } catch (error) {
      if (error instanceof ApiError && isBlockedReason(error.code)) {
        setDialog({ kind: 'blocked', location, reason: error.code });
        reload();
        return;
      }
      throw error;
    }
  }

  async function activate(location: StockLocation) {
    setActionError(undefined);
    setBusyId(location.id);
    try {
      await updateLocation(location.id, { active: true });
      reload();
    } catch (error) {
      const message =
        error instanceof ApiError && error.code === 'PARENT_INACTIVE'
          ? 'Activate its parent store or kitchen first. (409 · PARENT_INACTIVE)'
          : describeStockError(error);
      setActionError(`Couldn't activate ${location.name}: ${message}`);
    } finally {
      setBusyId(undefined);
    }
  }

  const listProps = {
    rows,
    itemsInStock,
    isOwner,
    busyId,
    onRename: (location: StockLocation) => {
      setActionError(undefined);
      setDialog({ kind: 'rename', location });
    },
    onDeactivate: requestDeactivate,
    onActivate: (location: StockLocation) => void activate(location),
  };

  const newButton = isWide ? (
    <Button onClick={() => setDialog({ kind: 'create' })} className="h-9 shrink-0 font-semibold">
      <PlusIcon className="h-4 w-4" />
      New location
    </Button>
  ) : (
    <button
      type="button"
      onClick={() => setDialog({ kind: 'create' })}
      aria-label="New location"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-action text-on-action hover:bg-action-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <PlusIcon className="h-5 w-5" />
    </button>
  );

  const ownerNote = !isOwner ? (
    <p className="flex items-center gap-1.5 text-xs text-ink-muted">
      <LockIcon className="h-3.5 w-3.5 shrink-0" />
      Only the Owner can activate or deactivate locations
    </p>
  ) : null;

  const isEmpty = status === 'live' && locations.length === 0;

  const searchField = (
    <SearchField
      label="Search locations by name"
      placeholder={isWide ? 'Search locations by name' : 'Search locations'}
      value={search}
      onChange={event => setSearch(event.target.value)}
      onClear={() => setSearch('')}
      className={isWide ? 'w-[300px] [&_input]:h-9' : 'min-w-0 flex-1'}
    />
  );
  const showInactiveBox = !isEmpty ? (
    <Checkbox label="Show inactive" checked={showInactive} onChange={setShowInactive} />
  ) : null;

  const toolbar = isWide ? (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
      {searchField}
      {showInactiveBox}
      {ownerNote}
      <div className="flex-1" />
      {newButton}
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {searchField}
        {newButton}
      </div>
      {showInactiveBox || ownerNote ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
          {showInactiveBox}
          {ownerNote}
        </div>
      ) : null}
    </div>
  );

  let body;
  if (status === 'loading') {
    body = <LoadingState label="Loading locations…" />;
  } else if (status === 'error') {
    body = (
      <div className={isWide ? 'p-4' : ''}>
        <ErrorState message={loadError} onRetry={reload} />
      </div>
    );
  } else if (isEmpty) {
    body = (
      <div className="flex flex-col items-center gap-2 px-6 pb-12 pt-8 text-center">
        <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-canvas-sunken text-ink-secondary">
          <WarehouseIcon className="h-5 w-5" />
        </span>
        <p className="text-base font-semibold text-ink">No stock locations yet</p>
        <p className="max-w-sm text-[13px] text-ink-secondary">
          Add your main store first, then kitchens and the freezers inside them. Stock can only be recorded against a
          location.
        </p>
        <Button onClick={() => setDialog({ kind: 'create' })} size="sm" className="mt-2 font-semibold">
          <PlusIcon className="h-4 w-4" />
          New location
        </Button>
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <p className="px-4 py-10 text-center text-[13px] text-ink-muted">
        {search.trim() ? 'No locations match your search.' : 'No active locations. Tick “Show inactive” to see the rest.'}
      </p>
    );
  } else {
    body = isWide ? <LocationsTable {...listProps} /> : <LocationCards {...listProps} />;
  }

  const footer =
    status === 'live' && !isEmpty ? (
      <div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted ${isWide ? 'px-4 py-3' : 'px-1'}`}>
        <p>
          {locations.length} {locations.length === 1 ? 'location' : 'locations'} · {inactiveCount} inactive
        </p>
        <p>“Items in stock” = items with a balance above zero (from stock balances).</p>
      </div>
    ) : null;

  const errorBanner = actionError ? (
    <p
      role="alert"
      className={`rounded-control border border-danger-50 bg-danger-50 px-3 py-2 text-sm text-danger-700 ${isWide ? 'mx-4 mb-3' : ''}`}
    >
      {actionError}
    </p>
  ) : null;

  return (
    <>
      {isWide ? (
        <section aria-label="Stock locations" className="overflow-hidden rounded-card border border-line bg-canvas">
          {toolbar}
          {errorBanner}
          {body}
          {footer}
        </section>
      ) : (
        <section aria-label="Stock locations" className="flex flex-col gap-3">
          {toolbar}
          {errorBanner}
          {body}
          {footer}
        </section>
      )}

      {dialog?.kind === 'create' || dialog?.kind === 'rename' ? (
        <LocationFormDialog
          mode={dialog.kind}
          location={dialog.kind === 'rename' ? dialog.location : undefined}
          locations={locations}
          onSubmit={handleFormSubmit}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'deactivate' ? (
        <DeactivateDialog
          location={dialog.location}
          onConfirm={() => confirmDeactivate(dialog.location)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'blocked' ? (
        <CannotDeactivateDialog
          location={dialog.location}
          reason={dialog.reason}
          itemsInStock={itemsInStock.get(dialog.location.id)}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}
