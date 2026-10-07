import type { InputHTMLAttributes, Ref } from 'react';

interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  label: string;
  onClear?: () => void;
  /** Forwarded to the <input> (e.g. for data-table's useSlashFocus). */
  ref?: Ref<HTMLInputElement>;
  /** Keyboard shortcut chip shown at the right while the box is empty, e.g. "/". Visual only. */
  shortcutHint?: string | undefined;
}

export function SearchField({ label, value, onClear, shortcutHint, className = '', ...rest }: SearchFieldProps) {
  const showClear = Boolean(onClear && value);
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
      {showClear ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="absolute right-2 rounded-control p-1 text-ink-muted hover:bg-canvas-muted hover:text-ink"
        >
          ✕
        </button>
      ) : shortcutHint && !value ? (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute right-2 flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-line-strong px-1 font-sans text-[11px] font-semibold text-ink-muted"
        >
          {shortcutHint}
        </kbd>
      ) : null}
    </div>
  );
}
