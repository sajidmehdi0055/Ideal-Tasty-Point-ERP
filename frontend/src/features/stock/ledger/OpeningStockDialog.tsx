import { useState, type FormEvent } from 'react';
import { Button, Input, Modal, Select } from '../../../design-system/components';
import { CircleAlertIcon, InfoIcon } from '../../../design-system/icons';
import { ApiError } from '../../../lib/api-client';
import type { Item } from '../../items/types';
import { createOpening } from '../api';
import { codeSuffix, describeStockError } from '../format';
import { locationPath, orderLocationTree } from '../locations-tree';
import { parseQuantity, QUANTITY_INPUT_PATTERN } from '../quantity';
import type { StockLocation, StockMovement } from '../types';
import { ItemPicker } from './ItemPicker';

interface FieldErrors {
  location?: string;
  item?: string;
  quantity?: string;
}

export interface OpeningSaved {
  movement: StockMovement;
  item: Item;
  /** "Main Store › Freezer 2", as in the Adjust status line. */
  locationLabel: string;
}

interface OpeningStockDialogProps {
  /** All locations of the branch; only active ones are offered. */
  locations: StockLocation[];
  onSaved: (saved: OpeningSaved) => void;
  onClose: () => void;
}

/**
 * G4 — Opening stock (UI-STOCK-001 frame 116:11606). Location, item (picker
 * over the item list/search endpoint) and a positive quantity in the item's
 * base unit; quantity only, no value (ADR-0008 O-04). The server decides
 * whether an opening is still allowed (409 OPENING_ALREADY_EXISTS /
 * STOCK_HISTORY_EXISTS): opening stock must be the first entry for an item
 * at a location and is never edited — corrections are adjustments (O-03).
 */
export function OpeningStockDialog({ locations, onSaved, onClose }: OpeningStockDialogProps) {
  const [locationId, setLocationId] = useState('');
  const [item, setItem] = useState<Item | null>(null);
  const [quantity, setQuantity] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  const byId = new Map(locations.map(location => [location.id, location]));
  const activeRows = orderLocationTree(locations).filter(row => row.location.active);
  const location = byId.get(locationId);
  const locationLabel = location ? locationPath(location, byId) : '';
  const unit = item?.base_uom;
  const trimmedQuantity = quantity.trim();
  const amount = QUANTITY_INPUT_PATTERN.test(trimmedQuantity) ? parseQuantity(trimmedQuantity) : null;

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!location) next.location = 'Choose a location.';
    if (!item) next.item = 'Choose an item.';
    if (!trimmedQuantity) next.quantity = 'Enter a quantity.';
    else if (amount === null) next.quantity = 'Use a plain number with up to 12 digits and up to 6 decimals, e.g. 2.5.';
    else if (amount <= 0n) next.quantity = 'Quantity must be above zero.';
    return next;
  }

  // A pair-level server error belongs to the old item + location choice.
  function clearPairErrors() {
    setErrors(current => (current.quantity ? { quantity: current.quantity } : {}));
    setFormError(undefined);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const clientErrors = validate();
    setErrors(clientErrors);
    setFormError(undefined);
    if (Object.keys(clientErrors).length > 0 || !item || !location) return;
    setSubmitting(true);
    try {
      const movement = await createOpening({ item_id: item.id, location_id: location.id, quantity: trimmedQuantity });
      onSaved({ movement, item, locationLabel });
    } catch (error) {
      setSubmitting(false);
      if (!(error instanceof ApiError)) {
        setFormError(describeStockError(error));
        return;
      }
      switch (error.code) {
        case 'STOCK_HISTORY_EXISTS':
          setErrors({
            item: `${item.item_name} already has stock entries at ${locationLabel} — opening stock must be the first entry there. Use Adjust on its balance row instead. ${codeSuffix(error)}`,
          });
          return;
        case 'OPENING_ALREADY_EXISTS':
          setErrors({
            item: `Opening stock for ${item.item_name} at ${locationLabel} already exists. Use Adjust on its balance row instead. ${codeSuffix(error)}`,
          });
          return;
        case 'ITEM_INACTIVE':
          setErrors({ item: `${item.item_name} is inactive — stock cannot be recorded for it. ${codeSuffix(error)}` });
          return;
        case 'LOCATION_INACTIVE':
          setErrors({ location: `${locationLabel} is inactive — stock cannot be recorded there. ${codeSuffix(error)}` });
          return;
      }
      if (error.code === 'VALIDATION_ERROR' && error.issues?.length) {
        const mapped: FieldErrors = {};
        for (const issue of error.issues) {
          const field = issue.path[0];
          if (field === 'location_id') mapped.location = issue.message;
          if (field === 'item_id') mapped.item = issue.message;
          if (field === 'quantity') mapped.quantity = issue.message;
        }
        if (Object.keys(mapped).length > 0) {
          setErrors(mapped);
          return;
        }
      }
      if (error.status === 404) {
        setFormError(`The item or location no longer exists — close this dialog, refresh and choose again. ${codeSuffix(error)}`);
        return;
      }
      setFormError(describeStockError(error));
    }
  }

  return (
    <Modal
      open
      size="xl"
      title="Opening stock"
      onClose={onClose}
      dismissible={!submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="stock-opening-form" loading={submitting} className="font-semibold">
            Save opening stock
          </Button>
        </>
      }
    >
      <form id="stock-opening-form" noValidate onSubmit={event => void handleSubmit(event)} className="flex flex-col gap-4">
        {formError ? (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-control border border-danger-50 bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700"
          >
            <CircleAlertIcon className="h-4 w-4 shrink-0" />
            {formError}
          </p>
        ) : null}

        <Select
          label="Location"
          placeholder={activeRows.length > 0 ? 'Choose a location' : 'No active locations'}
          options={activeRows.map(({ location: row, parent }) => ({
            value: row.id,
            label: parent ? `${row.name} · ${parent.name}` : row.name,
          }))}
          value={locationId}
          onChange={event => {
            setLocationId(event.target.value);
            clearPairErrors();
          }}
          hint={activeRows.length > 0 ? 'Active locations only.' : 'Add or activate a location in Stock Locations first.'}
          error={errors.location}
          disabled={submitting}
        />

        <ItemPicker
          value={item}
          onChange={next => {
            setItem(next);
            clearPairErrors();
          }}
          error={errors.item}
          disabled={submitting}
        />

        <Input
          label={`Quantity (${unit ?? 'base unit'})`}
          inputMode="decimal"
          autoComplete="off"
          value={quantity}
          onChange={event => setQuantity(event.target.value)}
          hint={
            unit
              ? `In the item's base unit (${unit}). Must be above zero. Up to 6 decimals.`
              : 'Must be above zero. Up to 6 decimals.'
          }
          error={errors.quantity}
          disabled={submitting}
        />

        <p className="flex gap-2 text-xs text-ink-muted">
          <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          Opening stock is entered once per item and location, before any receipt, transfer or adjustment there. It is
          never edited — corrections are adjustments.
        </p>
      </form>
    </Modal>
  );
}
