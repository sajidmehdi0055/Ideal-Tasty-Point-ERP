import { useMemo, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  SearchField,
  getButtonClassName,
} from '../../../design-system/components';
import {
  ColumnsMenu,
  DataCell,
  DataGroupRow,
  DataRow,
  DataTable,
  DataTableToolbar,
  DensityToggle,
  ResultCount,
  useSlashFocus,
  useTableSettings,
  type ColumnDef,
  type Density,
  type TableSettings,
} from '../../../design-system/data-table';
import { HistoryIcon, InfoIcon, MapPinIcon, PackageIcon } from '../../../design-system/icons';
import { ActionMenu } from '../components/ActionMenu';
import { Checkbox } from '../components/Checkbox';
import { LocationTypeBadge } from '../components/Tags';
import { locationPath, orderLocationTree } from '../locations-tree';
import { isZeroQuantity } from '../quantity';
import type { StockBalance, StockLocation } from '../types';
import { ItemNameCode, QuantityText } from './cells';
import { LocationFilter } from './LocationFilter';

export type BalancesState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'live'; balances: StockBalance[]; locationId: string };

interface BalancesViewProps {
  isWide: boolean;
  locations: StockLocation[];
  locationId: string;
  onLocationChange: (locationId: string) => void;
  search: string;
  onSearchChange: (search: string) => void;
  hideZero: boolean;
  onHideZeroChange: (hide: boolean) => void;
  /** Balances read by the page (the same read also feeds the summary tiles). */
  state: BalancesState;
  onRetry: () => void;
  /** Opens the Opening stock dialog from the empty state; omitted where Opening stock is not offered (mobile, G7). */
  onAddOpening?: (() => void) | undefined;
  onHistory: (balance: StockBalance) => void;
  onAdjust: (balance: StockBalance) => void;
}

interface Group {
  locationId: string;
  label: string;
  location: StockLocation | undefined;
  balances: StockBalance[];
}

/** Stable column set (design-system/data-table). All three are required: nothing on this table can be hidden. */
const COLUMNS: ColumnDef[] = [
  { id: 'item', label: 'Item', required: true, minWidth: 200 },
  { id: 'quantity', label: 'Quantity', required: true, minWidth: 112, defaultWidth: 160, align: 'right' },
  { id: 'actions', label: 'Actions', required: true, minWidth: 132, defaultWidth: 148, align: 'right', resizable: false },
];

export const BALANCES_SCREEN_ID = 'stock-balances';

