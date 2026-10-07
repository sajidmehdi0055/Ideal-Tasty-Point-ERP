import { ActiveStatusBadge, Badge, Button } from '../../../design-system/components';
import { DataCell, DataRow, DataTable, type ColumnDef, type TableSettings } from '../../../design-system/data-table';
import { UNIT_TYPE_LABELS, type Uom } from './types';

/** UOM Master columns (screenId 'uom'). Unit and Actions can never be hidden. */
export const UOM_COLUMNS: readonly ColumnDef[] = [
  { id: 'unit', label: 'Unit', required: true, minWidth: 160 },
  { id: 'unit_type', label: 'Unit type', minWidth: 120, defaultWidth: 220 },
  { id: 'status', label: 'Status', minWidth: 100, defaultWidth: 160 },
  { id: 'actions', label: 'Actions', required: true, minWidth: 180, defaultWidth: 220, align: 'right', resizable: false },
];

interface UomTableProps {
  uoms: Uom[];
  settings: TableSettings;
  onEdit: (uom: Uom) => void;
  onToggleActive: (uom: Uom) => void;
  togglingId?: string | undefined;
}

export function UomTable({ uoms, settings, onEdit, onToggleActive, togglingId }: UomTableProps) {
  const show = settings.isVisible;
  return (
    <DataTable settings={settings} ariaLabel="Units of measure" maxHeight="calc(100vh - 340px)">
      {uoms.map(uom => (
        <DataRow key={uom.id}>
          {/* Stored UOM names are shown exactly as saved (no display-label mapping here). */}
          {show('unit') ? <DataCell className="text-[13.5px]! font-semibold">{uom.name}</DataCell> : null}
          {show('unit_type') ? (
            <DataCell>
              <Badge>{UNIT_TYPE_LABELS[uom.unit_type]}</Badge>
            </DataCell>
          ) : null}
          {show('status') ? (
            <DataCell>
              <ActiveStatusBadge active={uom.active} />
            </DataCell>
          ) : null}
          {show('actions') ? (
            <DataCell align="right">
              <div className="flex justify-end gap-1.5">
                <Button size="xs" variant="secondary" onClick={() => onEdit(uom)}>
                  Edit
                </Button>
                <Button
                  size="xs"
                  variant={uom.active ? 'danger-text' : 'ghost'}
                  onClick={() => onToggleActive(uom)}
                  disabled={togglingId === uom.id}
                >
                  {uom.active ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            </DataCell>
          ) : null}
        </DataRow>
      ))}
    </DataTable>
  );
}
