import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../AppShell';
import { DevSessionProvider } from '../../../lib/session';

/**
 * A controllable matchMedia mock: lets a test flip `matches` and fire the
 * 'change' event useMediaQuery listens for, to simulate the viewport
 * crossing the `(min-width: 768px)` breakpoint mid-test.
 */
function stubMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<() => void>();
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        get matches() {
          return matches;
        },
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: (_type: string, listener: () => void) => {
          listeners.add(listener);
        },
        removeEventListener: (_type: string, listener: () => void) => {
          listeners.delete(listener);
        },
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
  return {
    setMatches(next: boolean) {
      matches = next;
      listeners.forEach(listener => listener());
    },
  };
}

describe('AppShell', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // The drawer <aside> keeps role="dialog"/aria-label on mobile regardless
  // of open/closed state (only `inert` and `aria-modal` toggle with it — see
  // Sidebar.tsx), so assertions below check `inert`/`aria-modal`, not
  // role/name presence, to actually distinguish open from closed.

  it('returns focus to the nav trigger only after its container is no longer inert', async () => {
    // jsdom does not enforce inert's browser behavior of blocking .focus()
    // on a descendant of an inert element, so a plain "trigger has focus"
    // assertion would pass even against the pre-fix code (calling .focus()
    // synchronously before the DOM commit removed `inert`). This test
    // instead spies on the real ordering: it records whether the content
    // wrapper still has `inert` at the exact moment .focus() is invoked.
    stubMatchMedia(false);
    render(
      <MemoryRouter initialEntries={['/items']}>
        <DevSessionProvider>
          <AppShell>content</AppShell>
        </DevSessionProvider>
      </MemoryRouter>,
    );
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    const contentWrapper = trigger.closest('div.flex-1.flex-col')!;
    const aside = screen.getByRole('navigation', { name: 'Primary', hidden: true }).closest('aside')!;

    await userEvent.click(trigger);
    expect(aside).not.toHaveAttribute('inert');
    expect(contentWrapper).toHaveAttribute('inert');

    let wasInertWhenFocusCalled: boolean | null = null;
    const focusSpy = vi.spyOn(trigger, 'focus').mockImplementation(function (this: HTMLButtonElement) {
      wasInertWhenFocusCalled = contentWrapper.hasAttribute('inert');
    });

    await userEvent.keyboard('{Escape}');
    expect(aside).toHaveAttribute('inert');
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(wasInertWhenFocusCalled).toBe(false);
  });

  it('closes the mobile drawer when the viewport becomes desktop, so it does not reappear open when narrowing back', async () => {
    const viewport = stubMatchMedia(false);
    render(
      <MemoryRouter initialEntries={['/items']}>
        <DevSessionProvider>
          <AppShell>content</AppShell>
        </DevSessionProvider>
      </MemoryRouter>,
    );
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    const aside = screen.getByRole('navigation', { name: 'Primary', hidden: true }).closest('aside')!;

    await userEvent.click(trigger);
    expect(aside).not.toHaveAttribute('inert');
    expect(aside).toHaveAttribute('aria-modal', 'true');

    act(() => viewport.setMatches(true)); // widen to desktop
    expect(aside).not.toHaveAttribute('role', 'dialog');

    act(() => viewport.setMatches(false)); // narrow back to mobile
    expect(aside).toHaveAttribute('inert');
    expect(aside).not.toHaveAttribute('aria-modal', 'true');
  });

  it('does not steal focus onto the hidden trigger when the drawer auto-closes on a desktop transition', async () => {
    // The trigger button is `md:hidden`, so it isn't focusable on desktop.
    // The pre-fix effect fired for this transition too (wasOpenRef was true,
    // mobileNavOpen just went false) and called .focus() on it regardless.
    const viewport = stubMatchMedia(false);
    render(
      <MemoryRouter initialEntries={['/items']}>
        <DevSessionProvider>
          <AppShell>content</AppShell>
        </DevSessionProvider>
      </MemoryRouter>,
    );
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    await userEvent.click(trigger);

    const focusSpy = vi.spyOn(trigger, 'focus');
    act(() => viewport.setMatches(true)); // widen to desktop; drawer auto-closes

    expect(focusSpy).not.toHaveBeenCalled();
  });
});
