import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { Button, ErrorState, LoadingState } from '../../../design-system/components';
import { CheckIcon } from '../../../design-system/icons';
import { useDevSession } from '../../../lib/session';
import { useMediaQuery } from '../../../lib/use-media-query';
import { listLocations } from '../api';
import { describeStockError, formatDateTime } from '../format';
import { locationPath } from '../locations-tree';
import { formatQuantity } from '../quantity';
import type { StockBalance, StockLocation, StockMovement } from '../types';
import { AdjustStockDialog } from './AdjustStockDialog';
import { BalancesView } from './BalancesView';
import { MovementsView, type ItemFilter } from './MovementsView';
import { OpeningStockDialog, type OpeningSaved } from './OpeningStockDialog';

type Tab = 'balances' | 'movements';

const TABS: { key: Tab; label: string }[] = [
  { key: 'balances', label: 'Balances' },
  { key: 'movements', label: 'Movements' },
];

type LocationsState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'live'; locations: StockLocation[] };

/** Stock Ledger screen (UI-STOCK-001 G1–G7). Owner / Manager only (G-5). */
export function StockLedgerPage() {
  const { canEditItems } = useDevSession();
  if (!canEditItems) {
    return (
      <ErrorState
        title="You don't have access to the Stock Ledger"
        message="Your current role doesn't have permission — only Owner or Manager can view stock balances and movements."
      />
    );
  }
  return <StockLedgerContent />;
}

