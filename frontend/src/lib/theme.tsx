import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { safeStorageGet, safeStorageSet } from './safe-storage';
import { useMediaQuery } from './use-media-query';

/**
 * Light/Dark theme (ERP Shell v2, owner-approved 2026-09-27).
 *
 * Default follows the device (`prefers-color-scheme`). Choosing a theme in the
 * header toggle overrides that and is remembered in localStorage on this
 * device. The chosen theme is written to `<html data-theme>`, which the
 * tokens in styles/index.css key off. index.html runs the same logic inline
 * before first paint so Dark mode does not flash Light while React loads —
 * keep the storage key and values in sync with it.
 */
export type ThemeName = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'itp-erp:theme';

function getLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredTheme(): ThemeName | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  const value = safeStorageGet(storage, THEME_STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : null;
}

export function applyTheme(theme: ThemeName): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<ThemeName | null>(readStoredTheme);
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const theme: ThemeName = stored ?? (systemDark ? 'dark' : 'light');

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: ThemeName) => {
    const storage = getLocalStorage();
    if (storage) safeStorageSet(storage, THEME_STORAGE_KEY, next);
    setStored(next);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
