import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  NoAccessState,
  PageIntro,
  SearchField,
  SummaryTiles,
  useToast,
  type SummaryTile,
} from '../../../design-system/components';
import {
  ColumnsMenu,
  DataTableToolbar,
  DensityToggle,
  ResultCount,
  useSlashFocus,
  useTableSettings,
} from '../../../design-system/data-table';
import { LockIcon, PlusIcon, WarehouseIcon } from '../../../design-system/icons';
import { ApiError } from '../../../lib/api-client';
import { useDevSession } from '../../../lib/session';
import { useMediaQuery } from '../../../lib/use-media-query';
import { createLocation, listBalances, listLocations, updateLocation } from '../api';
import { Checkbox } from '../components/Checkbox';
import { describeActiveChangeError, describeStockError } from '../format';
import { orderLocationTree } from '../locations-tree';
import { isPositiveQuantity } from '../quantity';
import { LOCATION_TYPE_LABELS, type StockLocation } from '../types';
import { CannotDeactivateDialog, DeactivateDialog, isBlockedReason, type BlockedReason } from './DeactivateDialogs';
import { LocationFormDialog, type LocationFormValues } from './LocationFormDialog';
import { LOCATION_COLUMNS, LocationCards, LocationsTable } from './LocationsList';

type Status = 'loading' | 'live' | 'error';

type DialogState =
  | { kind: 'create' }
  | { kind: 'rename'; location: StockLocation }
  | { kind: 'deactivate'; location: StockLocation }
  | { kind: 'blocked'; location: StockLocation; reason: BlockedReason };

const PAGE_TITLE = 'Stores, kitchens and freezers';
const PAGE_DESCRIPTION =
  'Where stock is kept. Freezers sit under their store or kitchen. A location with stock cannot be deactivated.';

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Summary tiles — counts from the already-loaded location list (inactive locations included). */
function locationTiles(locations: StockLocation[]): SummaryTile[] {
  const inactive = locations.filter(location => !location.active).length;
  const ofType = (type: StockLocation['location_type']) => locations.filter(location => location.location_type === type).length;
  return [
    { id: 'locations', label: 'Locations', value: locations.length, note: `${inactive} inactive` },
    { id: 'stores', label: 'Stores', value: ofType('STORE'), note: 'top-level storage areas' },
    { id: 'kitchens', label: 'Kitchens', value: ofType('KITCHEN'), note: 'top-level kitchen areas' },
    { id: 'freezers', label: 'Freezers', value: ofType('FREEZER'), note: 'inside a store or kitchen', tone: 'info' },
  ];
}

/** Stock Locations screen (UI-STOCK-001 L1–L8, Direction A refresh). Reads and writes are Owner / Manager; `active` is Owner only. */
export function StockLocationsPage() {
  const { canEditItems, identity } = useDevSession();
  if (!canEditItems) {
    return <NoAccessState title="You don't have access to Stock Locations" who="Owner and Manager" />;
  }
  return <StockLocationsContent isOwner={identity.role === 'OWNER'} />;
}

