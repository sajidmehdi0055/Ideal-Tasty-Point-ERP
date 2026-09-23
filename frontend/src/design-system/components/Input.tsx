import type { InputHTMLAttributes } from 'react';
import { FormField } from './FormField';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

export function Input({ label, error, hint, required, className = '', ...rest }: InputProps) {
  return (
    <FormField label={label} required={required} hint={hint} error={error}>
      {({ id, describedBy }) => (
        <input
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`h-10 rounded-control border px-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:bg-canvas-muted disabled:text-ink-muted ${error ? 'border-danger-600' : 'border-line'} ${className}`}
          {...rest}
        />
      )}
    </FormField>
  );
}
