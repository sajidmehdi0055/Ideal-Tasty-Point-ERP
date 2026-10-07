import type { ReactNode } from 'react';
import { ActiveStatusBadge, Badge, Button } from '../../../design-system/components';
import { DataCell, DataRow, DataTable, type ColumnDef, type TableSettings } from '../../../design-system/data-table';
import { CornerDownRightIcon } from '../../../design-system/icons';
import { ActionMenu, type ActionMenuItem } from '../components/ActionMenu';
import type { LocationRow } from '../locations-tree';
import { LOCATION_TYPE_LABELS, type LocationType, type StockLocation } from '../types';

/** Columns of the Stock Locations table (screenId `stock-locations`). Location + Actions can never be hidden. */
export const LOCATION_COLUMNS: readonly ColumnDef[] = [
  { id: 'location', label: 'Location', required: true, minWidth: 200 },
  { id: 'type', label: 'Type', minWidth: 96, defaultWidth: 140 },
  { id: 'parent', label: 'Parent', minWidth: 120, defaultWidth: 200 },
  { id: 'items', label: 'Items in stock', minWidth: 120, defaultWidth: 150, align: 'right' },
  { id: 'status', label: 'Status', minWidth: 104, defaultWidth: 140 },
  { id: 'actions', label: 'Actions', required: true, minWidth: 200, defaultWidth: 230, align: 'right', resizable: false },
];

/** Location type pill: Store / Kitchen neutral, Freezer info (as in the Direction A Locations frame). */
export function LocationTypeBadge({ type }: { type: LocationType }) {
  return <Badge tone={type === 'FREEZER' ? 'info' : 'neutral'}>{LOCATION_TYPE_LABELS[type]}</Badge>;
}

interface LocationsListProps {
  rows: LocationRow[];
  itemsInStock: Map<string, number>;
  isOwner: boolean;
  busyId: string | undefined;
  onRename: (location: StockLocation) => void;
  onDeactivate: (location: StockLocation) => void;
  onActivate: (location: StockLocation) => void;
}

interface LocationsTableProps extends LocationsListProps {
  settings: TableSettings;
}

/** L1 / L7 desktop table: freezers indented under their store or kitchen. */
export function LocationsTable({
  settings,
  rows,
  itemsInStock,
  isOwner,
  busyId,
  onRename,
  onDeactivate,
  onActivate,
}: LocationsTableProps) {
  return (
    <DataTable settings={settings} ariaLabel="Stock locations" maxHeight="max(320px, calc(100dvh - 400px))">
      {rows.map(({ location, depth, parent }) => {
        const count = itemsInStock.get(location.id) ?? 0;
        const cells: Record<string, ReactNode> = {
          location: (
            <DataCell key="location" title={location.name}>
              <span className={`flex min-w-0 items-center gap-1.5 ${depth === 1 ? 'pl-5' : ''}`}>
                {depth === 1 ? <CornerDownRightIcon className="h-3.5 w-3.5 shrink-0 text-ink-muted" /> : null}
                <span className="truncate text-sm font-semibold text-ink">{location.name}</span>
              </span>
            </DataCell>
          ),
          type: (
            <DataCell key="type">
              <LocationTypeBadge type={location.location_type} />
            </DataCell>
          ),
          parent: (
            <DataCell key="parent" className="text-[13.5px]! font-medium text-ink-muted">
              {parent?.name ?? '—'}
            </DataCell>
          ),
          items: (
            <DataCell key="items" numeric className="text-sm! font-bold">
              {count}
            </DataCell>
          ),
          status: (
            <DataCell key="status">
              <ActiveStatusBadge active={location.active} />
            </DataCell>
          ),
          actions: (
            <DataCell key="actions" align="right">
              <span className="flex items-center justify-end gap-1.5">
                <Button variant="secondary" size="xs" onClick={() => onRename(location)} aria-label={`Rename ${location.name}`}>
                  Rename
                </Button>
                {isOwner ? (
                  location.active ? (
                    <Button
                      variant="danger-text"
                      size="xs"
                      onClick={() => onDeactivate(location)}
                      aria-label={`Deactivate ${location.name}`}
                    >
                      Deactivate
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => onActivate(location)}
                      loading={busyId === location.id}
                      aria-label={`Activate ${location.name}`}
                    >
                      Activate
                    </Button>
                  )
                ) : null}
              </span>
            </DataCell>
          ),
        };
        return (
          <DataRow
            key={location.id}
            className={location.active ? '' : 'opacity-60'}
            data-testid={`location-row-${location.id}`}
          >
            {settings.visibleColumns.map(column => cells[column.id])}
          </DataRow>
        );
      })}
    </DataTable>
  );
}

/** L8 mobile cards: actions in a ⋮ menu. */
export function LocationCards({ rows, itemsInStock, isOwner, busyId, onRename, onDeactivate, onActivate }: LocationsListProps) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map(({ location, depth }) => {
        const count = itemsInStock.get(location.id) ?? 0;
        const items: ActionMenuItem[] = [{ label: 'Rename', onSelect: () => onRename(location) }];
        // While an activation is in flight the item is left out, so a double tap cannot send it twice.
        if (isOwner && busyId !== location.id) {
          items.push(
            location.active
              ? { label: 'Deactivate', tone: 'danger', onSelect: () => onDeactivate(location) }
              : { label: 'Activate', tone: 'info', onSelect: () => onActivate(location) },
          );
        }
        return (
          <li
            key={location.id}
            className={`flex items-center gap-3 rounded-card border border-line bg-canvas py-3 pr-2 shadow-card ${
              depth === 1 ? 'ml-4 pl-3' : 'pl-4'
            } ${location.active ? '' : 'opacity-60'}`}
          >
            {depth === 1 ? <CornerDownRightIcon className="h-4 w-4 shrink-0 text-ink-muted" /> : null}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate text-[15px] font-semibold text-ink">{location.name}</span>
                <LocationTypeBadge type={location.location_type} />
              </div>
              <div className="flex items-center gap-2 text-[13px] text-ink-secondary">
                <span className="tabular-nums">{count > 0 ? `${count} ${count === 1 ? 'item' : 'items'}` : 'No stock'}</span>
                <ActiveStatusBadge active={location.active} />
              </div>
            </div>
            <ActionMenu label={`Actions for ${location.name}`} items={items} />
          </li>
        );
      })}
    </ul>
  );
}
