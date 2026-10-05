import { useId, useState, type FormEvent } from 'react';
import { Button, Input, Modal, Select, type SelectOption } from '../../../design-system/components';
import { CircleAlertIcon } from '../../../design-system/icons';
import { ApiError } from '../../../lib/api-client';
import { codeSuffix, describeStockError } from '../format';
import { LOCATION_TYPE_LABELS, LOCATION_TYPES, type LocationType, type StockLocation } from '../types';

export const MAX_LOCATION_NAME = 200;

const TYPE_DESCRIPTIONS: Record<LocationType, string> = {
  STORE: 'Top-level storage area (e.g. main store, rented store)',
  KITCHEN: 'Top-level kitchen area (e.g. upper kitchen, lower kitchen)',
  FREEZER: 'A single freezer that sits under one store or kitchen',
};

interface FieldErrors {
  name?: string;
  location_type?: string;
  parent_id?: string;
}

export interface LocationFormValues {
  name: string;
  location_type: LocationType;
  parent_id?: string;
}

interface LocationFormDialogProps {
  mode: 'create' | 'rename';
  /** The location being renamed (rename mode). */
  location?: StockLocation | undefined;
  /** All locations (parent choices and the read-only parent name). */
  locations: StockLocation[];
  onSubmit: (values: LocationFormValues) => Promise<void>;
  onClose: () => void;
}

function mapServerError(error: unknown, name: string): { fields: FieldErrors; form?: string } {
  if (error instanceof ApiError) {
    if (error.code === 'DUPLICATE_LOCATION_NAME') {
      return {
        fields: { name: `A location named “${name.trim()}” already exists in this branch. ${codeSuffix(error)}` },
      };
    }
    if (error.code === 'INVALID_PARENT' || error.code === 'PARENT_INACTIVE') {
      return {
        fields: {
          parent_id: `Choose an active store or kitchen in this branch — the selected parent is no longer available. ${codeSuffix(error)}`,
        },
      };
    }
    if (error.code === 'VALIDATION_ERROR' && error.issues?.length) {
      const fields: FieldErrors = {};
      for (const issue of error.issues) {
        const field = issue.path[0];
        if (field === 'name' || field === 'location_type' || field === 'parent_id') fields[field] = issue.message;
      }
      if (Object.keys(fields).length > 0) return { fields };
    }
  }
  return { fields: {}, form: describeStockError(error) };
}

/** L2 "New location" and L3 "Rename" (type and parent are fixed after creation). */
export function LocationFormDialog({ mode, location, locations, onSubmit, onClose }: LocationFormDialogProps) {
  const typeGroupId = useId();
  const [name, setName] = useState(location?.name ?? '');
  const [type, setType] = useState<LocationType | ''>(location?.location_type ?? '');
  const [parentId, setParentId] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  // Only an active STORE / KITCHEN can be a parent (server: INVALID_PARENT otherwise).
  const parentOptions: SelectOption[] = locations
    .filter(candidate => candidate.parent_id === null && candidate.location_type !== 'FREEZER' && candidate.active)
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
    .map(candidate => ({ value: candidate.id, label: candidate.name }));
  const parentName = location?.parent_id ? locations.find(candidate => candidate.id === location.parent_id)?.name : undefined;

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    const trimmed = name.trim();
    if (!trimmed) next.name = 'Enter a name.';
    else if (trimmed.length > MAX_LOCATION_NAME) next.name = `Use at most ${MAX_LOCATION_NAME} characters.`;
    if (mode === 'create') {
      if (!type) next.location_type = 'Choose a type.';
      else if (type === 'FREEZER' && !parentId) next.parent_id = 'Choose the store or kitchen this freezer sits under.';
    }
    return next;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const clientErrors = validate();
    setErrors(clientErrors);
    setFormError(undefined);
    if (Object.keys(clientErrors).length > 0 || !type) return;
    if (mode === 'rename' && location && name.trim() === location.name) {
      onClose();
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        location_type: type,
        ...(mode === 'create' && type === 'FREEZER' ? { parent_id: parentId } : {}),
      });
    } catch (error) {
      const mapped = mapServerError(error, name);
      setErrors(mapped.fields);
      setFormError(mapped.form);
      setSubmitting(false);
    }
  }

  const title = mode === 'create' ? 'New location' : `Rename “${location?.name ?? ''}”`;

  return (
    <Modal
      open
      size="lg"
      title={title}
      onClose={onClose}
      dismissible={!submitting}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="stock-location-form" loading={submitting}>
            {mode === 'create' ? 'Create location' : 'Save'}
          </Button>
        </>
      }
    >
      <form id="stock-location-form" noValidate onSubmit={event => void handleSubmit(event)} className="flex flex-col gap-4">
        {formError ? (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-control border border-danger-50 bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700"
          >
            <CircleAlertIcon className="h-4 w-4 shrink-0" />
            {formError}
          </p>
        ) : null}

        <Input
          label="Name"
          value={name}
          onChange={event => setName(event.target.value)}
          hint={`Unique in this branch. Max ${MAX_LOCATION_NAME} characters.`}
          error={errors.name}
          maxLength={MAX_LOCATION_NAME + 50}
          autoComplete="off"
          disabled={submitting}
        />

        {mode === 'create' ? (
          <fieldset className="flex flex-col gap-1.5" aria-describedby={errors.location_type ? `${typeGroupId}-error` : undefined}>
            <legend className="mb-1.5 text-sm font-medium text-ink">Type</legend>
            <div className="flex flex-col gap-2">
              {LOCATION_TYPES.map(option => {
                const selected = type === option;
                return (
                  <label
                    key={option}
                    className={`flex cursor-pointer items-start gap-3 rounded-control border px-3 py-2.5 transition-colors ${
                      selected ? 'border-action bg-canvas-sunken' : 'border-line hover:bg-canvas-hover'
                    }`}
                  >
                    <input
                      type="radio"
                      name={typeGroupId}
                      value={option}
                      checked={selected}
                      disabled={submitting}
                      onChange={() => {
                        setType(option);
                        if (option !== 'FREEZER') setParentId('');
                      }}
                      className="mt-0.5 h-4 w-4 accent-action"
                    />
                    <span className="flex flex-col">
                      <span className="text-[13px] font-semibold text-ink">{LOCATION_TYPE_LABELS[option]}</span>
                      <span className="text-xs text-ink-secondary">{TYPE_DESCRIPTIONS[option]}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            {errors.location_type ? (
              <p id={`${typeGroupId}-error`} role="alert" className="text-xs font-medium text-danger-600">
                {errors.location_type}
              </p>
            ) : null}
          </fieldset>
        ) : (
          <Input label="Type" value={LOCATION_TYPE_LABELS[location?.location_type ?? 'STORE']} readOnly disabled hint="Fixed after creation." />
        )}

        {mode === 'create' && type === 'FREEZER' ? (
          <Select
            label="Parent (store or kitchen)"
            placeholder={parentOptions.length ? 'Choose a store or kitchen' : 'No active store or kitchen yet'}
            options={parentOptions}
            value={parentId}
            onChange={event => setParentId(event.target.value)}
            hint="Only active stores and kitchens are listed. Type and parent cannot be changed after saving."
            error={errors.parent_id}
            disabled={submitting}
          />
        ) : null}

        {mode === 'rename' && location?.location_type === 'FREEZER' ? (
          <Input label="Parent" value={parentName ?? '—'} readOnly disabled hint="Fixed after creation." />
        ) : null}
      </form>
    </Modal>
  );
}
