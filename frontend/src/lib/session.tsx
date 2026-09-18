import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * DEV-ONLY PLACEHOLDER. There is no login/session system yet (see
 * backend/README.md: the standalone server "intentionally denies mutations
 * with 401 until a trusted AuthContext provider is composed"). Switching
 * the role here changes ONLY what this frontend renders (to exercise
 * INV-11 permission-sensitive UI); it is never sent to, and has no effect
 * on, the real backend, which enforces its own 401/403 independently.
 */
export type DevRole = 'OWNER' | 'MANAGER' | 'STORE_KEEPER' | 'STAFF';

export const DEV_ROLES: DevRole[] = ['OWNER', 'MANAGER', 'STORE_KEEPER', 'STAFF'];

export interface DevIdentity {
  userId: string;
  role: DevRole;
  branchId: string;
}

export const DEV_IDENTITY_STORAGE_KEY = 'itp-erp:dev-identity';
const STORAGE_KEY = DEV_IDENTITY_STORAGE_KEY;

const DEFAULT_IDENTITY: DevIdentity = { userId: 'dev-owner', role: 'OWNER', branchId: 'branch-main' };

function isDevRole(value: unknown): value is DevRole {
  return typeof value === 'string' && (DEV_ROLES as string[]).includes(value);
}

function loadStoredIdentity(): DevIdentity {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_IDENTITY;
    const parsed = JSON.parse(raw) as Partial<DevIdentity>;
    if (!isDevRole(parsed.role)) return DEFAULT_IDENTITY;
    return {
      userId: parsed.userId || DEFAULT_IDENTITY.userId,
      role: parsed.role,
      branchId: parsed.branchId || DEFAULT_IDENTITY.branchId,
    };
  } catch {
    return DEFAULT_IDENTITY;
  }
}

interface DevSessionContextValue {
  identity: DevIdentity;
  setRole: (role: DevRole) => void;
  canEditItems: boolean;
}

const DevSessionContext = createContext<DevSessionContextValue | null>(null);

export function DevSessionProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<DevIdentity>(loadStoredIdentity);

  const setRole = (role: DevRole) => {
    setIdentity(current => {
      const next = { ...current, role };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Best-effort only; this identity is a UI convenience, not security state.
      }
      return next;
    });
  };

  const value = useMemo<DevSessionContextValue>(
    () => ({ identity, setRole, canEditItems: identity.role === 'OWNER' || identity.role === 'MANAGER' }),
    [identity],
  );

  return <DevSessionContext.Provider value={value}>{children}</DevSessionContext.Provider>;
}

export function useDevSession(): DevSessionContextValue {
  const context = useContext(DevSessionContext);
  if (!context) throw new Error('useDevSession must be used within DevSessionProvider');
  return context;
}
