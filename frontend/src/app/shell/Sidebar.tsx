import { NavLink } from 'react-router-dom';
import { StatusBadge } from '../../design-system/components';
import { NAV_ITEMS } from './nav-items';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
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
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-line bg-canvas transition-transform duration-200 md:static md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center border-b border-line px-5">
          <span className="text-base font-semibold text-ink">Ideal Tasty Point</span>
        </div>
        <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
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
