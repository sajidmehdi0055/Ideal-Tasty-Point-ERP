import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../../../design-system/components';
import {
  ColumnsMenu,
  DataCell,
  DataGroupRow,
  DataRow,
  DataTable,
  DataTableToolbar,
  DensityToggle,
  ResultCount,
  useTableSettings,
  type ColumnDef,
} from '../../../design-system/data-table';
import { InfoIcon, XIcon } from '../../../design-system/icons';
import { formatDateTime, formatDayGroupLabel, formatQuantity, formatTime, groupByKarachiDay } from '../../../lib/format';
import { listBalances, listMovements } from '../api';
import { MovementTypeTag } from '../components/Tags';
import { describeStockError } from '../format';
import { locationPath } from '../locations-tree';
import { parseQuantity, toDecimalString } from '../quantity';
import type { StockBalance, StockLocation, StockMovement } from '../types';
import { ItemNameCode, SignedQuantity } from './cells';
import { LocationFilter } from './LocationFilter';

export interface ItemFilter {
  id: string;
  label: string;
}

interface MovementsViewProps {
  isWide: boolean;
  locations: StockLocation[];
  locationId: string;
  onLocationChange: (locationId: string) => void;
  item: ItemFilter | null;
  onClearItem: () => void;
  reloadToken: number;
  /** "Now" for the Today / Yesterday day labels (tests pass a fixed time). */
  now?: Date | undefined;
}

interface ItemInfo {
  name: string;
  code: string;
  unit: string;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'live'; key: string; movements: StockMovement[]; balances: StockBalance[] };

export const MOVEMENTS_SCREEN_ID = 'stock-movements';

// Two stable column sets for one screen: with the History item chip the Item
// column is left out (G2), as before. Item and Quantity are required.
const TIME: ColumnDef = { id: 'time', label: 'Time', minWidth: 72, defaultWidth: 90 };
const ITEM: ColumnDef = { id: 'item', label: 'Item', required: true, minWidth: 180 };
const LOCATION: ColumnDef = { id: 'location', label: 'Location', minWidth: 140, defaultWidth: 200 };
const TYPE: ColumnDef = { id: 'type', label: 'Type', minWidth: 120, defaultWidth: 170 };
const QUANTITY: ColumnDef = { id: 'quantity', label: 'Quantity', required: true, minWidth: 110, defaultWidth: 150, align: 'right' };
const COLUMNS_WITH_ITEM: ColumnDef[] = [
  TIME,
  ITEM,
  LOCATION,
  TYPE,
  QUANTITY,
  { id: 'reason', label: 'Reason', minWidth: 160, defaultWidth: 300 },
];
const COLUMNS_FOR_ONE_ITEM: ColumnDef[] = [
  TIME,
  LOCATION,
  TYPE,
  QUANTITY,
  // No Item column: Reason takes the spare width.
  { id: 'reason', label: 'Reason', minWidth: 160 },
];

/** "Today · Wed 07 Oct 2026", "Yesterday · Tue 06 Oct 2026", "Mon 05 Oct 2026" (Figma R6). */
function dayLabel(key: string, label: string): string {
  if (label !== 'Today' && label !== 'Yesterday') return label;
  // A "now" far from the day always yields the weekday + date form.
  return `${label} · ${formatDayGroupLabel(key, new Date(0))}`;
}

/**
 * Figma R6 (UI-REFRESH-001) over G2 — movements, newest first (server order),
 * grouped by Asia/Karachi day. The API returns ids only, so item names and
 * base units come from the balances read with the same filter (every item
 * with a movement has a balance row there), and location names from the
 * locations list. No user / document number / running balance exists in the
 * API (G-2).
 */
