import type { SelectHTMLAttributes } from 'react';
import { FormField } from './FormField';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  options: SelectOption[];
  placeholder?: string;
  error?: string | undefined;
  hint?: string | undefined;
}

export function Select({ label, options, placeholder, error, hint, required, className = '', ...rest }: SelectProps) {
  return (
    <FormField label={label} required={required} hint={hint} error={error}>
      {({ id, describedBy }) => (
        <select
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`h-10 rounded-control border bg-canvas px-3 text-sm text-ink outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:bg-canvas-muted disabled:text-ink-muted ${error ? 'border-danger-600' : 'border-line'} ${className}`}
          {...rest}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
}
