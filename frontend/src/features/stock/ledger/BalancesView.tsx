import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ErrorState, LoadingState, SearchField } from '../../../design-system/components';
import { BoxesIcon, InfoIcon, MapPinIcon } from '../../../design-system/icons';
import { listBalances } from '../api';
import { ActionMenu } from '../components/ActionMenu';
import { Checkbox } from '../components/Checkbox';
import { TextAction } from '../components/TextAction';
import { describeStockError } from '../format';
import { locationPath, orderLocationTree } from '../locations-tree';
import { formatQuantity, isZeroQuantity } from '../quantity';
import type { StockBalance, StockLocation } from '../types';
import { LocationFilter } from './LocationFilter';

interface BalancesViewProps {
  isWide: boolean;
  locations: StockLocation[];
  locationId: string;
  onLocationChange: (locationId: string) => void;
  search: string;
  onSearchChange: (search: string) => void;
  hideZero: boolean;
  onHideZeroChange: (hide: boolean) => void;
  reloadToken: number;
  /** Rendered at the right of the desktop toolbar (the Opening stock button). */
  toolbarEnd: ReactNode;
  onHistory: (balance: StockBalance) => void;
  onAdjust: (balance: StockBalance) => void;
}

interface Group {
  locationId: string;
  label: string;
  balances: StockBalance[];
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'live'; balances: StockBalance[]; locationId: string };

