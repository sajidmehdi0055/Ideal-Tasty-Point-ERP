import type { InputHTMLAttributes } from 'react';

interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  label: string;
  onClear?: () => void;
}

export function SearchField({ label, value, onClear, className = '', ...rest }: SearchFieldProps) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        className="pointer-events-none absolute left-3 h-4 w-4 text-ink-muted"
      >
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="m14 14 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        aria-label={label}
        value={value}
        className="h-10 w-full rounded-control border border-line bg-canvas py-2 pl-9 pr-8 text-sm text-ink outline-none transition-colors placeholder:text-ink-muted focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        {...rest}
      />
      {onClear && value ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute right-2 rounded-control p-1 text-ink-muted hover:bg-canvas-muted hover:text-ink"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}
