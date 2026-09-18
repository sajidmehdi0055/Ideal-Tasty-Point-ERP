import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Button, Input, Select, type SelectOption } from '../../../design-system/components';
import { PRIMARY_ITEM_TYPES, PRIMARY_ITEM_TYPE_LABELS, GENERIC_BRAND, type ItemInput } from '../types';
import { validateItemForm, type ItemFieldErrors } from '../validation';

const TYPE_OPTIONS: SelectOption[] = PRIMARY_ITEM_TYPES.map(type => ({
  value: type,
  label: PRIMARY_ITEM_TYPE_LABELS[type],
}));

interface ItemFormProps {
  mode: 'create' | 'edit';
  initialValues?: ItemInput | undefined;
  submitting: boolean;
  serverError?: string | undefined;
  serverFieldErrors?: ItemFieldErrors | undefined;
  onSubmit: (values: ItemInput) => void;
  onCancel: () => void;
}

export function ItemForm({
  mode,
  initialValues,
  submitting,
  serverError,
  serverFieldErrors,
  onSubmit,
  onCancel,
}: ItemFormProps) {
  const [values, setValues] = useState({
    item_name: initialValues?.item_name ?? '',
    primary_item_type: initialValues?.primary_item_type ?? '',
    base_uom: initialValues?.base_uom ?? '',
    brand: initialValues?.brand ?? (mode === 'create' ? GENERIC_BRAND : ''),
  });
  const [clientErrors, setClientErrors] = useState<ItemFieldErrors>({});

  const fieldErrors: ItemFieldErrors = { ...clientErrors, ...serverFieldErrors };

  function handleChange(field: keyof typeof values) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { value } = event.target;
      setValues(current => ({ ...current, [field]: value }));
    };
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const { data, errors } = validateItemForm(values);
    setClientErrors(errors);
    if (!data) return;
    onSubmit(data);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {serverError ? (
        <p role="alert" className="rounded-control border border-danger-50 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {serverError}
        </p>
      ) : null}
      <Input
        label="Item name"
        required
        value={values.item_name}
        onChange={handleChange('item_name')}
        error={fieldErrors.item_name}
        disabled={submitting}
      />
      <Select
        label="Primary item type"
        required
        placeholder="Select a type"
        options={TYPE_OPTIONS}
        value={values.primary_item_type}
        onChange={handleChange('primary_item_type')}
        error={fieldErrors.primary_item_type}
        disabled={submitting}
      />
      <Input
        label="Base UOM"
        required
        hint='Plain unit name on the stable API (e.g. "kg", "pcs") — not a catalog lookup yet.'
        value={values.base_uom}
        onChange={handleChange('base_uom')}
        error={fieldErrors.base_uom}
        disabled={submitting}
      />
      <Input
        label="Brand"
        required
        hint={`Use "${GENERIC_BRAND}" when the item has no brand.`}
        value={values.brand}
        onChange={handleChange('brand')}
        error={fieldErrors.brand}
        disabled={submitting}
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          {mode === 'create' ? 'Create item' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
