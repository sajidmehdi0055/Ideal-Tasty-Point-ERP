import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { NAV_SECTIONS } from './nav-items';

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
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-[#1e293b] transition-transform duration-200 md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-[#334155] px-5">
          <span aria-hidden="true" className="h-[30px] w-[30px] shrink-0 rounded-lg bg-[#334155]" />
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-[#e2e8f0]">Ideal Tasty Point</span>
            <span className="text-[10px] font-medium text-[#94a3b8]">ERP</span>
          </span>
        </div>
        <nav aria-label="Primary" className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
          {NAV_SECTIONS.map((section, sectionIndex) => (
            <div key={section.label} className="flex flex-col gap-1">
              <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">
                {section.label}
              </p>
              {section.items.map((item, itemIndex) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    ref={sectionIndex === 0 && itemIndex === 0 ? firstLinkRef : undefined}
                    to={item.to}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `flex items-center justify-between rounded-control border-l-2 px-3 py-2 text-[13px] font-medium transition-colors ${
                        isActive
                          ? 'border-[#94a3b8] bg-[#94a3b8]/[.12] text-[#e2e8f0]'
                          : 'border-transparent text-[#94a3b8] hover:bg-[#94a3b8]/[.08] hover:text-[#e2e8f0]'
                      }`
                    }
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </span>
                    {item.pending ? (
                      <span className="rounded-full bg-[#f59e0b]/[.16] px-2 py-0.5 text-[10px] font-medium text-[#fcd34d]">
                        Pending
                      </span>
                    ) : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
