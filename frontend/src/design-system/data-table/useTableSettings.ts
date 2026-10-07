import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMediaQuery } from '../../lib/use-media-query';
import { readTableSettings, writeTableSettings, type StoredTableSettings } from './storage';
import { clampWidth, type ColumnDef, type Density } from './types';

/**
 * Table customisation (density, resize, show/hide columns) is offered only on
 * a mouse/trackpad device with a desktop-width viewport. Elsewhere tables use
 * the default layout and stored preferences are left untouched but not applied.
 */
export const TABLE_SETTINGS_MEDIA_QUERY = '(hover: hover) and (pointer: fine) and (min-width: 1024px)';

export interface TableSettings {
  screenId: string;
  /** Every column the screen defined, in display order. */
  columns: readonly ColumnDef[];
  /** True on a fine-pointer desktop ≥1024px. When false, density is always comfortable, all columns show, no stored widths apply. */
  enabled: boolean;
  /** Effective density ('comfortable' whenever `enabled` is false). */
  density: Density;
  setDensity: (density: Density) => void;
  /** Columns to render, in order (required columns are always included). */
  visibleColumns: readonly ColumnDef[];
  isVisible: (id: string) => boolean;
  /** Number of optional columns the user has hidden (0 when `enabled` is false). */
  hiddenCount: number;
  /** Hide/show an optional column. Required columns are ignored. Only rendering changes — no data is touched. */
  toggleColumn: (id: string) => void;
  /** Width in px to apply, or undefined to let the column flex (always undefined when `enabled` is false). */
  widthOf: (id: string) => number | undefined;
  /** Stores a width for a column (clamped to its min/max). */
  setWidth: (id: string, px: number) => void;
  /** "Reset to default": clears stored widths and hidden columns. Density is kept. */
  reset: () => void;
}

/**
 * Per-screen table preferences, remembered in this browser under
 * `itp-erp:table:<screenId>`. Pass a stable `columns` array (module constant or useMemo).
 */
export function useTableSettings(screenId: string, columns: readonly ColumnDef[]): TableSettings {
  const enabled = useMediaQuery(TABLE_SETTINGS_MEDIA_QUERY);
  const [stored, setStored] = useState<StoredTableSettings>(() => readTableSettings(screenId, columns));
  const dirty = useRef(false);

  useEffect(() => {
    if (dirty.current) writeTableSettings(screenId, stored);
  }, [screenId, stored]);

  const byId = useMemo(() => new Map(columns.map(column => [column.id, column])), [columns]);

  const update = useCallback((change: (prev: StoredTableSettings) => StoredTableSettings) => {
    dirty.current = true;
    setStored(change);
  }, []);

  const isVisible = useCallback(
    (id: string) => {
      const column = byId.get(id);
      if (!column) return false;
      return !enabled || Boolean(column.required) || !stored.hidden.includes(id);
    },
    [byId, enabled, stored.hidden],
  );

  const visibleColumns = useMemo(() => columns.filter(column => isVisible(column.id)), [columns, isVisible]);

  const toggleColumn = useCallback(
    (id: string) => {
      const column = byId.get(id);
      if (!column || column.required) return;
      update(prev => ({
        ...prev,
        hidden: prev.hidden.includes(id) ? prev.hidden.filter(h => h !== id) : [...prev.hidden, id],
      }));
    },
    [byId, update],
  );

  const widthOf = useCallback(
    (id: string) => {
      if (!enabled) return undefined;
      const column = byId.get(id);
      if (!column) return undefined;
      return stored.widths[id] ?? column.defaultWidth;
    },
    [byId, enabled, stored.widths],
  );

  const setWidth = useCallback(
    (id: string, px: number) => {
      const column = byId.get(id);
      if (!column || column.resizable === false || !Number.isFinite(px)) return;
      const next = clampWidth(column, px);
      update(prev => (prev.widths[id] === next ? prev : { ...prev, widths: { ...prev.widths, [id]: next } }));
    },
    [byId, update],
  );

  const setDensity = useCallback(
    (density: Density) => update(prev => (prev.density === density ? prev : { ...prev, density })),
    [update],
  );

  const reset = useCallback(() => update(prev => ({ ...prev, widths: {}, hidden: [] })), [update]);

  return {
    screenId,
    columns,
    enabled,
    density: enabled ? stored.density : 'comfortable',
    setDensity,
    visibleColumns,
    isVisible,
    hiddenCount: enabled ? stored.hidden.length : 0,
    toggleColumn,
    widthOf,
    setWidth,
    reset,
  };
}
