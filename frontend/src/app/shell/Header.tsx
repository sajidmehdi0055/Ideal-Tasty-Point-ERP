import type { RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { useDevSession, type DevRole } from '../../lib/session';
// DEV-only import, used exclusively inside the `import.meta.env.DEV` branch
// below — keep it that way so this stays tree-shaken out of production.
import { DEV_ROLES } from '../../lib/dev-session';
import { getBreadcrumb } from './breadcrumbs';

interface HeaderProps {
  onOpenNav: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

export function Header({ onOpenNav, triggerRef }: HeaderProps) {
  const location = useLocation();
  const { title, crumbs } = getBreadcrumb(location.pathname);
  const { identity, setRole } = useDevSession();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-canvas px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
          ref={triggerRef}
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="rounded-control p-2 text-ink hover:bg-canvas-muted md:hidden"
        >
          ☰
        </button>
        <div>
          {crumbs.length > 1 ? (
            <p className="text-xs text-ink-muted">{crumbs.slice(0, -1).join(' / ')}</p>
          ) : null}
          <h1 className="text-lg font-semibold text-ink">{title}</h1>
        </div>
      </div>
      {/* Dev-only: there is no login/session system yet (see lib/session.tsx).
          Stripped from production builds — import.meta.env.DEV is inlined at
          build time, so this whole branch is dead code outside dev/test. */}
      {import.meta.env.DEV ? (
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          <span className="hidden sm:inline">Dev identity (placeholder, not real auth)</span>
          <select
            value={identity.role}
            onChange={event => setRole(event.target.value as DevRole)}
            aria-label="Dev identity role — placeholder, not real auth"
            className="rounded-control border border-line bg-canvas px-2 py-1 text-xs text-ink"
          >
            {DEV_ROLES.map(role => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </header>
  );
}
