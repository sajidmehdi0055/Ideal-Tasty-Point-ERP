import { createContext, useContext, type ReactNode } from 'react';
import { DevSessionProviderImpl } from './dev-session';

/**
 * There is no login/session system yet (see backend/README.md: the
 * standalone server "intentionally denies mutations with 401 until a
 * trusted AuthContext provider is composed"). `DevSessionProvider` below
 * picks a DEV-only implementation with a switchable identity (for
 * exercising INV-11 permission-sensitive UI) or a trivial always-denied
 * production implementation, decided at build time via `import.meta.env.DEV`
 * — not just a runtime flag. This file is the only one production code
 * imports; the real dev machinery (localStorage-backed identity, role
 * list, defaults) lives in dev-session.tsx and is referenced only inside
 * the dead-in-production branch below, so Rollup tree-shakes the whole
 * module out of a production build. Verify with:
 *   npm run build && grep -r "itp-erp:dev-identity" dist/
 * which must find nothing.
 */
export type DevRole = 'OWNER' | 'MANAGER' | 'STORE_KEEPER' | 'STAFF';

export interface DevIdentity {
  userId: string;
  role: DevRole;
  branchId: string;
}

export interface DevSessionContextValue {
  identity: DevIdentity;
  setRole: (role: DevRole) => void;
  canEditItems: boolean;
}

export const DevSessionContext = createContext<DevSessionContextValue | null>(null);

const PROD_IDENTITY: DevIdentity = { userId: '', role: 'STAFF', branchId: '' };

/** No dev tooling, no storage, no switchable role — permission is a hardcoded false. */
function ProdSessionProvider({ children }: { children: ReactNode }) {
  const value: DevSessionContextValue = { identity: PROD_IDENTITY, setRole: () => {}, canEditItems: false };
  return <DevSessionContext.Provider value={value}>{children}</DevSessionContext.Provider>;
}

export function DevSessionProvider({ children }: { children: ReactNode }) {
  if (import.meta.env.DEV) {
    return <DevSessionProviderImpl>{children}</DevSessionProviderImpl>;
  }
  return <ProdSessionProvider>{children}</ProdSessionProvider>;
}

export function useDevSession(): DevSessionContextValue {
  const context = useContext(DevSessionContext);
  if (!context) throw new Error('useDevSession must be used within DevSessionProvider');
  return context;
}