export function MovementsView({ isWide, locations, locationId, onLocationChange, item, onClearItem, reloadToken, now }: MovementsViewProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [retryToken, setRetryToken] = useState(0);
  const itemId = item?.id ?? '';
  const key = `${locationId}|${itemId}`;
  const settings = useTableSettings(MOVEMENTS_SCREEN_ID, item ? COLUMNS_FOR_ONE_ITEM : COLUMNS_WITH_ITEM);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setState(current => (current.status === 'live' && current.key === key ? current : { status: 'loading' }));
      const query = { ...(itemId ? { item_id: itemId } : {}), ...(locationId ? { location_id: locationId } : {}) };
      try {
        const [movements, balances] = await Promise.all([listMovements(query), listBalances(query)]);
        if (!ignore) setState({ status: 'live', key, movements, balances });
      } catch (error) {
        if (!ignore) setState({ status: 'error', message: describeStockError(error) });
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [key, itemId, locationId, reloadToken, retryToken]);

  const byId = useMemo(() => new Map(locations.map(location => [location.id, location])), [locations]);

  const items = useMemo(() => {
    const map = new Map<string, ItemInfo>();
    if (state.status === 'live') {
      for (const balance of state.balances) {
        map.set(balance.item_id, { name: balance.item_name, code: balance.item_code, unit: balance.base_uom });
      }
    }
    return map;
  }, [state]);

  const balanceNow = useMemo(() => {
    if (state.status !== 'live' || !item) return null;
    const rows = state.balances.filter(balance => balance.item_id === item.id);
    if (rows.length === 0) return null;
    let total = 0n;
    let places = 0;
    for (const row of rows) {
      const value = parseQuantity(row.quantity);
      if (value === null) return null;
      total += value;
      if (value !== 0n) places += 1;
    }
    return { text: `${formatQuantity(toDecimalString(total)).text} ${rows[0]?.base_uom ?? ''}`, places };
  }, [state, item]);

  const locationName = (id: string) => {
    const location = byId.get(id);
    return location ? locationPath(location, byId) : 'Unknown location';
  };

  const live = state.status === 'live' && state.key === key ? state : null;

  const filters = (
    <>
      <LocationFilter
        locations={locations}
        value={locationId}
        onChange={onLocationChange}
        className={isWide ? 'h-9 w-[220px]' : 'h-11 w-full'}
      />
      {item ? (
        <span className="inline-flex h-9 max-w-full items-center gap-2 rounded-control border border-line-strong bg-canvas-sunken pl-2.5 pr-1.5 text-[13px]">
          <span className="text-ink-muted">Item:</span>
          <span className="truncate font-semibold text-ink">{item.label}</span>
          <button
            type="button"
            onClick={onClearItem}
            aria-label="Clear item filter"
            className="rounded-sm p-0.5 text-ink-secondary hover:bg-canvas-hover hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </span>
      ) : null}
    </>
  );
  const balanceNowText = balanceNow ? (
    <p className="text-xs text-ink-secondary">
      Balance now: {balanceNow.text} ({balanceNow.places} {balanceNow.places === 1 ? 'location' : 'locations'})
    </p>
  ) : null;

  const toolbar = isWide ? (
    <DataTableToolbar
      // Figma R1 / R6: the ledger toolbar is 64px (14px padding); other screens use 60px.
      className="py-3.5!"
      start={filters}
      end={
        <>
          {balanceNowText}
          {live ? (
            <ResultCount>
              {live.movements.length} {live.movements.length === 1 ? 'movement' : 'movements'}
            </ResultCount>
          ) : null}
          <ColumnsMenu settings={settings} />
          <DensityToggle settings={settings} />
        </>
      }
    />
  ) : (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {filters}
      {balanceNowText}
    </div>
  );

  let body: ReactNode;
  if (state.status === 'error') {
    body = <ErrorState message={state.message} onRetry={() => setRetryToken(token => token + 1)} />;
  } else if (!live) {
    body = <LoadingState label="Loading movements…" />;
  } else if (live.movements.length === 0) {
    body = <EmptyState title="No movements yet" message="No stock movements for this filter yet." />;
  } else if (isWide) {
    const groups = groupByKarachiDay(live.movements, movement => movement.created_at, now);
    body = (
      <DataTable settings={settings} ariaLabel="Stock movements" maxHeight="calc(100vh - 360px)">
        {groups.map(group => (
          <MovementGroup
            key={group.key}
            label={dayLabel(group.key, group.label)}
            movements={group.rows}
            items={items}
            locationName={locationName}
            isVisible={settings.isVisible}
            density={settings.density}
          />
        ))}
      </DataTable>
    );
  } else {
    body = <MovementCards movements={live.movements} items={items} showItem={!item} locationName={locationName} />;
  }

  return (
    <div className={isWide ? '' : 'flex flex-col gap-3'}>
      {toolbar}
      {body}
      {live ? (
        <p className={`flex gap-1.5 text-xs text-ink-muted ${isWide ? 'border-t border-line px-4 py-3' : 'px-1'}`}>
          <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Showing {live.movements.length} {live.movements.length === 1 ? 'movement' : 'movements'}, newest first ·
            quantities in each item&apos;s base unit · times in Pakistan time (PKT). Who made the entry and the GRN / TRF
            number are not in the API yet (G-2).
          </span>
        </p>
      ) : null}
    </div>
  );
}

