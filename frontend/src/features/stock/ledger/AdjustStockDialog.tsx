import { useId, useState, type FormEvent } from 'react';
import { Button, Input, Modal } from '../../../design-system/components';
import { ArrowRightIcon, CircleAlertIcon, InfoIcon, MinusIcon, PlusIcon } from '../../../design-system/icons';
import { ApiError } from '../../../lib/api-client';
import { createAdjustment } from '../api';
import { codeSuffix, describeStockError } from '../format';
import { formatQuantity, formatQuantityValue, parseQuantity, QUANTITY_INPUT_PATTERN } from '../quantity';
import type { StockBalance, StockMovement } from '../types';

export const MAX_REASON_CHARS = 500;

type Direction = 'increase' | 'decrease';

interface FieldErrors {
  direction?: string;
  quantity?: string;
  reason?: string;
}

interface AdjustStockDialogProps {
  balance: StockBalance;
  /** "Main Store › Freezer 1" for the summary. */
  locationLabel: string;
  onSaved: (movement: StockMovement) => void;
  onClose: () => void;
}

/**
 * G3 / G5 — Adjust stock from a balance row. The item and location come from
 * the row, so no item picker is needed. `quantity_delta` = +quantity
 * (Increase) or −quantity (Decrease). The "balance after saving" preview is
 * client-side; the server's 409 NEGATIVE_BALANCE stays the final guard.
 */
