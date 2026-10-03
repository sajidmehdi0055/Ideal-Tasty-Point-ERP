import { useCallback, useState } from 'react';
import { safeStorageGet, safeStorageSet } from '../../lib/safe-storage';

/**
 * Per-device UI preferences for the ERP Shell v2 sidebar. These are
 * conveniences only (never business data), so storage failures are silent
 * and fall back to the defaults: rail collapsed, every group expanded.
 */
export const SIDEBAR_PINNED_KEY = 'itp-erp:sidebar-pinned';
export const SIDEBAR_COLLAPSED_GROUPS_KEY = 'itp-erp:sidebar-collapsed-groups';

function getLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readPinned(): boolean {
  const storage = getLocalStorage();
  return storage ? safeStorageGet(storage, SIDEBAR_PINNED_KEY) === 'true' : false;
}

function readCollapsedGroups(): string[] {
  const storage = getLocalStorage();
  const raw = storage ? safeStorageGet(storage, SIDEBAR_COLLAPSED_GROUPS_KEY) : null;
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

export function useSidebarPinned(): [boolean, (pinned: boolean) => void] {
  const [pinned, setPinnedState] = useState(readPinned);
  const setPinned = useCallback((next: boolean) => {
    const storage = getLocalStorage();
    if (storage) safeStorageSet(storage, SIDEBAR_PINNED_KEY, String(next));
    setPinnedState(next);
  }, []);
  return [pinned, setPinned];
}

export function useCollapsedGroups(): [ReadonlySet<string>, (group: string) => void] {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set(readCollapsedGroups()));
  const toggle = useCallback((group: string) => {
    setCollapsed(previous => {
      const next = new Set(previous);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      const storage = getLocalStorage();
      if (storage) safeStorageSet(storage, SIDEBAR_COLLAPSED_GROUPS_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);
  return [collapsed, toggle];
}
