export type Density = 'comfortable' | 'compact';

/** One column of a DataTable. `id` must be stable: it is the storage key for the column's width/visibility. */
export interface ColumnDef {
  id: string;
  /** Header text (shown uppercase) and the name in the Columns menu. */
  label: string;
  /** Required columns can never be hidden (locked in the Columns menu; stored "hidden" values are ignored). */
  required?: boolean;
  /** Smallest width in px the user can drag/fit the column to, so text never disappears. */
  minWidth: number;
  /**
   * Starting width in px on desktop. Leave it out on ONE flexible column
   * (usually the main text column, e.g. Item) so that column absorbs spare space.
   */
  defaultWidth?: number;
  /** Largest width in px (default 800). */
  maxWidth?: number;
  align?: 'left' | 'right';
  /** Default true. `false` hides the resize handle on this column's right edge. */
  resizable?: boolean;
  /** Visually hide the header text (e.g. an Actions column); it stays available to screen readers. */
  hideLabel?: boolean;
}

export const DEFAULT_MAX_COLUMN_WIDTH = 800;

export function clampWidth(column: ColumnDef, px: number): number {
  const max = column.maxWidth ?? DEFAULT_MAX_COLUMN_WIDTH;
  return Math.round(Math.min(Math.max(px, column.minWidth), Math.max(max, column.minWidth)));
}

/**
 * Widths to apply when the table must fit `available` px (the scroll container's width).
 *
 * - A width the user stored is honoured as-is.
 * - The flexible column (no `defaultWidth`, nothing stored) stays `undefined` and only
 *   reserves its `minWidth`.
 * - When everything does not fit, the default widths shrink proportionally toward their
 *   `minWidth` — never below it — so required columns such as Actions stay visible without
 *   inner horizontal scroll. If even the minimum widths (or the user's stored widths) do not
 *   fit, the table keeps its inner horizontal scroll.
 */
export function fitColumnWidths(
  columns: readonly ColumnDef[],
  storedWidthOf: (id: string) => number | undefined,
  available: number | undefined,
): Map<string, number | undefined> {
  const result = new Map<string, number | undefined>();
  let total = 0;
  let shrinkable = 0;
  for (const column of columns) {
    const stored = storedWidthOf(column.id);
    const width = stored ?? column.defaultWidth;
    result.set(column.id, width);
    total += width ?? column.minWidth;
    if (stored === undefined && column.defaultWidth !== undefined) {
      shrinkable += Math.max(0, column.defaultWidth - column.minWidth);
    }
  }
  if (available === undefined || !(available > 0) || total <= available || shrinkable === 0) return result;
  const ratio = Math.min(1, (total - available) / shrinkable);
  for (const column of columns) {
    if (storedWidthOf(column.id) !== undefined || column.defaultWidth === undefined) continue;
    const room = Math.max(0, column.defaultWidth - column.minWidth);
    result.set(column.id, Math.max(column.minWidth, Math.floor(column.defaultWidth - room * ratio)));
  }
  return result;
}