/** Figma R1 / R4 (UI-REFRESH-001) over G1 / G6 / G7 — balances grouped by location. */
export function BalancesView(props: BalancesViewProps) {
  const { isWide, locations, locationId, search, hideZero, state } = props;
  const settings = useTableSettings(BALANCES_SCREEN_ID, COLUMNS);
  const searchRef = useRef<HTMLInputElement>(null);
  useSlashFocus(searchRef, { onClear: () => props.onSearchChange('') });

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
          location,
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

  const locationFilter = (
    <LocationFilter
      locations={locations}
      value={locationId}
      onChange={props.onLocationChange}
      className={isWide ? 'h-9 w-[220px]' : 'h-11 w-full'}
    />
  );
  const filters = !noStockAtAll ? (
    <>
      <SearchField
        ref={searchRef}
        label="Search item name or code"
        placeholder="Search item name or code"
        value={search}
        onChange={event => props.onSearchChange(event.target.value)}
        onClear={() => props.onSearchChange('')}
        {...(isWide ? { shortcutHint: '/' } : {})}
        className={isWide ? 'w-[280px] [&_input]:h-9' : 'min-w-0 flex-1'}
      />
      <Checkbox label="Hide zero balances" checked={hideZero} onChange={props.onHideZeroChange} />
    </>
  ) : null;

  const resultCount =
    view && !noStockAtAll ? (
      <ResultCount>
        {view.shown} {view.shown === 1 ? 'balance' : 'balances'}
        {hideZero && view.zeroHidden > 0 ? ` · ${view.zeroHidden} zero hidden` : ''}
      </ResultCount>
    ) : null;

  const toolbar = isWide ? (
    <DataTableToolbar
      start={
        <>
          {locationFilter}
          {filters}
        </>
      }
      end={
        <>
          {resultCount}
          <ColumnsMenu settings={settings} />
          <DensityToggle settings={settings} />
        </>
      }
    />
  ) : (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {locationFilter}
      {filters}
    </div>
  );

  let body: ReactNode;
  if (state.status === 'error') {
    body = <ErrorState message={state.message} onRetry={props.onRetry} />;
  } else if (state.status === 'loading' || view === null) {
    body = <LoadingState label="Loading balances…" />;
  } else if (noStockAtAll) {
    body = (
      <EmptyState
        icon={<PackageIcon />}
        title="No stock in the ledger yet"
        message="Start by entering opening stock for each store, kitchen and freezer. After that, receipts, transfers and adjustments will appear here automatically."
        action={
          <>
            {props.onAddOpening ? <Button onClick={props.onAddOpening}>Add opening stock</Button> : null}
            <Link to="/stock/locations" className={getButtonClassName({ variant: 'secondary' })}>
              Manage locations
            </Link>
          </>
        }
      />
    );
  } else if (view.shown === 0) {
    let message = 'No stock at this location yet.';
    if (search.trim()) message = 'No items match your search.';
    else if (view.zeroHidden > 0) message = 'All balances here are zero. Untick “Hide zero balances” to see them.';
    body = <p className="px-4 py-10 text-center text-[13px] text-ink-muted">{message}</p>;
  } else {
    body = isWide ? (
      <BalancesTable groups={view.groups} settings={settings} onHistory={props.onHistory} onAdjust={props.onAdjust} />
    ) : (
      <BalanceCards groups={view.groups} onHistory={props.onHistory} onAdjust={props.onAdjust} />
    );
  }

  const footer =
    view && !noStockAtAll ? (
      <p className={`flex gap-1.5 text-xs text-ink-muted ${isWide ? 'border-t border-line px-4 py-3' : 'px-1'}`}>
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

function GroupHeading({ group }: { group: Group }) {
  const count = group.balances.length;
  return (
    <span className={`flex min-w-0 items-center gap-2 ${group.location?.parent_id ? 'pl-6' : ''}`}>
      <MapPinIcon className="h-3.5 w-3.5 shrink-0 text-ink-secondary" />
      <span className="truncate font-semibold text-ink">{group.label}</span>
      {group.location ? <LocationTypeBadge type={group.location.location_type} /> : null}
      <span className="shrink-0 font-normal text-ink-muted">
        {count} {count === 1 ? 'item' : 'items'}
      </span>
    </span>
  );
}

interface RowActions {
  onHistory: (balance: StockBalance) => void;
  onAdjust: (balance: StockBalance) => void;
}

function BalancesTable({ groups, settings, onHistory, onAdjust }: { groups: Group[]; settings: TableSettings } & RowActions) {
  return (
    <DataTable settings={settings} ariaLabel="Stock balances" maxHeight="calc(100vh - 360px)">
      {groups.map(group => (
        <GroupRows key={group.locationId} group={group} density={settings.density} onHistory={onHistory} onAdjust={onAdjust} />
      ))}
    </DataTable>
  );
}

function GroupRows({ group, density, onHistory, onAdjust }: { group: Group; density: Density } & RowActions) {
  return (
    <>
      <DataGroupRow data-testid="balance-group">
        <GroupHeading group={group} />
      </DataGroupRow>
      {group.balances.map(balance => (
        <DataRow key={`${balance.location_id}:${balance.item_id}`}>
          <DataCell>
            <ItemNameCode name={balance.item_name} code={balance.item_code} density={density} />
          </DataCell>
          <DataCell numeric>
            <QuantityText value={balance.quantity} unit={balance.base_uom} />
          </DataCell>
          {/* `wrap` so the History tooltip is not clipped by the cell's overflow. */}
          <DataCell align="right" wrap>
            <span className="flex items-center justify-end gap-2">
              <IconButton
                label={`History of ${balance.item_name} at ${group.label}`}
                tooltip="History"
                tooltipSide="left"
                icon={<HistoryIcon />}
                onClick={() => onHistory(balance)}
              />
              <Button
                size="xs"
                variant="secondary"
                aria-label={`Adjust ${balance.item_name} at ${group.label}`}
                onClick={() => onAdjust(balance)}
              >
                Adjust
              </Button>
            </span>
          </DataCell>
        </DataRow>
      ))}
    </>
  );
}

function BalanceCards({ groups, onHistory, onAdjust }: { groups: Group[] } & RowActions) {
  return (
    <div className="flex flex-col gap-3">
      {groups.map(group => (
        <section key={group.locationId} aria-label={group.label} className="flex flex-col gap-2">
          <h3 className="px-1 text-xs">
            <GroupHeading group={group} />
          </h3>
          <ul className="flex flex-col gap-2">
            {group.balances.map(balance => (
              <li
                key={`${balance.location_id}:${balance.item_id}`}
                className="flex items-center gap-3 rounded-card border border-line bg-canvas py-3 pl-4 pr-2 shadow-card"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-semibold text-ink">{balance.item_name}</span>
                  <span className="text-xs text-ink-muted">{balance.item_code}</span>
                </div>
                <QuantityText value={balance.quantity} unit={balance.base_uom} large />
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
