import { safeStorageGet, safeStorageSet } from '../../lib/safe-storage';
import { clampWidth, type ColumnDef, type Density } from './types';

/**
 * Per-screen table preferences, one localStorage key per screen:
 *   itp-erp:table:<screenId>  →  {"v":1,"density":"compact","widths":{"item":240},"hidden":["reason"]}
 * A UI convenience only (never business data): every read/write is wrapped,
 * and anything unexpected (corrupt JSON, wrong version/types, unknown column
 * ids, a required column marked hidden) is dropped rather than trusted.
 */
export const TABLE_SETTINGS_VERSION = 1;

export function tableSettingsKey(screenId: string): string {
  return `itp-erp:table:${screenId}`;
}

export interface StoredTableSettings {
  density: Density;
  widths: Record<string, number>;
  hidden: string[];
}

export const EMPTY_TABLE_SETTINGS: StoredTableSettings = { density: 'comfortable', widths: {}, hidden: [] };

function getLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Keeps only valid, known values; widths are clamped to each column's min/max. */
export function sanitizeTableSettings(raw: unknown, columns: readonly ColumnDef[]): StoredTableSettings {
  if (!isRecord(raw) || raw.v !== TABLE_SETTINGS_VERSION) return EMPTY_TABLE_SETTINGS;
  const byId = new Map(columns.map(column => [column.id, column]));

  const density: Density = raw.density === 'compact' ? 'compact' : 'comfortable';

  const widths: Record<string, number> = {};
  if (isRecord(raw.widths)) {
    for (const [id, value] of Object.entries(raw.widths)) {
      const column = byId.get(id);
      if (column && column.resizable !== false && typeof value === 'number' && Number.isFinite(value)) {
        widths[id] = clampWidth(column, value);
      }
    }
  }

  const hidden: string[] = [];
  if (Array.isArray(raw.hidden)) {
    for (const id of raw.hidden) {
      const column = typeof id === 'string' ? byId.get(id) : undefined;
      if (column && !column.required && !hidden.includes(column.id)) hidden.push(column.id);
    }
  }

  return { density, widths, hidden };
}

export function readTableSettings(screenId: string, columns: readonly ColumnDef[]): StoredTableSettings {
  const storage = getLocalStorage();
  const text = storage ? safeStorageGet(storage, tableSettingsKey(screenId)) : null;
  if (!text) return EMPTY_TABLE_SETTINGS;
  try {
    return sanitizeTableSettings(JSON.parse(text), columns);
  } catch {
    return EMPTY_TABLE_SETTINGS;
  }
}

export function writeTableSettings(screenId: string, settings: StoredTableSettings): void {
  const storage = getLocalStorage();
  if (!storage) return;
  safeStorageSet(
    storage,
    tableSettingsKey(screenId),
    JSON.stringify({ v: TABLE_SETTINGS_VERSION, ...settings }),
  );
}
