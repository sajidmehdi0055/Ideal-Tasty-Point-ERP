import { Link } from 'react-router-dom';
import { ActiveStatusBadge, getButtonClassName } from '../../../design-system/components';
import { DataCell, DataRow, DataTable, type ColumnDef, type TableSettings } from '../../../design-system/data-table';
import { unitLabel } from '../../../lib/format';
import { PrimaryTypeBadge } from './PrimaryTypeBadge';
import type { Item } from '../types';

/** Item Master columns (screenId 'items'). Item and Actions can never be hidden. */
export const ITEM_COLUMNS: readonly ColumnDef[] = [
  { id: 'item', label: 'Item', required: true, minWidth: 220 },
  { id: 'type', label: 'Primary type', minWidth: 140, defaultWidth: 220 },
  { id: 'base_uom', label: 'Base unit', minWidth: 90, defaultWidth: 130 },
  { id: 'brand', label: 'Brand', minWidth: 120, defaultWidth: 180 },
  { id: 'status', label: 'Status', minWidth: 100, defaultWidth: 130 },
  { id: 'actions', label: 'Actions', required: true, minWidth: 96, defaultWidth: 120, align: 'right', resizable: false },
];

interface ItemTableProps {
  items: Item[];
  canEdit: boolean;
  settings: TableSettings;
}

export function ItemTable({ items, canEdit, settings }: ItemTableProps) {
  const compact = settings.density === 'compact';
  const show = settings.isVisible;
  return (
    <DataTable settings={settings} ariaLabel="Items" maxHeight="calc(100vh - 360px)">
      {items.map(item => (
        <DataRow key={item.id}>
          {show('item') ? (
            <DataCell title={`${item.item_name} · ${item.item_code}`}>
              {/* Comfortable: code under the name. Compact: code on the name's line. */}
              <span className={`flex min-w-0 leading-[normal] ${compact ? 'items-baseline gap-2.5' : 'flex-col gap-px'}`}>
                <span className="truncate text-sm font-semibold text-ink">{item.item_name}</span>
                <span className={`text-xs font-medium text-ink-muted ${compact ? 'shrink-0' : 'truncate'}`}>{item.item_code}</span>
              </span>
            </DataCell>
          ) : null}
          {show('type') ? (
            <DataCell>
              <PrimaryTypeBadge type={item.primary_item_type} />
            </DataCell>
          ) : null}
          {/* Display label (kg, L, pcs); the stored base UOM is unchanged and shown on hover. */}
          {show('base_uom') ? (
            <DataCell title={item.base_uom} className="text-[13.5px]! font-medium">
              {unitLabel(item.base_uom)}
            </DataCell>
          ) : null}
          {show('brand') ? <DataCell title={item.brand}>{item.brand}</DataCell> : null}
          {show('status') ? (
            <DataCell>
              <ActiveStatusBadge active={item.active} />
            </DataCell>
          ) : null}
          {show('actions') ? (
            <DataCell align="right">
              {canEdit ? (
                <Link
                  to={`/items/${item.id}/edit`}
                  state={{ item }}
                  className={getButtonClassName({ variant: 'secondary', size: 'xs' })}
                >
                  Edit
                </Link>
              ) : (
                <span className="text-xs text-ink-muted">View only</span>
              )}
            </DataCell>
          ) : null}
        </DataRow>
      ))}
    </DataTable>
  );
}
