import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useMediaQuery } from '../../lib/use-media-query';

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const navTriggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  // Reset the mobile drawer's open state once the viewport reaches desktop
  // width, so narrowing back to mobile later doesn't reveal a drawer that
  // was left open from a previous mobile session. Adjusted during render
  // (React's documented pattern for resetting state from a prop/derived
  // value change) rather than in an effect, so there is no extra commit.
  const [prevIsDesktop, setPrevIsDesktop] = useState(isDesktop);
  if (isDesktop !== prevIsDesktop) {
    setPrevIsDesktop(isDesktop);
    if (isDesktop) setMobileNavOpen(false);
  }

  // Return focus to the trigger after the drawer closes. This runs in an
  // effect (after React commits the DOM update) rather than inline in
  // closeMobileNav, because the trigger's ancestor is still `inert` at the
  // moment closeMobileNav runs — focus() on an inert subtree is a no-op.
  useEffect(() => {
    if (wasOpenRef.current && !mobileNavOpen) navTriggerRef.current?.focus();
    wasOpenRef.current = mobileNavOpen;
  }, [mobileNavOpen]);

  function closeMobileNav() {
    setMobileNavOpen(false);
  }

  return (
    <div className="flex min-h-screen bg-canvas-muted">
      <Sidebar open={mobileNavOpen} onClose={closeMobileNav} isDesktop={isDesktop} />
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
