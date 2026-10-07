import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import {
  Button,
  ErrorState,
  LoadingState,
  NoAccessState,
  PageIntro,
  SummaryTiles,
  useToast,
  type SummaryTile,
} from '../../../design-system/components';
import { formatQuantity, formatSignedQuantity, unitLabel } from '../../../lib/format';
import { useDevSession } from '../../../lib/session';
import { useMediaQuery } from '../../../lib/use-media-query';
import { listBalances, listLocations, listTransfers } from '../api';
import { describeStockError } from '../format';
import { locationPath } from '../locations-tree';
import { isPositiveQuantity, isZeroQuantity, parseQuantity, toDecimalString } from '../quantity';
import { LOCATION_TYPES, LOCATION_TYPE_LABELS, type StockBalance, type StockLocation, type StockMovement } from '../types';
import { AdjustStockDialog } from './AdjustStockDialog';
import { BalancesView, type BalancesState } from './BalancesView';
import { MovementsView, type ItemFilter } from './MovementsView';
import { OpeningStockDialog, type OpeningSaved } from './OpeningStockDialog';

type Tab = 'balances' | 'movements';

const TABS: { key: Tab; label: string }[] = [
  { key: 'balances', label: 'Balances' },
  { key: 'movements', label: 'Movements' },
];

const INTRO: Record<Tab, { title: string; description: string }> = {
  balances: {
    title: 'Balances by location',
    description: 'Current quantity of every item at every store, kitchen and freezer. Quantity only — no value or cost.',
  },
  movements: {
    title: 'Stock movements',
    description:
      'Every opening, receipt, transfer and adjustment, newest first. Entries are permanent — a mistake is corrected with a new adjustment.',
  },
};

type LocationsState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'live'; locations: StockLocation[] };
type TransfersState = { status: 'loading' } | { status: 'error' } | { status: 'live'; count: number };

interface StockLedgerPageProps {
  /** "Now" for the Movements day labels (Today / Yesterday); tests pass a fixed time. */
  now?: Date | undefined;
}