function StockLocationsContent({ isOwner }: { isOwner: boolean }) {
  const isWide = useMediaQuery('(min-width: 768px)');
  const toast = useToast();
  const settings = useTableSettings('stock-locations', LOCATION_COLUMNS);
  const searchRef = useRef<HTMLInputElement>(null);
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

  useSlashFocus(searchRef, { onClear: () => setSearch('') });

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

  const tiles = useMemo(() => locationTiles(locations), [locations]);

  async function handleFormSubmit(values: LocationFormValues) {
    if (dialog?.kind === 'rename') {
      const previous = dialog.location.name;
      await updateLocation(dialog.location.id, { name: values.name });
      toast.success({ title: 'Location renamed', detail: `${previous} → ${values.name}` });
    } else {
      await createLocation(values);
      const parent = values.parent_id ? locations.find(candidate => candidate.id === values.parent_id) : undefined;
      toast.success({
        title: 'Location created',
        detail: `${values.name} · ${LOCATION_TYPE_LABELS[values.location_type]}${parent ? ` under ${parent.name}` : ''}`,
      });
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
      toast.success({ title: 'Location deactivated', detail: `${location.name} · Active → Inactive` });
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
      toast.success({ title: 'Location activated', detail: `${location.name} · Inactive → Active` });
      reload();
    } catch (error) {
      // No dialog belongs to Activate, so the reason stays visible above the list until the next action.
      const message =
        error instanceof ApiError && error.code === 'PARENT_INACTIVE'
          ? 'Activate its parent store or kitchen first. (409 · PARENT_INACTIVE)'
          : describeActiveChangeError(error);
      setActionError(`Couldn't activate ${location.name}: ${message}`);
    } finally {
      setBusyId(undefined);
    }
  }

  const openCreate = () => {
    setActionError(undefined);
    setDialog({ kind: 'create' });
  };

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

  const isEmpty = status === 'live' && locations.length === 0;

  const ownerNote = !isOwner ? (
    <p className="flex items-center gap-1.5 text-xs text-ink-muted">
      <LockIcon className="h-3.5 w-3.5 shrink-0" />
      Only the Owner can activate or deactivate locations
    </p>
  ) : null;

  const resultCount =
    status === 'live'
      ? rows.length === locations.length
        ? plural(locations.length, 'location', 'locations')
        : `${rows.length} of ${plural(locations.length, 'location', 'locations')}`
      : null;

  const searchField = (
    <SearchField
      ref={searchRef}
      label="Search locations by name"
      placeholder={isWide ? 'Search locations by name' : 'Search locations'}
      value={search}
      onChange={event => setSearch(event.target.value)}
      onClear={() => setSearch('')}
      {...(isWide ? { shortcutHint: '/' } : {})}
      className={isWide ? 'w-[280px]' : 'min-w-0 flex-1'}
    />
  );
  const showInactiveBox = !isEmpty ? (
    <Checkbox label="Show inactive" checked={showInactive} onChange={setShowInactive} />
  ) : null;

  const toolbar = isWide ? (
    <DataTableToolbar
      start={
        <>
          {searchField}
          {showInactiveBox}
          {ownerNote}
        </>
      }
      end={
        <>
          {resultCount ? <ResultCount>{resultCount}</ResultCount> : null}
          <ColumnsMenu settings={settings} />
          <DensityToggle settings={settings} />
        </>
      }
    />
  ) : (
    <div className="flex flex-col gap-2">
      {searchField}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
        {showInactiveBox}
        {ownerNote}
        {resultCount ? (
          <span className="ml-auto">
            <ResultCount>{resultCount}</ResultCount>
          </span>
        ) : null}
      </div>
    </div>
  );

  let body;
  if (status === 'loading') {
    body = <LoadingState label="Loading locations…" rows={6} />;
  } else if (status === 'error') {
    body = <ErrorState title="Couldn't load stock locations" message={loadError} onRetry={reload} />;
  } else if (isEmpty) {
    body = (
      <EmptyState
        icon={<WarehouseIcon />}
        title="No stock locations yet"
        message="Add your main store first, then kitchens and the freezers inside them. Stock can only be recorded against a location."
        action={
          <Button onClick={openCreate}>
            <PlusIcon className="h-4 w-4" />
            New location
          </Button>
        }
      />
    );
  } else if (rows.length === 0) {
    body = (
      <p className="px-4 py-10 text-center text-[13px] text-ink-muted">
        {search.trim() ? 'No locations match your search.' : 'No active locations. Tick “Show inactive” to see the rest.'}
      </p>
    );
  } else {
    body = isWide ? <LocationsTable settings={settings} {...listProps} /> : <LocationCards {...listProps} />;
  }

  const footer =
    status === 'live' && !isEmpty ? (
      <p className={`text-xs text-ink-muted ${isWide ? 'border-t border-line px-4 py-3' : 'px-1'}`}>
        “Items in stock” = items with a balance above zero{isOwner ? ' · activate / deactivate is Owner only' : ''}
      </p>
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
    <div className="flex flex-col gap-5">
      <PageIntro
        title={PAGE_TITLE}
        description={PAGE_DESCRIPTION}
        actions={
          <Button onClick={openCreate} className="font-semibold">
            <PlusIcon className="h-4 w-4" />
            New location
          </Button>
        }
      />

      {status === 'live' ? <SummaryTiles tiles={tiles} ariaLabel="Locations summary" /> : null}

      {isWide ? (
        <section aria-label="Stock locations" className="rounded-card border border-line bg-canvas shadow-card">
          {toolbar}
          {errorBanner}
          {body}
          {footer}
        </section>
      ) : (
        <section aria-label="Stock locations" className="flex flex-col gap-3">
          {toolbar}
          {errorBanner}
          {status === 'error' || isEmpty ? <div className="rounded-card border border-line bg-canvas">{body}</div> : body}
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
    </div>
  );
}
