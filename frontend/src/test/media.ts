import { vi } from 'vitest';

export interface MediaState {
  /** `(min-width: 768px)` */
  wide: boolean;
  /** `(hover: hover) and (pointer: fine)` — a mouse/trackpad device */
  hover: boolean;
  /** `(prefers-color-scheme: dark)` */
  dark: boolean;
}

/**
 * Controllable matchMedia stub for the queries the shell and theme use. `set`
 * flips values and fires the 'change' listeners useMediaQuery subscribes to,
 * to simulate crossing a breakpoint or switching device/OS theme mid-test.
 * Unknown queries never match. Undo with vi.unstubAllGlobals().
 */
export function stubMatchMedia(initial: Partial<MediaState> = {}) {
  const state: MediaState = { wide: false, hover: false, dark: false, ...initial };
  const listeners = new Set<() => void>();
  const evaluate = (query: string) => {
    if (query.includes('min-width: 768px')) return state.wide;
    if (query.includes('hover: hover')) return state.hover;
    if (query.includes('prefers-color-scheme: dark')) return state.dark;
    return false;
  };
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        get matches() {
          return evaluate(query);
        },
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: (_type: string, listener: () => void) => {
          listeners.add(listener);
        },
        removeEventListener: (_type: string, listener: () => void) => {
          listeners.delete(listener);
        },
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
  return {
    set(next: Partial<MediaState>) {
      Object.assign(state, next);
      listeners.forEach(listener => listener());
    },
  };
}