/** Stock Ledger screen (UI-STOCK-001 G1–G7, Direction A refresh UI-REFRESH-001). Owner / Manager only (G-5). */
export function StockLedgerPage({ now }: StockLedgerPageProps = {}) {
  const { canEditItems } = useDevSession();
  if (!canEditItems) {
    return <NoAccessState title="You don't have access to the Stock Ledger" who="Owner and Manager" />;
  }
  return <StockLedgerContent now={now} />;
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/** "1 store · 1 kitchen · 2 freezers" — active locations by type; types with none are left out. */
function locationTypesNote(active: StockLocation[]): string {
  const parts = LOCATION_TYPES.map(type => {
    const count = active.filter(location => location.location_type === type).length;
    const label = LOCATION_TYPE_LABELS[type].toLowerCase();
    return count > 0 ? plural(count, label, `${label}s`) : null;
  }).filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'none active yet';
}

/**
 * Summary tiles — only numbers the existing APIs give:
 * - Items in stock: distinct items with at least one balance above zero in the
 *   loaded balances (the Balances location filter applies; search does not).
 * - Locations: active locations of the branch, by type.
 * - Zero balances: balance rows equal to zero in the loaded balances.
 * - Transfers in transit: transfers with status SENT (`GET /transfers?status=SENT`).
 */
function buildTiles(balances: BalancesState, locations: StockLocation[], hideZero: boolean, transfers: TransfersState): SummaryTile[] {
  const live = balances.status === 'live' ? balances.balances : null;
  const positive = live ? live.filter(balance => isPositiveQuantity(balance.quantity)) : [];
  const itemCount = new Set(positive.map(balance => balance.item_id)).size;
  const placeCount = new Set(positive.map(balance => balance.location_id)).size;
  const zeroCount = live ? live.filter(balance => isZeroQuantity(balance.quantity)).length : 0;
  const active = locations.filter(location => location.active);

  let itemsNote = '';
  if (live) {
    if (itemCount > 0) itemsNote = `across ${plural(placeCount, 'location', 'locations')}`;
    else itemsNote = live.length === 0 ? 'no opening stock yet' : 'every balance is zero';
  }

  return [
    { id: 'items', label: 'Items in stock', value: live ? itemCount : '—', note: itemsNote },
    { id: 'locations', label: 'Locations', value: active.length, note: locationTypesNote(active) },
    {
      id: 'zero',
      label: 'Zero balances',
      value: live ? zeroCount : '—',
      tone: 'neutral',
      note: live ? (hideZero ? 'hidden by filter' : 'shown in the list') : '',
    },
    {
      id: 'transit',
      label: 'Transfers in transit',
      value: transfers.status === 'live' ? transfers.count : '—',
      tone: transfers.status === 'live' ? 'info' : 'neutral',
      note: transfers.status === 'error' ? 'Could not load transfers' : 'not counted until received',
    },
  ];
}

function StockLedgerContent({ now }: { now: Date | undefined }) {
  const isWide = useMediaQuery('(min-width: 768px)');
  const toast = useToast();
  const tabsId = useId();
  const [locationsState, setLocationsState] = useState<LocationsState>({ status: 'loading' });
  const [locationsToken, setLocationsToken] = useState(0);
  const [balancesState, setBalancesState] = useState<BalancesState>({ status: 'loading' });
  const [balancesRetry, setBalancesRetry] = useState(0);
  const [transfers, setTransfers] = useState<TransfersState>({ status: 'loading' });
  const [tab, setTab] = useState<Tab>('balances');
  const [balanceLocation, setBalanceLocation] = useState('');
  const [search, setSearch] = useState('');
  const [hideZero, setHideZero] = useState(true);
  const [movementLocation, setMovementLocation] = useState('');
  const [movementItem, setMovementItem] = useState<ItemFilter | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [adjusting, setAdjusting] = useState<StockBalance | null>(null);
  const [opening, setOpening] = useState(false);

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

  // Balances are read here (not in the Balances tab) because the summary tiles use them on both tabs.
  useEffect(() => {
    let ignore = false;
    async function load() {
      // A reload of the same filter keeps the current rows on screen until the
      // new ones arrive; a different location filter shows the loading state.
      setBalancesState(current =>
        current.status === 'live' && current.locationId === balanceLocation ? current : { status: 'loading' },
      );
      try {
        const balances = await listBalances(balanceLocation ? { location_id: balanceLocation } : {});
        if (!ignore) setBalancesState({ status: 'live', balances, locationId: balanceLocation });
      } catch (error) {
        if (!ignore) setBalancesState({ status: 'error', message: describeStockError(error) });
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [balanceLocation, reloadToken, balancesRetry]);

  // Transfers in transit (tile only). A failure shows "—" and never blocks the page.
  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const sent = await listTransfers({ status: 'SENT' });
        if (!Array.isArray(sent)) throw new Error('Unexpected transfers response');
        if (!ignore) setTransfers({ status: 'live', count: sent.length });
      } catch {
        if (!ignore) setTransfers({ status: 'error' });
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, []);

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
    setTab('movements');
  }

  function handleSaved(balance: StockBalance, movement: StockMovement) {
    setAdjusting(null);
    setReloadToken(token => token + 1);
    const unit = unitLabel(balance.base_uom);
    const before = parseQuantity(balance.quantity);
    const delta = parseQuantity(movement.quantity_delta);
    const change =
      before !== null && delta !== null
        ? `${formatQuantity(balance.quantity).text} → ${formatQuantity(toDecimalString(before + delta)).text} ${unit}`
        : `${formatSignedQuantity(movement.quantity_delta).text} ${unit}`;
    toast.success({ title: 'Adjustment saved', detail: `${balance.item_name} · ${labelFor(balance)} · ${change}` });
  }

  function handleOpeningSaved({ movement, item, locationLabel }: OpeningSaved) {
    setOpening(false);
    setReloadToken(token => token + 1);
    toast.success({
      title: 'Opening stock saved',
      detail: `${item.item_name} · ${locationLabel} · ${formatSignedQuantity(movement.quantity_delta).text} ${unitLabel(item.base_uom)}`,
    });
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next: Tab = tab === 'balances' ? 'movements' : 'balances';
    setTab(next);
    document.getElementById(`${tabsId}-${next}-tab`)?.focus();
  }

  const intro = INTRO[tab];
  const ready = locationsState.status === 'live';

  // G4: Opening stock uses the item list/search endpoint (D-1); not shown on mobile (G7).
  const openingStock =
    isWide && ready ? (
      <Button onClick={() => setOpening(true)} className="font-semibold">
        Opening stock
      </Button>
    ) : null;

  const header = <PageIntro title={intro.title} description={intro.description} actions={openingStock} />;

  if (locationsState.status === 'loading') {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <div className={isWide ? 'rounded-card border border-line bg-canvas shadow-card' : ''}>
          <LoadingState label="Loading stock ledger…" />
        </div>
      </div>
    );
  }
  if (locationsState.status === 'error') {
    return (
      <div className="flex flex-col gap-5">
        {header}
        <div className={isWide ? 'rounded-card border border-line bg-canvas shadow-card' : ''}>
          <ErrorState message={locationsState.message} onRetry={() => setLocationsToken(token => token + 1)} />
        </div>
      </div>
    );
  }

  const tabList = (
    <div
      role="tablist"
      aria-label="Stock ledger"
      onKeyDown={handleTabKeyDown}
      className={isWide ? 'flex gap-6 border-b border-line px-4' : 'flex rounded-card border border-line bg-canvas-sunken p-1'}
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
                ? `-mb-px border-b-2 pb-3 pt-3.5 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus ${
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
        state={balancesState}
        onRetry={() => setBalancesRetry(token => token + 1)}
        onAddOpening={isWide ? () => setOpening(true) : undefined}
        onHistory={openHistory}
        onAdjust={setAdjusting}
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
        now={now}
      />
    );

  return (
    <div className="flex flex-col gap-5">
      {header}
      <SummaryTiles ariaLabel="Stock summary" tiles={buildTiles(balancesState, locations, hideZero, transfers)} />
      <section
        aria-label="Stock ledger"
        className={isWide ? 'rounded-card border border-line bg-canvas shadow-card' : 'flex flex-col gap-3'}
      >
        {tabList}
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
    </div>
  );
}
