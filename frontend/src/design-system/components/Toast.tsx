import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckIcon, CircleAlertIcon, XIcon } from '../icons';

/*
 * Toasts (Direction A Figma: Toast/Success 134:15074, Toast/Error 134:15086).
 * Success: bottom-right, 380px, hides after 5s; the timer pauses while the
 * toast is hovered or has keyboard focus and restarts (5s) when left.
 * Error: stays until the user closes it. Title = what happened; detail = the
 * record and the change in plain words (callers never pass codes or SQL).
 */

export const TOAST_SUCCESS_TIMEOUT_MS = 5000;

export interface ToastInput {
  title: string;
  detail?: ReactNode;
}

export interface ToastApi {
  /** Shows a success toast; returns its id. */
  success: (toast: ToastInput) => string;
  /** Shows an error toast that stays until closed; returns its id. */
  error: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
}

interface ToastRecord extends ToastInput {
  id: string;
  kind: 'success' | 'error';
}

const ToastContext = createContext<ToastApi | null>(null);

let warnedMissingProvider = false;
const noopApi: ToastApi = {
  success: () => {
    warnMissingProvider();
    return '';
  },
  error: () => {
    warnMissingProvider();
    return '';
  },
  dismiss: () => {},
};
function warnMissingProvider() {
  if (import.meta.env.DEV && !warnedMissingProvider) {
    warnedMissingProvider = true;
    console.warn('useToast: no <ToastProvider> above this component, so the toast was not shown.');
  }
}

/**
 * Show success/error feedback from any screen. Outside a ToastProvider (e.g.
 * a screen rendered alone in a unit test) it is a no-op — with one dev-mode
 * console warning — so a missing toast never breaks the screen itself.
 */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? noopApi;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const api = useMemo<ToastApi>(() => {
    const add = (kind: ToastRecord['kind'], input: ToastInput) => {
      nextId.current += 1;
      const id = `toast-${nextId.current}`;
      setToasts(current => [...current, { ...input, id, kind }]);
      return id;
    };
    return {
      success: input => add('success', input),
      error: input => add('error', input),
      dismiss,
    };
  }, [dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:w-[380px]">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastRecord; onDismiss: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const isSuccess = toast.kind === 'success';
  const paused = hovered || focused;

  useEffect(() => {
    if (!isSuccess || paused) return;
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_SUCCESS_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isSuccess, paused, onDismiss, toast.id]);

  return (
    <div
      role={isSuccess ? 'status' : 'alert'}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
      className="pointer-events-auto flex items-start gap-3 rounded-card border border-line bg-canvas p-3.5 shadow-modal"
    >
      <span
        aria-hidden="true"
        className={`flex shrink-0 rounded-full p-1.5 ${isSuccess ? 'bg-success-50 text-success-600' : 'bg-danger-50 text-danger-600'}`}
      >
        {isSuccess ? <CheckIcon className="h-4 w-4" /> : <CircleAlertIcon className="h-4 w-4" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm font-bold text-ink">{toast.title}</p>
        {toast.detail ? <p className="text-[12.5px] font-medium text-ink-muted">{toast.detail}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 rounded-control p-0.5 text-ink-muted hover:bg-canvas-hover hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
