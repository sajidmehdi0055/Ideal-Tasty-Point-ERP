import { useState } from 'react';
import { Button, Modal } from '../../../design-system/components';
import { CircleAlertIcon, PowerIcon, TriangleAlertIcon } from '../../../design-system/icons';
import { describeStockError } from '../format';
import type { StockLocation } from '../types';

export type BlockedReason = 'LOCATION_HAS_STOCK' | 'LOCATION_HAS_ACTIVE_CHILDREN' | 'LOCATION_HAS_PENDING_TRANSFERS';

export const BLOCKED_REASONS: readonly BlockedReason[] = [
  'LOCATION_HAS_STOCK',
  'LOCATION_HAS_ACTIVE_CHILDREN',
  'LOCATION_HAS_PENDING_TRANSFERS',
];

export function isBlockedReason(code: string): code is BlockedReason {
  return (BLOCKED_REASONS as readonly string[]).includes(code);
}

interface DeactivateDialogProps {
  location: StockLocation;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/** L4 — Owner only, shown for a location with no stock and no active freezers under it. */
export function DeactivateDialog({ location, onConfirm, onClose }: DeactivateDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function handleConfirm() {
    setSubmitting(true);
    setError(undefined);
    try {
      await onConfirm();
    } catch (err) {
      setError(describeStockError(err));
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      size="lg"
      title={`Deactivate “${location.name}”?`}
      icon={<PowerIcon className="h-4 w-4 shrink-0 text-danger-700" />}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => void handleConfirm()} loading={submitting}>
            Deactivate
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[13px] text-ink-secondary">
        {error ? (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-control border border-danger-50 bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700"
          >
            <CircleAlertIcon className="h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : null}
        <p>
          {location.name} has no stock and no active freezers under it. After deactivation it cannot be chosen for new
          opening stock, adjustments, receipts or transfers. Its history stays in the stock ledger, and the Owner can
          activate it again.
        </p>
        <p className="flex w-fit items-center gap-2 rounded-control bg-canvas-sunken px-2 py-1.5 text-xs">
          <span className="rounded border border-line bg-canvas px-1.5 py-0.5 font-medium text-ink-secondary">Owner only</span>
          Managers do not see Activate / Deactivate.
        </p>
      </div>
    </Modal>
  );
}

const PRIMARY_TEXT: Record<BlockedReason, (itemsInStock: number | undefined) => string> = {
  LOCATION_HAS_STOCK: count =>
    `This location still holds stock${
      count ? ` (${count} ${count === 1 ? 'item' : 'items'})` : ''
    }. Move the stock to another location with a transfer, or adjust it to zero, then try again.`,
  LOCATION_HAS_ACTIVE_CHILDREN: () =>
    'Active freezers still sit under this location. Deactivate those freezers first, then try again.',
  LOCATION_HAS_PENDING_TRANSFERS: () =>
    'A sent transfer to or from this location is not yet received. Receive or cancel it first, then try again.',
};

const OTHER_TEXT: Record<BlockedReason, string> = {
  LOCATION_HAS_STOCK: 'the location still holds stock',
  LOCATION_HAS_ACTIVE_CHILDREN: 'active freezers still sit under it',
  LOCATION_HAS_PENDING_TRANSFERS: 'a sent transfer to or from it is not yet received',
};

interface CannotDeactivateDialogProps {
  location: StockLocation;
  reason: BlockedReason;
  itemsInStock: number | undefined;
  onClose: () => void;
}

/** L5 — explains a 409 that blocks deactivation (or the same condition known from the loaded data). */
export function CannotDeactivateDialog({ location, reason, itemsInStock, onClose }: CannotDeactivateDialogProps) {
  const others = BLOCKED_REASONS.filter(other => other !== reason);
  return (
    <Modal
      open
      size="lg"
      title={`Cannot deactivate “${location.name}”`}
      icon={<TriangleAlertIcon className="h-4 w-4 shrink-0 text-warning-700" />}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-3 text-[13px] text-ink-secondary">
        <p>{PRIMARY_TEXT[reason](itemsInStock)}</p>
        <div className="text-xs">
          <p>The same check blocks deactivation when:</p>
          <ul className="list-disc pl-5">
            {others.map(other => (
              <li key={other}>
                {OTHER_TEXT[other]} (409 · {other})
              </li>
            ))}
          </ul>
        </div>
        <p className="w-fit rounded bg-warning-50 px-2 py-0.5 text-[11px] font-medium text-warning-700">409 · {reason}</p>
      </div>
    </Modal>
  );
}
