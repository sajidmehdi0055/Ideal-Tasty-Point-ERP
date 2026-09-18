import { Link } from 'react-router-dom';
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
import { PrimaryTypeBadge } from './PrimaryTypeBadge';
import type { Item } from '../types';

interface ItemTableProps {
  items: Item[];
  canEdit: boolean;
}

export function ItemTable({ items, canEdit }: ItemTableProps) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Item code</TableHeaderCell>
          <TableHeaderCell>Name</TableHeaderCell>
          <TableHeaderCell>Type</TableHeaderCell>
          <TableHeaderCell>Base UOM</TableHeaderCell>
          <TableHeaderCell>Brand</TableHeaderCell>
          <TableHeaderCell>Status</TableHeaderCell>
          <TableHeaderCell>
            <span className="sr-only">Actions</span>
          </TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {items.map(item => (
          <TableRow key={item.id} className="hover:bg-canvas-muted">
            <TableCell className="font-mono text-xs text-ink-muted">{item.item_code}</TableCell>
            <TableCell className="font-medium">{item.item_name}</TableCell>
            <TableCell>
              <PrimaryTypeBadge type={item.primary_item_type} />
            </TableCell>
            <TableCell>{item.base_uom}</TableCell>
            <TableCell>{item.brand}</TableCell>
            <TableCell>
              <StatusBadge label={item.active ? 'Active' : 'Inactive'} tone={item.active ? 'success' : 'neutral'} />
            </TableCell>
            <TableCell className="text-right">
              {canEdit ? (
                <Link
                  to={`/items/${item.id}/edit`}
                  state={{ item }}
                  className={getButtonClassName({ variant: 'ghost', size: 'sm' })}
                >
                  Edit
                </Link>
              ) : (
                <span className="text-xs text-ink-muted">View only</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