export function AdjustStockDialog({ balance, locationLabel, onSaved, onClose }: AdjustStockDialogProps) {
  const directionId = useId();
  const reasonId = useId();
  const [direction, setDirection] = useState<Direction | null>(null);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const unit = balance.base_uom;
  const current = parseQuantity(balance.quantity);
  const trimmedQuantity = quantity.trim();
  const amount = QUANTITY_INPUT_PATTERN.test(trimmedQuantity) ? parseQuantity(trimmedQuantity) : null;
  const after =
    current !== null && amount !== null && amount > 0n && direction
      ? current + (direction === 'increase' ? amount : -amount)
      : null;
  const negativePreview = after !== null && after < 0n;

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!direction) next.direction = 'Choose Increase or Decrease.';
    if (!trimmedQuantity) next.quantity = 'Enter a quantity.';
    else if (amount === null) next.quantity = 'Use a plain number with up to 12 digits and up to 6 decimals, e.g. 2.5.';
    else if (amount <= 0n) next.quantity = 'Quantity must be above zero.';
    if (!reason.trim()) next.reason = 'A reason is required.';
    else if (reason.length > MAX_REASON_CHARS) next.reason = `Use at most ${MAX_REASON_CHARS} characters.`;
    return next;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const clientErrors = validate();
    setErrors(clientErrors);
    setFormError(undefined);
    if (Object.keys(clientErrors).length > 0 || !direction || amount === null) return;
    setSubmitting(true);
    try {
      const movement = await createAdjustment({
        item_id: balance.item_id,
        location_id: balance.location_id,
        quantity_delta: `${direction === 'decrease' ? '-' : ''}${trimmedQuantity}`,
        reason: reason.trim(),
      });
      onSaved(movement);
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiError && error.code === 'NEGATIVE_BALANCE') {
        setErrors({
          quantity: `Not enough stock: ${locationLabel} has ${formatQuantity(balance.quantity)} ${unit} of ${
            balance.item_name
          }. A balance cannot go below zero. ${codeSuffix(error)}`,
        });
        return;
      }
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR' && error.issues?.length) {
        const mapped: FieldErrors = {};
        for (const issue of error.issues) {
          const field = issue.path[0];
          if (field === 'quantity_delta') mapped.quantity = issue.message;
          if (field === 'reason') mapped.reason = issue.message;
        }
        if (Object.keys(mapped).length > 0) {
          setErrors(mapped);
          return;
        }
      }
      if (error instanceof ApiError && error.code === 'LOCATION_INACTIVE') {
        setFormError(`${locationLabel} is inactive — stock cannot be recorded there. ${codeSuffix(error)}`);
      } else if (error instanceof ApiError && error.code === 'ITEM_INACTIVE') {
        setFormError(`${balance.item_name} is inactive — stock cannot be recorded for it. ${codeSuffix(error)}`);
      } else if (error instanceof ApiError && error.code === 'OPENING_REQUIRED') {
        setFormError(`Record opening stock or a receipt for this item here before adjusting it. ${codeSuffix(error)}`);
      } else {
        setFormError(describeStockError(error));
      }
    }
  }

  const segment = (value: Direction, label: string, Icon: typeof PlusIcon) => {
    const selected = direction === value;
    return (
      <label
        className={`flex h-8 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-control text-[13px] transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus ${
          selected ? 'bg-canvas font-semibold text-ink shadow-card' : 'font-medium text-ink-secondary hover:text-ink'
        }`}
      >
        <input
          type="radio"
          name={directionId}
          value={value}
          checked={selected}
          disabled={submitting}
          onChange={() => setDirection(value)}
          className="sr-only"
        />
        <Icon className="h-3.5 w-3.5" />
        {label}
      </label>
    );
  };

  return (
    <Modal
      open
      size="lg"
      title="Adjust stock"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="stock-adjust-form" loading={submitting} className="font-semibold">
            Save adjustment
          </Button>
        </>
      }
    >
      <form id="stock-adjust-form" noValidate onSubmit={event => void handleSubmit(event)} className="flex flex-col gap-4">
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 rounded-control bg-canvas-sunken px-3 py-2.5 text-xs">
          <dt className="text-ink-muted">Item</dt>
          <dd className="text-[13px] font-semibold text-ink">
            {balance.item_name} · {balance.item_code}
          </dd>
          <dt className="text-ink-muted">Location</dt>
          <dd className="text-[13px] text-ink">{locationLabel}</dd>
          <dt className="text-ink-muted">Current balance</dt>
          <dd className="text-[13px] text-ink">
            {formatQuantity(balance.quantity)} {unit}
          </dd>
        </dl>

        {formError ? (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-control border border-danger-50 bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700"
          >
            <CircleAlertIcon className="h-4 w-4 shrink-0" />
            {formError}
          </p>
        ) : null}

        <fieldset className="flex flex-col gap-1.5" aria-describedby={errors.direction ? `${directionId}-error` : undefined}>
          <legend className="mb-1.5 text-sm font-medium text-ink">Change</legend>
          <div className="flex gap-1 rounded-card border border-line bg-canvas-sunken p-0.5">
            {segment('increase', 'Increase', PlusIcon)}
            {segment('decrease', 'Decrease', MinusIcon)}
          </div>
          {errors.direction ? (
            <p id={`${directionId}-error`} role="alert" className="text-xs font-medium text-danger-600">
              {errors.direction}
            </p>
          ) : null}
        </fieldset>

        <Input
          label={`Quantity (${unit})`}
          inputMode="decimal"
          autoComplete="off"
          value={quantity}
          onChange={event => setQuantity(event.target.value)}
          hint={`In the item's base unit (${unit}). Up to 6 decimals.`}
          error={errors.quantity}
          disabled={submitting}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor={reasonId} className="text-sm font-medium text-ink">
            Reason (required)
          </label>
          <textarea
            id={reasonId}
            rows={2}
            value={reason}
            onChange={event => setReason(event.target.value)}
            disabled={submitting}
            aria-invalid={errors.reason ? true : undefined}
            aria-describedby={`${reasonId}-hint`}
            className={`resize-y rounded-control border px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:bg-canvas-muted ${
              errors.reason ? 'border-danger-600' : 'border-line'
            }`}
          />
          <div id={`${reasonId}-hint`} className="flex items-start justify-between gap-3 text-xs">
            {errors.reason ? (
              <p role="alert" className="font-medium text-danger-600">
                {errors.reason}
              </p>
            ) : (
              <p className="text-ink-muted">Shown in the ledger and the audit trail.</p>
            )}
            <p className={`shrink-0 ${reason.length > MAX_REASON_CHARS ? 'font-semibold text-danger-600' : 'text-ink-muted'}`}>
              {reason.length} / {MAX_REASON_CHARS}
            </p>
          </div>
        </div>

        <div
          className={`flex items-center justify-between gap-3 rounded-control px-3 py-2.5 text-xs ${
            negativePreview ? 'bg-danger-50' : 'bg-canvas-sunken'
          }`}
          data-testid="adjust-preview"
        >
          <span className="text-ink-muted">Balance after saving</span>
          <span className="flex items-center gap-2 text-[13px] text-ink-secondary">
            {formatQuantity(balance.quantity)} {unit}
            <ArrowRightIcon className="h-3.5 w-3.5" />
            <span className={`font-semibold ${negativePreview ? 'text-danger-700' : 'text-ink'}`}>
              {after === null ? '—' : `${formatQuantityValue(after)} ${unit}`}
            </span>
          </span>
        </div>

        <p className="flex gap-2 text-xs text-ink-muted">
          <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          An adjustment is a permanent ledger entry. It cannot be edited later — a mistake is corrected with another
          adjustment.
        </p>
      </form>
    </Modal>
  );
}
