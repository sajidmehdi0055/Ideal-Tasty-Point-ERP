import { safeStorageGet, safeStorageSet } from '../../lib/safe-storage';
import type { Item } from './types';

/**
 * Stable `main` has no GET/list (or get-by-id) endpoint for items — only
 * POST and PATCH (docs/engineering/inventory-s01-implementation.md). This
 * cache holds the real Item records returned by those two calls in the
 * current browser tab so the list/edit screens have real data to show
 * instead of going blank. It is not a substitute for a backend list
 * endpoint and is never presented as anything but "created this session."
 */
const STORAGE_KEY = 'itp-erp:session-items';

function read(): Item[] {
  const raw = safeStorageGet(window.sessionStorage, STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Item[];
  } catch {
    return [];
  }
}

function write(items: Item[]) {
  safeStorageSet(window.sessionStorage, STORAGE_KEY, JSON.stringify(items));
}

export const sessionItemCache = {
  all(): Item[] {
    return read();
  },
  findById(id: string): Item | undefined {
    return read().find(item => item.id === id);
  },
  upsert(item: Item): void {
    const items = read();
    const index = items.findIndex(existing => existing.id === item.id);
    if (index === -1) items.unshift(item);
    else items[index] = item;
    write(items);
  },
};
