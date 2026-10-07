import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';

// Basic table for simple lists. Screens that need density, resizable or
// hideable columns use design-system/data-table instead.

const focusRing = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus';

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-canvas shadow-card">
      <table className="w-full min-w-full divide-y divide-line text-left text-sm">{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return <thead className="bg-canvas-sunken">{children}</thead>;
}

export function TableBody({ children }: { children: ReactNode }) {
  // Row hover lives here (not on TableRow) so header rows never highlight.
  return <tbody className="divide-y divide-line [&>tr]:transition-colors [&>tr:hover]:bg-canvas-hover">{children}</tbody>;
}

export function TableRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <tr className={`${focusRing} ${className}`}>{children}</tr>;
}

/** Header cell: 40px tall and sticky inside a vertically scrolling container. */
export function TableHeaderCell({ children, className = '', ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={`sticky top-0 z-10 h-row-header bg-canvas-sunken px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted ${className}`}
      {...rest}
    >
      {children}
    </th>
  );
}

export function TableCell({ children, className = '', ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`px-4 py-3 text-sm text-ink ${focusRing} ${className}`} {...rest}>
      {children}
    </td>
  );
}
