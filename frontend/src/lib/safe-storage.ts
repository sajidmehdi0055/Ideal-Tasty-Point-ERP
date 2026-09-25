// Web Storage (localStorage/sessionStorage) can throw on read or write —
// quota exceeded, private browsing, or storage disabled entirely. These
// wrappers make that failure mode a silent no-op everywhere storage is used,
// since none of it holds data more important than a UI convenience.

export function safeStorageGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function safeStorageSet(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Best-effort only.
  }
}
