import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ErrorState, LoadingState } from '../../../design-system/components';
import { InfoIcon, XIcon } from '../../../design-system/icons';
import { listBalances, listMovements } from '../api';
import { MovementTypeTag } from '../components/Tags';
import { describeStockError, formatDateTime } from '../format';
import { locationPath } from '../locations-tree';
import { formatQuantity, formatQuantityValue, parseQuantity } from '../quantity';
import type { StockBalance, StockLocation, StockMovement } from '../types';
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

/**
 * G2 — movements, newest first (server order). The API returns ids only, so
 * item names and base units come from the balances read with the same
 * filter (every item with a movement has a balance row there), and location
 * names from the locations list. No user / document number / running balance
 * exists in the API (G-2).
 */
export function MovementsView({ isWide, locations, locationId, onLocationChange, item, onClearItem, reloadToken }: MovementsViewProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [retryToken, setRetryToken] = useState(0);
  const itemId = item?.id ?? '';
  const key = `${locationId}|${itemId}`;

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
    return { text: `${formatQuantityValue(total)} ${rows[0]?.base_uom ?? ''}`, places };
  }, [state, item]);

  const locationName = (id: string) => {
    const location = byId.get(id);
    return location ? locationPath(location, byId) : 'Unknown location';
  };

  const toolbar = (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${isWide ? 'px-4 py-3.5' : ''}`}>
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
      {isWide ? <div className="flex-1" /> : null}
      {balanceNow ? (
        <p className="text-xs text-ink-secondary">
          Balance now: {balanceNow.text} ({balanceNow.places} {balanceNow.places === 1 ? 'location' : 'locations'})
        </p>
      ) : null}
    </div>
  );

  let body: ReactNode;
  if (state.status === 'error') {
    body = (
      <div className={isWide ? 'px-4 pb-4' : ''}>
        <ErrorState message={state.message} onRetry={() => setRetryToken(token => token + 1)} />
      </div>
    );
  } else if (state.status === 'loading' || state.key !== key) {
    body = <LoadingState label="Loading movements…" />;
  } else if (state.movements.length === 0) {
    body = <p className="px-4 py-10 text-center text-[13px] text-ink-muted">No stock movements for this filter yet.</p>;
  } else if (isWide) {
    body = <MovementsTable movements={state.movements} items={items} showItem={!item} locationName={locationName} />;
  } else {
    body = <MovementCards movements={state.movements} items={items} showItem={!item} locationName={locationName} />;
  }

  return (
    <div className={isWide ? '' : 'flex flex-col gap-3'}>
      {toolbar}
      {body}
      {state.status === 'live' ? (
        <p className={`flex gap-1.5 text-xs text-ink-muted ${isWide ? 'px-4 py-3' : 'px-1'}`}>
          <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Newest first. Entries are permanent — a mistake is corrected with a new Adjustment. Who made the entry and
            the GRN / TRF number are not in the API yet (G-2).
          </span>
        </p>
      ) : null}
    </div>
  );
}

interface ListProps {
  movements: StockMovement[];
  items: Map<string, ItemInfo>;
  showItem: boolean;
  locationName: (id: string) => string;
}

const HEAD = 'px-3 text-[11px] font-semibold uppercase tracking-[0.5px] text-ink-muted';

function Change({ movement, unit }: { movement: StockMovement; unit: string | undefined }) {
  const value = parseQuantity(movement.quantity_delta);
  const negative = value !== null && value < 0n;
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className={`text-[13px] font-semibold ${negative ? 'text-danger-700' : 'text-success-700'}`}>
        {formatQuantity(movement.quantity_delta, { signed: true })}
      </span>
      {unit ? <span className="text-[11px] font-medium text-ink-muted">{unit}</span> : null}
    </span>
  );
}

function itemLabel(info: ItemInfo | undefined) {
  return info ? `${info.name} (${info.code})` : 'Unknown item';
}

function MovementsTable({ movements, items, showItem, locationName }: ListProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead>
          <tr className="h-9 border-y border-line bg-canvas-sunken">
            <th scope="col" className={`${HEAD} w-[172px] pl-4`}>Date &amp; time</th>
            {showItem ? <th scope="col" className={HEAD}>Item</th> : null}
            <th scope="col" className={`${HEAD} w-[156px]`}>Type</th>
            <th scope="col" className={`${HEAD} ${showItem ? 'w-[200px]' : 'w-[260px]'}`}>Location</th>
            <th scope="col" className={`${HEAD} w-[124px] text-right`}>Change</th>
            <th scope="col" className={`${HEAD} pr-4 ${showItem ? 'w-[240px]' : ''}`}>Reason</th>
          </tr>
        </thead>
        <tbody>
          {movements.map(movement => {
            const info = items.get(movement.item_id);
            return (
              <tr key={movement.id} className="h-11 border-b border-line">
                <td className="px-3 pl-4 text-[13px] text-ink-secondary">{formatDateTime(movement.created_at)}</td>
                {showItem ? <td className="px-3 text-[13px] font-medium text-ink">{itemLabel(info)}</td> : null}
                <td className="px-3">
                  <MovementTypeTag type={movement.movement_type} />
                </td>
                <td className="px-3 text-[13px] text-ink">{locationName(movement.location_id)}</td>
                <td className="px-3 text-right">
                  <Change movement={movement} unit={info?.unit} />
                </td>
                <td className="px-3 pr-4 text-[13px] text-ink">
                  {movement.reason ? <span className="block break-words py-2">{movement.reason}</span> : <span className="text-ink-muted">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MovementCards({ movements, items, showItem, locationName }: ListProps) {
  return (
    <ul className="flex flex-col gap-2">
      {movements.map(movement => {
        const info = items.get(movement.item_id);
        return (
          <li key={movement.id} className="flex flex-col gap-1.5 rounded-card border border-line bg-canvas px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-ink-secondary">{formatDateTime(movement.created_at)}</span>
              <MovementTypeTag type={movement.movement_type} />
            </div>
            {showItem ? <span className="text-[15px] font-semibold text-ink">{itemLabel(info)}</span> : null}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-ink">{locationName(movement.location_id)}</span>
              <Change movement={movement} unit={info?.unit} />
            </div>
            {movement.reason ? <p className="break-words text-[13px] text-ink-secondary">{movement.reason}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
