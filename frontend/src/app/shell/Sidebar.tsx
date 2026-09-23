import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { StatusBadge } from '../../design-system/components';
import { NAV_ITEMS } from './nav-items';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  isDesktop: boolean;
}

export function Sidebar({ open, onClose, isDesktop }: SidebarProps) {
  const isMobileOverlay = !isDesktop;
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Move focus into the drawer when it opens as a mobile overlay, so
  // keyboard/screen-reader users land inside it instead of on the now-inert
  // trigger button.
  useEffect(() => {
    if (isMobileOverlay && open) firstLinkRef.current?.focus();
  }, [isMobileOverlay, open]);

  // Escape closes the mobile overlay. The background is made `inert` by
  // AppShell while open, so Tab/Shift+Tab already can't reach it — no
  // separate focus trap is needed. Reads onClose via a ref so the listener
  // is only added/removed on real open/close transitions, not on every
  // parent re-render (AppShell re-renders on every route change).
  useEffect(() => {
    if (!isMobileOverlay || !open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMobileOverlay, open]);

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
        />
      ) : null}
      <aside
        inert={isMobileOverlay && !open}
        role={isMobileOverlay ? 'dialog' : undefined}
        aria-modal={isMobileOverlay ? open : undefined}
        aria-label={isMobileOverlay ? 'Primary navigation' : undefined}
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-line bg-canvas transition-transform duration-200 md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center border-b border-line px-5">
          <span className="text-base font-semibold text-ink">Ideal Tasty Point</span>
        </div>
        <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {NAV_ITEMS.map((item, index) => (
            <NavLink
              key={item.to}
              ref={index === 0 ? firstLinkRef : undefined}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center justify-between rounded-control px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-primary-50 text-primary-700' : 'text-ink hover:bg-canvas-muted'
                }`
              }
            >
              <span>{item.label}</span>
              {item.pending ? <StatusBadge label="Pending" tone="warning" /> : null}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
