import { useCallback, useEffect, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import { SidebarPanel, SidebarRail } from './Sidebar';
import { Header } from './Header';
import { useCollapsedGroups, useSidebarPinned } from './sidebar-prefs';
import { useMediaQuery } from '../../lib/use-media-query';

/** Hover must rest this long on the rail before the peek opens (avoids accidental opens). */
export const PEEK_OPEN_DELAY_MS = 150;
/** Grace period after the pointer leaves before the peek closes. */
export const PEEK_CLOSE_DELAY_MS = 300;

/**
 * ERP Shell v2 (owner-approved 2026-09-27). Behaviour is chosen by input
 * type, not only by width:
 *  - < 768px (mobile): no rail; the header's menu button opens a modal drawer.
 *  - ≥ 768px: an icons-only rail by default, or the full sidebar if the user
 *    pinned it (remembered per device).
 *      · Mouse/trackpad (`hover: hover` + `pointer: fine`): resting on the rail
 *        opens a non-modal "peek" over the content; leaving closes it.
 *        Keyboard focus on a rail link opens it too. The rail's bottom button
 *        pins the sidebar.
 *      · Touch (no hover): the rail's bottom button opens the peek as a modal
 *        overlay with a scrim; tapping the scrim, a link or Esc closes it.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const isWide = useMediaQuery('(min-width: 768px)');
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)');
  const [pinned, setPinned] = useSidebarPinned();
  const [collapsedGroups, toggleGroup] = useCollapsedGroups();
  const [peekOpen, setPeekOpen] = useState(false);
  const [peekFocusIndex, setPeekFocusIndex] = useState<number | undefined>(undefined);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navTriggerRef = useRef<HTMLButtonElement>(null);
  const railExpandRef = useRef<HTMLButtonElement>(null);
  const drawerFirstLinkRef = useRef<HTMLAnchorElement>(null);
  const wasDrawerOpenRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const hoveringRef = useRef(false);
  const pointerDownRef = useRef(false);
  const peekRef = useRef<HTMLDivElement>(null);

  // Crossing the breakpoint resets whichever overlay belongs to the other
  // layout, so it doesn't reappear open later. Adjusted during render
  // (React's documented pattern for resetting state on a derived-value
  // change) rather than in an effect, so there is no extra commit.
  // Switching between mouse and touch (e.g. a detachable tablet) also drops
  // an open peek, since it would change between non-modal and modal.
  const [prevLayout, setPrevLayout] = useState({ isWide, canHover });
  if (isWide !== prevLayout.isWide || canHover !== prevLayout.canHover) {
    setPrevLayout({ isWide, canHover });
    setPeekOpen(false);
    if (isWide) setDrawerOpen(false);
  }

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  useEffect(() => clearTimer, [clearTimer]);
  // A hover timer started before a breakpoint/input change must not fire
  // afterwards and re-open the peek in the new layout.
  useEffect(() => {
    clearTimer();
  }, [isWide, canHover, clearTimer]);

  const showPeek = isWide && !pinned && peekOpen;
  const peekIsModal = showPeek && !canHover;
  const drawerIsOpen = !isWide && drawerOpen;

  const openPeek = useCallback(
    (focusIndex?: number) => {
      clearTimer();
      setPeekFocusIndex(focusIndex);
      setPeekOpen(true);
    },
    [clearTimer],
  );
  const closePeek = useCallback(() => {
    clearTimer();
    setPeekOpen(false);
  }, [clearTimer]);

  // Return focus to the menu button after the mobile drawer closes. Runs in
  // an effect (after the DOM commit removed `inert` from the content) because
  // focus() inside an inert subtree is a no-op. Skipped when the close was
  // the widen-to-desktop auto-close: the menu button no longer exists there.
  useEffect(() => {
    if (wasDrawerOpenRef.current && !drawerOpen && !isWide) navTriggerRef.current?.focus();
    wasDrawerOpenRef.current = drawerOpen;
  }, [drawerOpen, isWide]);

  // Move focus into the drawer when it opens, so keyboard/screen-reader
  // users land inside it instead of on the now-inert menu button.
  useEffect(() => {
    if (drawerIsOpen) drawerFirstLinkRef.current?.focus();
  }, [drawerIsOpen]);

  // Escape closes the drawer or the peek.
  useEffect(() => {
    if (!drawerIsOpen && !showPeek) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (drawerIsOpen) {
        setDrawerOpen(false);
        return;
      }
      // A non-modal (hover) peek may be open while the user works in the
      // content; Esc there belongs to the content, not to the sidebar.
      const focusInPeek = peekRef.current?.contains(document.activeElement) ?? false;
      if (!peekIsModal && !focusInPeek) return;
      clearTimer();
      setPeekOpen(false);
      // Keep keyboard users on the rail instead of dropping focus to <body>
      // when the peek (which held focus) unmounts.
      window.setTimeout(() => railExpandRef.current?.focus(), 0);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [drawerIsOpen, showPeek, peekIsModal, clearTimer]);

  const hoverPeekEnabled = isWide && canHover && !pinned;

  function handleMouseEnter() {
    hoveringRef.current = true;
    if (!hoverPeekEnabled) return;
    clearTimer();
    if (!peekOpen) {
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setPeekFocusIndex(undefined);
        setPeekOpen(true);
      }, PEEK_OPEN_DELAY_MS);
    }
  }

  function handleMouseLeave() {
    hoveringRef.current = false;
    if (!hoverPeekEnabled) return;
    clearTimer();
    if (peekOpen) {
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setPeekOpen(false);
      }, PEEK_CLOSE_DELAY_MS);
    }
  }

  function handleRailLinkFocus(index: number) {
    if (!hoverPeekEnabled) return;
    if (pointerDownRef.current) return;
    openPeek(index);
  }

  function handleRegionBlur(event: FocusEvent<HTMLElement>) {
    if (!hoverPeekEnabled || !peekOpen) return;
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    if (hoveringRef.current) return;
    closePeek();
  }

  // Pinning/collapsing swaps the rail region in or out from under the
  // pointer without a mouseleave, so the hover flag must be reset by hand.
  function pin() {
    hoveringRef.current = false;
    setPinned(true);
    closePeek();
  }

  function collapse() {
    hoveringRef.current = false;
    setPinned(false);
  }

  function closeModalPeekFromScrim() {
    closePeek();
    window.setTimeout(() => railExpandRef.current?.focus(), 0);
  }

  function handleRailExpand() {
    if (canHover) {
      pin();
    } else {
      openPeek(0);
    }
  }

  const contentInert = drawerIsOpen || peekIsModal;

  return (
    <div className="flex min-h-screen bg-canvas-muted">
      {isWide && pinned ? (
        <aside className="sticky top-0 h-screen shrink-0">
          <SidebarPanel
            variant="pinned"
            navLabel="Primary"
            collapsedGroups={collapsedGroups}
            onToggleGroup={toggleGroup}
            onCollapse={collapse}
          />
        </aside>
      ) : null}

      {isWide && !pinned ? (
        <aside
          className="sticky top-0 z-40 h-screen shrink-0"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onPointerDown={() => {
            pointerDownRef.current = true;
            window.setTimeout(() => {
              pointerDownRef.current = false;
            }, 0);
          }}
          onBlur={handleRegionBlur}
        >
          <div className="h-full" inert={showPeek}>
            <SidebarRail
              onExpand={handleRailExpand}
              expandLabel={canHover ? 'Pin sidebar' : 'Expand navigation'}
              expandRef={railExpandRef}
              onLinkFocus={handleRailLinkFocus}
            />
          </div>
          {showPeek ? (
            <div
              ref={peekRef}
              className="fixed inset-y-0 left-0 z-40 shadow-peek"
              role={peekIsModal ? 'dialog' : undefined}
              aria-modal={peekIsModal ? true : undefined}
              aria-label={peekIsModal ? 'Primary navigation' : undefined}
              data-testid="sidebar-peek"
            >
              <SidebarPanel
                variant="peek"
                navLabel="Primary (expanded)"
                collapsedGroups={collapsedGroups}
                onToggleGroup={toggleGroup}
                onNavigate={peekIsModal ? closePeek : undefined}
                onPin={pin}
                autoFocusIndex={peekIsModal ? 0 : peekFocusIndex}
              />
            </div>
          ) : null}
        </aside>
      ) : null}

      {!isWide ? (
        <aside
          inert={!drawerOpen}
          role="dialog"
          aria-modal={drawerOpen}
          aria-label="Primary navigation"
          className={`fixed inset-y-0 left-0 z-40 transition-transform duration-200 ${
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <SidebarPanel
            variant="drawer"
            navLabel="Primary"
            collapsedGroups={collapsedGroups}
            onToggleGroup={toggleGroup}
            onNavigate={() => setDrawerOpen(false)}
            onClose={() => setDrawerOpen(false)}
            firstLinkRef={drawerFirstLinkRef}
          />
        </aside>
      ) : null}

      {drawerIsOpen || peekIsModal ? (
        // Pointer-only dismiss target; keyboard users close with Esc or the close/link controls.
        <div
          aria-hidden="true"
          data-testid="sidebar-scrim"
          className="fixed inset-0 z-30 bg-overlay"
          onClick={() => (drawerIsOpen ? setDrawerOpen(false) : closeModalPeekFromScrim())}
        />
      ) : null}

      {/* Inert while a modal overlay is open, so Tab/Shift+Tab can't reach it. */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col" inert={contentInert} data-testid="shell-content">
        <Header showMenuButton={!isWide} onOpenNav={() => setDrawerOpen(true)} triggerRef={navTriggerRef} />
        <main className="flex-1 p-4 md:p-6">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
