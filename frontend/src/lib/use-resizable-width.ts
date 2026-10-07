import { useCallback, useState } from 'react';
import { safeStorageGet, safeStorageSet } from './safe-storage';

/**
 * A width (px) the user can change, clamped to [min, max] and remembered per
 * device in localStorage. A UI convenience only: an unreadable, corrupt or
 * out-of-range stored value falls back to (or is clamped into) the range, and
 * storage failures are silent.
 */
export interface ResizableWidthOptions {
  storageKey: string;
  min: number;
  max: number;
  defaultWidth: number;
}

export interface ResizableWidth {
  width: number;
  /** Update the width (clamped) without saving — use while dragging. */
  preview: (width: number) => void;
  /** Update the width (clamped) and save it. */
  commit: (width: number) => void;
  /** Back to the default width; the saved value is replaced by it. */
  reset: () => void;
}

export function clampWidth(width: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(width)));
}

function getLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredWidth({ storageKey, min, max, defaultWidth }: ResizableWidthOptions): number {
  const fallback = clampWidth(defaultWidth, min, max);
  const storage = getLocalStorage();
  const raw = storage ? safeStorageGet(storage, storageKey) : null;
  if (raw === null || !/^\d{1,5}$/.test(raw.trim())) return fallback;
  return clampWidth(Number(raw), min, max);
}

function saveWidth(storageKey: string, width: number) {
  const storage = getLocalStorage();
  if (storage) safeStorageSet(storage, storageKey, String(width));
}

export function useResizableWidth(options: ResizableWidthOptions): ResizableWidth {
  const { storageKey, min, max, defaultWidth } = options;
  const [width, setWidth] = useState(() => readStoredWidth(options));

  const preview = useCallback((next: number) => setWidth(clampWidth(next, min, max)), [min, max]);
  const commit = useCallback(
    (next: number) => {
      const clamped = clampWidth(next, min, max);
      setWidth(clamped);
      saveWidth(storageKey, clamped);
    },
    [storageKey, min, max],
  );
  const reset = useCallback(() => commit(defaultWidth), [commit, defaultWidth]);

  return { width, preview, commit, reset };
}
