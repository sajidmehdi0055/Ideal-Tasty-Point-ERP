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
