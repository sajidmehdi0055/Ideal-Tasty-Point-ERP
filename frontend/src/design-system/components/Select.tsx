import type { SelectHTMLAttributes } from 'react';
import { ChevronDownIcon } from '../icons';
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
        // Native <select> with the Direction A chevron (Figma Stock/Field · Select) instead of the browser arrow.
        <div className="relative flex">
          <select
            id={id}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={`h-10 w-full appearance-none rounded-control border bg-canvas pl-3 pr-9 text-[13px] text-ink outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-100 disabled:bg-canvas-muted disabled:text-ink-muted ${error ? 'border-danger-600' : 'border-line-strong'} ${className}`}
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
          <ChevronDownIcon className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-ink-secondary" />
        </div>
      )}
    </FormField>
  );
}
