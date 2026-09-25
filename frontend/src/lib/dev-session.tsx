import { useMemo, useState, type ReactNode } from 'react';
import { DevSessionContext, type DevIdentity, type DevRole } from './session';
import { safeStorageGet, safeStorageSet } from './safe-storage';

/**
 * DEV-ONLY. Imported exclusively from session.tsx's `DevSessionProvider`,
 * inside an `import.meta.env.DEV` branch — never import this file from
 * anywhere else, or its strings (storage key, default identity, role list)
 * will leak into the production bundle again.
 */
export const DEV_ROLES: DevRole[] = ['OWNER', 'MANAGER', 'STORE_KEEPER', 'STAFF'];

export const DEV_IDENTITY_STORAGE_KEY = 'itp-erp:dev-identity';
const STORAGE_KEY = DEV_IDENTITY_STORAGE_KEY;

const DEFAULT_IDENTITY: DevIdentity = { userId: 'dev-owner', role: 'OWNER', branchId: 'branch-main' };

function isDevRole(value: unknown): value is DevRole {
  return typeof value === 'string' && (DEV_ROLES as string[]).includes(value);
}

function loadStoredIdentity(): DevIdentity {
  const raw = safeStorageGet(window.localStorage, STORAGE_KEY);
  if (!raw) return DEFAULT_IDENTITY;
  try {
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

export function DevSessionProviderImpl({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<DevIdentity>(loadStoredIdentity);

  const setRole = (role: DevRole) => {
    setIdentity(current => {
      const next = { ...current, role };
      safeStorageSet(window.localStorage, STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const value = useMemo(
    () => ({ identity, setRole, canEditItems: identity.role === 'OWNER' || identity.role === 'MANAGER' }),
    [identity],
  );

  return <DevSessionContext.Provider value={value}>{children}</DevSessionContext.Provider>;
}