function itemLabel(info: ItemInfo | undefined) {
  return info ? `${info.name} (${info.code})` : 'Unknown item';
}

function Reason({ reason }: { reason: string | null }) {
  return reason ? <span title={reason} className="text-ink-muted">{reason}</span> : <span className="text-ink-muted">—</span>;
}

interface MovementGroupProps {
  label: string;
  movements: StockMovement[];
  items: Map<string, ItemInfo>;
  locationName: (id: string) => string;
  isVisible: (id: string) => boolean;
  density: 'comfortable' | 'compact';
}

function MovementGroup({ label, movements, items, locationName, isVisible, density }: MovementGroupProps) {
  return (
    <>
      <DataGroupRow data-testid="movement-day">
        <span className="text-[12.5px] font-bold text-ink-secondary">{label}</span>
      </DataGroupRow>
      {movements.map(movement => {
        const info = items.get(movement.item_id);
        return (
          <DataRow key={movement.id}>
            {isVisible('time') ? (
              <DataCell className="font-medium text-ink-muted tabular-nums" title={formatDateTime(movement.created_at)}>
                {formatTime(movement.created_at)}
              </DataCell>
            ) : null}
            {isVisible('item') ? (
              <DataCell>
                {info ? <ItemNameCode name={info.name} code={info.code} density={density} large /> : 'Unknown item'}
              </DataCell>
            ) : null}
            {isVisible('location') ? (
              <DataCell className="text-[13.5px]! font-medium text-ink-secondary">{locationName(movement.location_id)}</DataCell>
            ) : null}
            {isVisible('type') ? (
              <DataCell>
                <MovementTypeTag type={movement.movement_type} />
              </DataCell>
            ) : null}
            {isVisible('quantity') ? (
              <DataCell numeric>
                <SignedQuantity value={movement.quantity_delta} unit={info?.unit} />
              </DataCell>
            ) : null}
            {isVisible('reason') ? (
              <DataCell>
                <Reason reason={movement.reason} />
              </DataCell>
            ) : null}
          </DataRow>
        );
      })}
    </>
  );
}

interface CardsProps {
  movements: StockMovement[];
  items: Map<string, ItemInfo>;
  showItem: boolean;
  locationName: (id: string) => string;
}

/** Mobile (< 768 px): cards as before (G7), restyled with tokens. */
function MovementCards({ movements, items, showItem, locationName }: CardsProps) {
  return (
    <ul className="flex flex-col gap-2">
      {movements.map(movement => {
        const info = items.get(movement.item_id);
        return (
          <li key={movement.id} className="flex flex-col gap-1.5 rounded-card border border-line bg-canvas px-4 py-3 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-ink-secondary">{formatDateTime(movement.created_at)}</span>
              <MovementTypeTag type={movement.movement_type} />
            </div>
            {showItem ? <span className="text-[15px] font-semibold text-ink">{itemLabel(info)}</span> : null}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-ink">{locationName(movement.location_id)}</span>
              <SignedQuantity value={movement.quantity_delta} unit={info?.unit} />
            </div>
            {movement.reason ? <p className="break-words text-[13px] text-ink-secondary">{movement.reason}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

