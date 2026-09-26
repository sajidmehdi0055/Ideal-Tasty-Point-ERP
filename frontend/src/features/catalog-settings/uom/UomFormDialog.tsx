import { useId, useState, type ChangeEvent, type FormEvent } from 'react';
import { Button, Input, Modal, Select, type SelectOption } from '../../../design-system/components';
import { CircleAlertIcon } from '../../../design-system/icons';
import { UNIT_TYPE_LABELS, UNIT_TYPES, type Uom, type UomInput } from './types';
import { validateUomForm, type UomFieldErrors } from './validation';

const TYPE_OPTIONS: SelectOption[] = UNIT_TYPES.map(type => ({ value: type, label: UNIT_TYPE_LABELS[type] }));

interface UomFormDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  initialValues?: Uom | undefined;
  submitting: boolean;
  serverError?: string | undefined;
  serverFieldErrors?: UomFieldErrors | undefined;
  onSubmit: (values: UomInput & { active?: boolean }) => void;
  onClose: () => void;
}

export function UomFormDialog({
  open,
  mode,
  initialValues,
  submitting,
  serverError,
  serverFieldErrors,
  onSubmit,
  onClose,
}: UomFormDialogProps) {
  const switchId = useId();
  const [values, setValues] = useState({
    name: initialValues?.name ?? '',
    unit_type: initialValues?.unit_type ?? '',
  });
  const [active, setActive] = useState(initialValues?.active ?? true);
  const [clientErrors, setClientErrors] = useState<UomFieldErrors>({});

  const fieldErrors: UomFieldErrors = { ...clientErrors, ...serverFieldErrors };

  function handleChange(field: keyof typeof values) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { value } = event.target;
      setValues(current => ({ ...current, [field]: value }));
    };
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const { data, errors } = validateUomForm(values);
    setClientErrors(errors);
    if (!data) return;
    onSubmit(mode === 'edit' ? { ...data, active } : data);
  }

  return (
    <Modal
      open={open}
      title={mode === 'create' ? 'New unit' : 'Edit unit'}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="dark" loading={submitting} form="uom-form">
            {mode === 'create' ? 'Create unit' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form id="uom-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {serverError ? (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-control border border-danger-50 bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700"
          >
            <CircleAlertIcon className="h-4 w-4 shrink-0" />
            {serverError}
          </p>
        ) : null}
        <Input
          label="Name"
          required
          placeholder="e.g. KG"
          hint="Must be unique. Capital/small letters and spaces at the start or end are ignored (KG = kg)."
          value={values.name}
          onChange={handleChange('name')}
          error={fieldErrors.name}
          disabled={submitting}
        />
        <Select
          label="Unit type"
          required
          placeholder="Select unit type"
          options={TYPE_OPTIONS}
          value={values.unit_type}
          onChange={handleChange('unit_type')}
          error={fieldErrors.unit_type}
          disabled={submitting}
        />
        {mode === 'edit' ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor={switchId} className="text-sm font-medium text-ink">
                Active
              </label>
              <button
                id={switchId}
                type="button"
                role="switch"
                aria-checked={active}
                disabled={submitting}
                onClick={() => setActive(current => !current)}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                  active ? 'bg-success-600' : 'bg-line'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                    active ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-ink-muted">Inactive units can&apos;t be selected as an item&apos;s Base UOM.</p>
          </div>
        ) : null}
      </form>
    </Modal>
  );
}
