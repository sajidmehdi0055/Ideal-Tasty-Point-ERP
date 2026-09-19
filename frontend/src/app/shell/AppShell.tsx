import { useRef, useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useMediaQuery } from '../../lib/use-media-query';

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const navTriggerRef = useRef<HTMLButtonElement>(null);

  function closeMobileNav() {
    setMobileNavOpen(false);
    // Return focus to the trigger; it was the last interactive element the
    // keyboard user had control of before the overlay took over.
    navTriggerRef.current?.focus();
  }

  return (
    <div className="flex min-h-screen bg-canvas-muted">
      <Sidebar open={mobileNavOpen} onClose={closeMobileNav} />
      {/* Inert while the mobile drawer is open so it acts as a true modal
          overlay: Tab/Shift+Tab can't reach header/content behind it. */}
      <div className="flex min-h-screen flex-1 flex-col" inert={!isDesktop && mobileNavOpen}>
        <Header onOpenNav={() => setMobileNavOpen(true)} triggerRef={navTriggerRef} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