/** G1 / G6 / G7 — balances grouped by location. */
export function BalancesView(props: BalancesViewProps) {
  const { isWide, locations, locationId, search, hideZero, reloadToken } = props;
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let ignore = false;
    async function load() {
      // A reload of the same filter keeps the current rows on screen until the
      // new ones arrive; a different location filter shows the loading state.
      setState(current => (current.status === 'live' && current.locationId === locationId ? current : { status: 'loading' }));
      try {
        const balances = await listBalances(locationId ? { location_id: locationId } : {});
        if (!ignore) setState({ status: 'live', balances, locationId });
      } catch (error) {
        if (!ignore) setState({ status: 'error', message: describeStockError(error) });
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [locationId, reloadToken, retryToken]);

  const byId = useMemo(() => new Map(locations.map(location => [location.id, location])), [locations]);

  const view = useMemo(() => {
    if (state.status !== 'live') return null;
    const query = search.trim().toLowerCase();
    const matching = state.balances.filter(
      balance =>
        !query || balance.item_name.toLowerCase().includes(query) || balance.item_code.toLowerCase().includes(query),
    );
    const zeroHidden = hideZero ? matching.filter(balance => isZeroQuantity(balance.quantity)).length : 0;
    const shown = hideZero ? matching.filter(balance => !isZeroQuantity(balance.quantity)) : matching;

    // Groups follow the Stock Locations order (store/kitchen, then its freezers).
    const order = new Map(orderLocationTree(locations).map((row, index) => [row.location.id, index]));
    const groups = new Map<string, Group>();
    for (const balance of shown) {
      let group = groups.get(balance.location_id);
      if (!group) {
        const location = byId.get(balance.location_id);
        group = {
          locationId: balance.location_id,
          label: location ? locationPath(location, byId) : balance.location_name,
          balances: [],
        };
        groups.set(balance.location_id, group);
      }
      group.balances.push(balance);
    }
    const sorted = [...groups.values()].sort(
      (a, b) => (order.get(a.locationId) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.locationId) ?? Number.MAX_SAFE_INTEGER),
    );
    return { total: state.balances.length, shown: shown.length, zeroHidden, groups: sorted };
  }, [state, search, hideZero, locations, byId]);

  const noStockAtAll = view !== null && view.total === 0 && !locationId;

  const toolbar = (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${isWide ? 'px-4 py-3.5' : ''}`}>
      <LocationFilter
        locations={locations}
        value={locationId}
        onChange={props.onLocationChange}
        className={isWide ? 'h-9 w-[220px]' : 'h-11 w-full'}
      />
      {!noStockAtAll ? (
        <>
          <SearchField
            label="Search item name or code"
            placeholder="Search item name or code"
            value={search}
            onChange={event => props.onSearchChange(event.target.value)}
            onClear={() => props.onSearchChange('')}
            className={isWide ? 'w-[280px] [&_input]:h-9' : 'min-w-0 flex-1'}
          />
          <Checkbox label="Hide zero balances" checked={hideZero} onChange={props.onHideZeroChange} />
        </>
      ) : null}
      {isWide ? <div className="flex-1" /> : null}
      {isWide ? props.toolbarEnd : null}
    </div>
  );

  let body: ReactNode;
  if (state.status === 'loading' || view === null) {
    body = state.status === 'error' ? (
      <div className={isWide ? 'px-4 pb-4' : ''}>
        <ErrorState message={state.message} onRetry={() => setRetryToken(token => token + 1)} />
      </div>
    ) : (
      <LoadingState label="Loading balances…" />
    );
  } else if (noStockAtAll) {
    body = (
      <div className="flex flex-col items-center gap-2 px-6 pb-12 pt-8 text-center">
        <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-canvas-sunken text-ink-secondary">
          <BoxesIcon className="h-5 w-5" />
        </span>
        <p className="text-base font-semibold text-ink">No stock recorded yet</p>
        <p className="max-w-sm text-[13px] text-ink-secondary">
          Stock appears here after opening stock, a goods receipt or a transfer is recorded. Locations must exist first
          (Stock Locations).
        </p>
      </div>
    );
  } else if (view.shown === 0) {
    let message = 'No stock at this location yet.';
    if (search.trim()) message = 'No items match your search.';
    else if (view.zeroHidden > 0) message = 'All balances here are zero. Untick “Hide zero balances” to see them.';
    body = <p className="px-4 py-10 text-center text-[13px] text-ink-muted">{message}</p>;
  } else {
    body = isWide ? <BalancesTable groups={view.groups} {...props} /> : <BalanceCards groups={view.groups} {...props} />;
  }

  const footer =
    view && !noStockAtAll ? (
      <p className={`flex gap-1.5 text-xs text-ink-muted ${isWide ? 'px-4 py-3' : 'px-1'}`}>
        <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
        <span>
          Quantity only — no value or cost (ADR-0008). Stock in transit (sent, not yet received) is not included.{' '}
          {view.shown} {view.shown === 1 ? 'balance' : 'balances'} shown
          {hideZero ? ` · ${view.zeroHidden} zero ${view.zeroHidden === 1 ? 'balance' : 'balances'} hidden` : ''}.
        </span>
      </p>
    ) : null;

  return (
    <div className={isWide ? '' : 'flex flex-col gap-3'}>
      {toolbar}
      {body}
      {footer}
    </div>
  );
}

const HEAD = 'px-3 text-[11px] font-semibold uppercase tracking-[0.5px] text-ink-muted';

function Quantity({ balance, large = false }: { balance: StockBalance; large?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className={`font-semibold text-ink ${large ? 'text-[15px]' : 'text-[13px]'}`}>{formatQuantity(balance.quantity)}</span>
      <span className="text-[11px] font-medium text-ink-muted">{balance.base_uom}</span>
    </span>
  );
}

function GroupLabel({ group }: { group: Group }) {
  return (
    <>
      <MapPinIcon className="h-3.5 w-3.5 shrink-0 text-ink-secondary" />
      <span className="font-semibold text-ink-secondary">{group.label}</span>
      <span className="text-ink-muted">
        · {group.balances.length} {group.balances.length === 1 ? 'item' : 'items'}
      </span>
    </>
  );
}

function BalancesTable({ groups, onHistory, onAdjust }: { groups: Group[] } & BalancesViewProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="h-9 border-y border-line bg-canvas-sunken">
            <th scope="col" className={`${HEAD} pl-4`}>Item</th>
            <th scope="col" className={`${HEAD} w-[164px]`}>Code</th>
            <th scope="col" className={`${HEAD} w-[224px] text-right`}>Quantity (base unit)</th>
            <th scope="col" className={`${HEAD} w-[176px] pr-4 text-right`}>Actions</th>
          </tr>
        </thead>
        {groups.map(group => (
          <tbody key={group.locationId}>
            <tr className="h-8 border-b border-line bg-canvas-sunken">
              <th scope="colgroup" colSpan={4} className="px-4 text-left text-xs font-normal">
                <span className="flex items-center gap-2">
                  <GroupLabel group={group} />
                </span>
              </th>
            </tr>
            {group.balances.map(balance => (
              <tr key={`${balance.location_id}:${balance.item_id}`} className="h-11 border-b border-line">
                <td className="px-3 pl-4 text-[13px] font-medium text-ink">{balance.item_name}</td>
                <td className="px-3 text-xs text-ink-secondary">{balance.item_code}</td>
                <td className="px-3 text-right">
                  <Quantity balance={balance} />
                </td>
                <td className="px-3 pr-4">
                  <span className="flex justify-end gap-4">
                    <TextAction onClick={() => onHistory(balance)} aria-label={`History of ${balance.item_name} at ${group.label}`}>
                      History
                    </TextAction>
                    <TextAction tone="strong" onClick={() => onAdjust(balance)} aria-label={`Adjust ${balance.item_name} at ${group.label}`}>
                      Adjust
                    </TextAction>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function BalanceCards({ groups, onHistory, onAdjust }: { groups: Group[] } & BalancesViewProps) {
  return (
    <div className="flex flex-col gap-3">
      {groups.map(group => (
        <section key={group.locationId} aria-label={group.label} className="flex flex-col gap-2">
          <h3 className="flex items-center gap-1.5 px-1 text-xs">
            <GroupLabel group={group} />
          </h3>
          <ul className="flex flex-col gap-2">
            {group.balances.map(balance => (
              <li
                key={`${balance.location_id}:${balance.item_id}`}
                className="flex items-center gap-3 rounded-card border border-line bg-canvas py-3 pl-4 pr-2"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-semibold text-ink">{balance.item_name}</span>
                  <span className="text-xs text-ink-secondary">{balance.item_code}</span>
                </div>
                <Quantity balance={balance} large />
                <ActionMenu
                  label={`Actions for ${balance.item_name} at ${group.label}`}
                  items={[
                    { label: 'History', onSelect: () => onHistory(balance) },
                    { label: 'Adjust', onSelect: () => onAdjust(balance) },
                  ]}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
