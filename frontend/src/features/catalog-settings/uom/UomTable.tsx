import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeaderCell,
  TableCell,
  StatusBadge,
  getButtonClassName,
} from '../../../design-system/components';
import { UNIT_TYPE_LABELS, type Uom } from './types';

interface UomTableProps {
  uoms: Uom[];
  onEdit: (uom: Uom) => void;
  onToggleActive: (uom: Uom) => void;
  togglingId?: string | undefined;
}

export function UomTable({ uoms, onEdit, onToggleActive, togglingId }: UomTableProps) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Name</TableHeaderCell>
          <TableHeaderCell>Unit type</TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
          <TableHeaderCell>
            <span className="sr-only">Actions</span>
          </TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {uoms.map(uom => (
          <TableRow key={uom.id} className="hover:bg-canvas-muted">
            <TableCell className="font-medium">{uom.name}</TableCell>
            <TableCell>
              <StatusBadge label={UNIT_TYPE_LABELS[uom.unit_type]} tone="neutral" />
            </TableCell>
            <TableCell>
              <StatusBadge label={uom.active ? 'Active' : 'Inactive'} tone={uom.active ? 'success' : 'neutral'} />
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => onEdit(uom)}
                  className={getButtonClassName({ variant: 'ghost', size: 'sm' })}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onToggleActive(uom)}
                  disabled={togglingId === uom.id}
                  className={getButtonClassName({ variant: 'ghost', size: 'sm' })}
                >
                  {uom.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