function StockLedgerContent() {
  const isWide = useMediaQuery('(min-width: 768px)');
  const tabsId = useId();
  const [locationsState, setLocationsState] = useState<LocationsState>({ status: 'loading' });
  const [locationsToken, setLocationsToken] = useState(0);
  const [tab, setTab] = useState<Tab>('balances');
  const [balanceLocation, setBalanceLocation] = useState('');
  const [search, setSearch] = useState('');
  const [hideZero, setHideZero] = useState(true);
  const [movementLocation, setMovementLocation] = useState('');
  const [movementItem, setMovementItem] = useState<ItemFilter | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [adjusting, setAdjusting] = useState<StockBalance | null>(null);
  const [opening, setOpening] = useState(false);
  const [savedNote, setSavedNote] = useState<string>();

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLocationsState({ status: 'loading' });
      try {
        const locations = await listLocations();
        if (!ignore) setLocationsState({ status: 'live', locations });
      } catch (error) {
        if (!ignore) setLocationsState({ status: 'error', message: describeStockError(error) });
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [locationsToken]);

  const locations = useMemo(() => (locationsState.status === 'live' ? locationsState.locations : []), [locationsState]);
  const byId = useMemo(() => new Map(locations.map(location => [location.id, location])), [locations]);
  const labelFor = (balance: StockBalance) => {
    const location = byId.get(balance.location_id);
    return location ? locationPath(location, byId) : balance.location_name;
  };

  // The approved G2 frame (115:11417) shows History as the item across all
  // locations ("All locations", "Balance now … (2 locations)"); the location
  // select stays available to narrow it to one location.
  function openHistory(balance: StockBalance) {
    setMovementItem({ id: balance.item_id, label: `${balance.item_name} (${balance.item_code})` });
    setMovementLocation('');
    setSavedNote(undefined);
    setTab('movements');
  }

  function handleSaved(balance: StockBalance, movement: StockMovement) {
    setAdjusting(null);
    setReloadToken(token => token + 1);
    setSavedNote(
      `Adjustment saved — ${balance.item_name} at ${labelFor(balance)}: ${formatQuantity(movement.quantity_delta, {
        signed: true,
      })} ${balance.base_uom} (${formatDateTime(movement.created_at)}).`,
    );
  }

  function handleOpeningSaved({ movement, item, locationLabel }: OpeningSaved) {
    setOpening(false);
    setReloadToken(token => token + 1);
    setSavedNote(
      `Opening stock saved — ${item.item_name} at ${locationLabel}: ${formatQuantity(movement.quantity_delta)} ${
        item.base_uom
      } (${formatDateTime(movement.created_at)}).`,
    );
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next: Tab = tab === 'balances' ? 'movements' : 'balances';
    setTab(next);
    document.getElementById(`${tabsId}-${next}-tab`)?.focus();
  }

  if (locationsState.status === 'loading') return <LoadingState label="Loading stock ledger…" />;
  if (locationsState.status === 'error') {
    return <ErrorState message={locationsState.message} onRetry={() => setLocationsToken(token => token + 1)} />;
  }

  const tabList = (
    <div
      role="tablist"
      aria-label="Stock ledger"
      onKeyDown={handleTabKeyDown}
      className={
        isWide
          ? 'flex gap-6 border-b border-line px-4'
          : 'flex rounded-card border border-line bg-canvas-sunken p-1'
      }
    >
      {TABS.map(entry => {
        const selected = tab === entry.key;
        return (
          <button
            key={entry.key}
            id={`${tabsId}-${entry.key}-tab`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={selected ? `${tabsId}-${entry.key}-panel` : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => setTab(entry.key)}
            className={
              isWide
                ? `-mb-px border-b-2 pb-2.5 pt-3 text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus ${
                    selected ? 'border-action font-semibold text-ink' : 'border-transparent font-medium text-ink-muted hover:text-ink'
                  }`
                : `h-9 flex-1 rounded-control text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus ${
                    selected ? 'bg-canvas font-semibold text-ink shadow-card' : 'font-medium text-ink-secondary'
                  }`
            }
          >
            {entry.label}
          </button>
        );
      })}
    </div>
  );

  // G4: the item picker uses the item list/search endpoint (D-1,
  // INV-ITEM-LIST-001), so gap G-1 is closed. Not shown on mobile (G7).
  const openingStock = (
    <Button
      variant="secondary"
      onClick={() => {
        setSavedNote(undefined);
        setOpening(true);
      }}
      className="h-9 shrink-0 font-semibold"
    >
      Opening stock
    </Button>
  );

  const panel =
    tab === 'balances' ? (
      <BalancesView
        isWide={isWide}
        locations={locations}
        locationId={balanceLocation}
        onLocationChange={setBalanceLocation}
        search={search}
        onSearchChange={setSearch}
        hideZero={hideZero}
        onHideZeroChange={setHideZero}
        reloadToken={reloadToken}
        toolbarEnd={openingStock}
        onHistory={openHistory}
        onAdjust={balance => {
          setSavedNote(undefined);
          setAdjusting(balance);
        }}
      />
    ) : (
      <MovementsView
        isWide={isWide}
        locations={locations}
        locationId={movementLocation}
        onLocationChange={setMovementLocation}
        item={movementItem}
        onClearItem={() => setMovementItem(null)}
        reloadToken={reloadToken}
      />
    );

  const saved = savedNote ? (
    <p
      role="status"
      className={`flex items-center gap-2 rounded-control bg-success-50 px-3 py-2 text-[13px] text-success-700 ${isWide ? 'mx-4 mt-3' : ''}`}
    >
      <CheckIcon className="h-4 w-4 shrink-0" />
      {savedNote}
    </p>
  ) : null;

  return (
    <>
      <section
        aria-label="Stock ledger"
        className={isWide ? 'overflow-hidden rounded-card border border-line bg-canvas' : 'flex flex-col gap-3'}
      >
        {tabList}
        {saved}
        <div id={`${tabsId}-${tab}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}-tab`}>
          {panel}
        </div>
      </section>
      {adjusting ? (
        <AdjustStockDialog
          balance={adjusting}
          locationLabel={labelFor(adjusting)}
          onSaved={movement => handleSaved(adjusting, movement)}
          onClose={() => setAdjusting(null)}
        />
      ) : null}
      {opening ? (
        <OpeningStockDialog locations={locations} onSaved={handleOpeningSaved} onClose={() => setOpening(false)} />
      ) : null}
    </>
  );
}
