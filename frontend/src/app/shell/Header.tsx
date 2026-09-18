import { useLocation } from 'react-router-dom';
import { DEV_ROLES, useDevSession, type DevRole } from '../../lib/session';
import { getBreadcrumb } from './breadcrumbs';

interface HeaderProps {
  onOpenNav: () => void;
}

export function Header({ onOpenNav }: HeaderProps) {
  const location = useLocation();
  const { title, crumbs } = getBreadcrumb(location.pathname);
  const { identity, setRole } = useDevSession();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-canvas px-4 md:px-6">
      <div className="flex items-center gap-3">
        <button
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
    </header>
  );
}
