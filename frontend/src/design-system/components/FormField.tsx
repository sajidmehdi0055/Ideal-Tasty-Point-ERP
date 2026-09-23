import { useId, type ReactNode } from 'react';

interface FormFieldRenderProps {
  id: string;
  describedBy: string | undefined;
}

interface FormFieldProps {
  label: string;
  required?: boolean | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  children: (field: FormFieldRenderProps) => ReactNode;
}

/** Shared label/hint/error chrome for form controls (Input, Select, ...). */
export function FormField({ label, required, hint, error, children }: FormFieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {required ? <span className="ml-0.5 text-danger-600">*</span> : null}
      </label>
      {children({ id, describedBy })}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
