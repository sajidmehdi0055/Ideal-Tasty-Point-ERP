import type { RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { useDevSession, type DevRole } from '../../lib/session';
// DEV-only import, used exclusively inside the `import.meta.env.DEV` branch
// below — keep it that way so this stays tree-shaken out of production.
import { DEV_ROLES } from '../../lib/dev-session';
import { Tooltip } from '../../design-system/components/Tooltip';
import { ChevronRightIcon, MenuIcon } from '../../design-system/icons';
import { getBreadcrumb } from './breadcrumbs';
import { ThemeToggle } from './ThemeToggle';
import { AskAiButton } from '../../features/ai-assistant';

interface HeaderProps {
  /** Mobile layout only: the button that opens the navigation drawer. */
  showMenuButton: boolean;
  onOpenNav: () => void;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}

/**
 * ERP Shell v2 header. The approved Figma also shows a branch switcher and a
 * user menu; both are intentionally NOT rendered yet because the backend has
 * no real session/auth or branch-name endpoint (see lib/session.tsx) — the UI
 * must not invent them. Until then the DEV-only identity switch stays here.
 * UI-AI-002: the "Ask AI" button sits where the design puts it (left of the
 * branch switcher), i.e. first in the right-hand group; it renders nothing
 * unless GET /api/ai/status allows it.
 */
export function Header({ showMenuButton, onOpenNav, triggerRef }: HeaderProps) {
  const location = useLocation();
  const { title, crumbs } = getBreadcrumb(location.pathname);
  const { identity, setRole } = useDevSession();

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b border-line bg-canvas px-2 md:gap-4 md:px-gutter">
      {showMenuButton ? (
        <Tooltip content="Open navigation" side="bottom" describe={false}>
          <button
            ref={triggerRef}
            type="button"
            onClick={onOpenNav}
            aria-label="Open navigation"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-ink hover:bg-canvas-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
        </Tooltip>
      ) : null}
      <div className="min-w-0 flex-1">
        {crumbs.length > 1 ? (
          <nav aria-label="Breadcrumb" className="hidden md:block">
            <ol className="flex items-center gap-1 text-xs font-medium text-ink-muted">
              {crumbs.slice(0, -1).map(crumb => (
                <li key={crumb} className="flex items-center gap-1">
                  {crumb}
                  <ChevronRightIcon className="h-3 w-3" />
                </li>
              ))}
              <li aria-current="page" className="text-ink-secondary">
                {crumbs[crumbs.length - 1]}
              </li>
            </ol>
          </nav>
        ) : null}
        {/* UI-REFRESH-001 (Direction A): 20px / 800 title on tablet and desktop. */}
        <h1 className="truncate text-base font-extrabold leading-tight tracking-tight text-ink md:text-[20px]">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2 md:gap-3">
        <AskAiButton />
        <ThemeToggle />
        {/* Dev-only: there is no login/session system yet (see lib/session.tsx).
            Stripped from production builds — import.meta.env.DEV is inlined at
            build time, so this whole branch is dead code outside dev/test. */}
        {import.meta.env.DEV ? (
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <span className="hidden lg:inline">Dev identity (placeholder, not real auth)</span>
            <select
              value={identity.role}
              onChange={event => setRole(event.target.value as DevRole)}
              aria-label="Dev identity role — placeholder, not real auth"
              className="h-8 rounded-control border border-line bg-canvas px-2 text-xs text-ink"
            >
              {DEV_ROLES.map(role => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </header>
  );
}
