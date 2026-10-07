import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppShell, PEEK_CLOSE_DELAY_MS, PEEK_OPEN_DELAY_MS } from '../AppShell';
import { DevSessionProvider } from '../../../lib/session';
import { ThemeProvider } from '../../../lib/theme';
import { SIDEBAR_COLLAPSED_GROUPS_KEY, SIDEBAR_PINNED_KEY } from '../sidebar-prefs';
import { stubMatchMedia } from '../../../test/media';

function renderShell(path = '/items') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <DevSessionProvider>
          <AppShell>content</AppShell>
        </DevSessionProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

const railRegion = () => screen.getByRole('navigation', { name: 'Primary' }).closest('aside')!;
const content = () => screen.getByTestId('shell-content');

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
});

describe('AppShell — mobile drawer (< 768px)', () => {
  const drawer = () => screen.getByRole('dialog', { name: 'Primary navigation', hidden: true });

  it('shows no rail, only a menu button that opens a modal drawer with focus inside it', async () => {
    stubMatchMedia({ wide: false });
    renderShell();
    expect(screen.queryByRole('button', { name: 'Pin sidebar' })).not.toBeInTheDocument();
    expect(drawer()).toHaveAttribute('inert');

    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(drawer()).not.toHaveAttribute('inert');
    expect(drawer()).toHaveAttribute('aria-modal', 'true');
    expect(content()).toHaveAttribute('inert');
    expect(within(drawer()).getByRole('link', { name: /item master/i })).toHaveFocus();
    expect(screen.getByTestId('sidebar-scrim')).toBeInTheDocument();
  });

  it('closes from the close button, the scrim and a nav link', async () => {
    stubMatchMedia({ wide: false });
    renderShell();
    const open = () => userEvent.click(screen.getByRole('button', { name: 'Open navigation' }));

    await open();
    await userEvent.click(within(drawer()).getByRole('button', { name: 'Close navigation' }));
    expect(drawer()).toHaveAttribute('inert');

    await open();
    fireEvent.click(screen.getByTestId('sidebar-scrim'));
    expect(drawer()).toHaveAttribute('inert');

    await open();
    await userEvent.click(within(drawer()).getByRole('link', { name: /catalog settings/i }));
    expect(drawer()).toHaveAttribute('inert');
  });

  it('returns focus to the menu button only after the content is no longer inert', async () => {
    // jsdom does not block .focus() inside inert, so record the ordering instead.
    stubMatchMedia({ wide: false });
    renderShell();
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    await userEvent.click(trigger);

    let wasInertWhenFocusCalled: boolean | null = null;
    const focusSpy = vi.spyOn(trigger, 'focus').mockImplementation(function () {
      wasInertWhenFocusCalled = content().hasAttribute('inert');
    });

    await userEvent.keyboard('{Escape}');
    expect(drawer()).toHaveAttribute('inert');
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(wasInertWhenFocusCalled).toBe(false);
  });

  it('drops an open drawer when widening to desktop, so it does not reappear when narrowing back', async () => {
    const media = stubMatchMedia({ wide: false, hover: true });
    renderShell();
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    await userEvent.click(trigger);
    const focusSpy = vi.spyOn(trigger, 'focus');

    act(() => media.set({ wide: true }));
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument();
    expect(content()).not.toHaveAttribute('inert');
    expect(focusSpy).not.toHaveBeenCalled(); // the menu button is gone on desktop

    act(() => media.set({ wide: false }));
    expect(drawer()).toHaveAttribute('inert');
  });
});

describe('AppShell — desktop with mouse (≥ 768px, hover)', () => {
  it('starts as an icons-only rail with named links and pending markers', () => {
    stubMatchMedia({ wide: true, hover: true });
    renderShell();
    const rail = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(rail).getByRole('link', { name: 'Item Master' })).toBeInTheDocument();
    expect(within(rail).getByRole('link', { name: 'Suppliers (pending)' })).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-peek')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open navigation' })).not.toBeInTheDocument();
  });

  it('opens the peek only after the pointer rests, and closes it after a grace period', () => {
    vi.useFakeTimers();
    stubMatchMedia({ wide: true, hover: true });
    renderShell();

    fireEvent.mouseEnter(railRegion());
    act(() => vi.advanceTimersByTime(PEEK_OPEN_DELAY_MS - 1));
    expect(screen.queryByTestId('sidebar-peek')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId('sidebar-peek')).toBeInTheDocument();

    // Non-modal: no scrim, content stays usable.
    expect(screen.queryByTestId('sidebar-scrim')).not.toBeInTheDocument();
    expect(content()).not.toHaveAttribute('inert');

    fireEvent.mouseLeave(railRegion());
    act(() => vi.advanceTimersByTime(PEEK_CLOSE_DELAY_MS - 1));
    fireEvent.mouseEnter(railRegion()); // came back within the grace period
    act(() => vi.advanceTimersByTime(PEEK_CLOSE_DELAY_MS));
    expect(screen.getByTestId('sidebar-peek')).toBeInTheDocument();

    fireEvent.mouseLeave(railRegion());
    act(() => vi.advanceTimersByTime(PEEK_CLOSE_DELAY_MS));
    expect(screen.queryByTestId('sidebar-peek')).not.toBeInTheDocument();
  });

  it('does not open when the pointer only passes over the rail', () => {
    vi.useFakeTimers();
    stubMatchMedia({ wide: true, hover: true });
    renderShell();
    fireEvent.mouseEnter(railRegion());
    act(() => vi.advanceTimersByTime(PEEK_OPEN_DELAY_MS - 50));
    fireEvent.mouseLeave(railRegion());
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByTestId('sidebar-peek')).not.toBeInTheDocument();
  });

  it('pins and collapses the sidebar, remembering the choice on this device', async () => {
    stubMatchMedia({ wide: true, hover: true });
    const { unmount } = renderShell();

    await userEvent.click(screen.getByRole('button', { name: 'Pin sidebar' }));
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-peek')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(SIDEBAR_PINNED_KEY)).toBe('true');

    unmount();
    renderShell();
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(screen.getByRole('button', { name: 'Pin sidebar' })).toBeInTheDocument();
    expect(window.localStorage.getItem(SIDEBAR_PINNED_KEY)).toBe('false');
  });

  it('pins from inside the peek as well', async () => {
    vi.useFakeTimers();
    stubMatchMedia({ wide: true, hover: true });
    renderShell();
    fireEvent.mouseEnter(railRegion());
    act(() => vi.advanceTimersByTime(PEEK_OPEN_DELAY_MS));
    fireEvent.click(within(screen.getByTestId('sidebar-peek')).getByRole('button', { name: 'Pin sidebar' }));
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-peek')).not.toBeInTheDocument();
  });

  it('opens from keyboard focus on a rail link, moving focus to the same item, and Esc closes back to the rail', async () => {
    stubMatchMedia({ wide: true, hover: true });
    renderShell();
    const railLink = within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', {
      name: 'Catalog Settings',
    });

    act(() => railLink.focus());
    const peek = screen.getByTestId('sidebar-peek');
    expect(within(peek).getByRole('link', { name: /catalog settings/i })).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('sidebar-peek')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pin sidebar' })).toHaveFocus());
    expect(screen.queryByTestId('sidebar-peek')).not.toBeInTheDocument();
  });

  it('closes a keyboard-opened peek when focus leaves it', async () => {
    stubMatchMedia({ wide: true, hover: true });
    renderShell();
    const railLink = within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', {
      name: 'Item Master',
    });
    act(() => railLink.focus());
    expect(screen.getByTestId('sidebar-peek')).toBeInTheDocument();

    act(() => screen.getByRole('button', { name: 'Dark theme' }).focus());
    expect(screen.queryByTestId('sidebar-peek')).not.toBeInTheDocument();
  });
});

describe('AppShell — tablet / touch (≥ 768px, no hover)', () => {
  it('never opens on hover; the rail button opens a modal peek with scrim', async () => {
    vi.useFakeTimers();
    stubMatchMedia({ wide: true, hover: false });
    renderShell();

    fireEvent.mouseEnter(railRegion());
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByTestId('sidebar-peek')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pin sidebar' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand navigation' }));
    const peek = screen.getByRole('dialog', { name: 'Primary navigation' });
    expect(peek).toHaveAttribute('aria-modal', 'true');
    expect(content()).toHaveAttribute('inert');
    expect(within(peek).getByRole('link', { name: /item master/i })).toHaveFocus();

    fireEvent.click(screen.getByTestId('sidebar-scrim'));
    expect(screen.queryByTestId('sidebar-peek')).not.toBeInTheDocument();
    expect(content()).not.toHaveAttribute('inert');
  });

  it('closes the modal peek when a link is chosen', async () => {
    stubMatchMedia({ wide: true, hover: false });
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'Expand navigation' }));
    await userEvent.click(within(screen.getByTestId('sidebar-peek')).getByRole('link', { name: /catalog settings/i }));
    expect(screen.queryByTestId('sidebar-peek')).not.toBeInTheDocument();
  });
});

describe('AppShell — groups', () => {
  it('collapses a group, hides its links and remembers it', async () => {
    stubMatchMedia({ wide: true, hover: true });
    window.localStorage.setItem(SIDEBAR_PINNED_KEY, 'true');
    const { unmount } = renderShell();

    const stock = screen.getByRole('button', { name: 'Stock' });
    expect(stock).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(stock);
    expect(stock).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: /stock ledger/i })).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(SIDEBAR_COLLAPSED_GROUPS_KEY) ?? '[]')).toEqual(['Stock']);

    unmount();
    renderShell();
    expect(screen.getByRole('button', { name: 'Stock' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('ignores corrupt stored preferences', () => {
    stubMatchMedia({ wide: true, hover: true });
    window.localStorage.setItem(SIDEBAR_PINNED_KEY, 'maybe');
    window.localStorage.setItem(SIDEBAR_COLLAPSED_GROUPS_KEY, '{not json');
    renderShell();
    expect(screen.getByRole('button', { name: 'Pin sidebar' })).toBeInTheDocument();
  });
});

describe('Header', () => {
  it('shows the breadcrumb trail with the current page marked', () => {
    stubMatchMedia({ wide: true, hover: true });
    renderShell('/catalog-settings');
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByText('Inventory')).toBeInTheDocument();
    expect(within(crumbs).getByText('Catalog Settings')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { level: 1, name: 'Catalog Settings' })).toBeInTheDocument();
  });

  it('uses the Direction A title (20px / 800) and the 28px page gutter (UI-REFRESH-001)', () => {
    stubMatchMedia({ wide: true, hover: true });
    renderShell('/stock/ledger');
    const title = screen.getByRole('heading', { level: 1, name: 'Stock Ledger' });
    expect(title).toHaveClass('font-extrabold', 'md:text-[20px]');
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByText('Stock')).toBeInTheDocument();
    expect(within(crumbs).getByRole('list')).toHaveClass('text-xs', 'text-ink-muted');
    expect(screen.getByRole('main')).toHaveClass('md:p-gutter');
  });
});

describe('AppShell — edge cases from independent review', () => {
  it('closes a keyboard-opened peek on focus-out after pinning from the peek and collapsing again', async () => {
    vi.useFakeTimers();
    stubMatchMedia({ wide: true, hover: true });
    renderShell();
    fireEvent.mouseEnter(railRegion());
    act(() => vi.advanceTimersByTime(PEEK_OPEN_DELAY_MS));
    // Pinning swaps the rail region out from under the pointer: no mouseleave fires.
    fireEvent.click(within(screen.getByTestId('sidebar-peek')).getByRole('button', { name: 'Pin sidebar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));

    const railLink = within(screen.getByRole('navigation', { name: 'Primary' })).getByRole('link', { name: 'Item Master' });
    act(() => railLink.focus());
    expect(screen.getByTestId('sidebar-peek')).toBeInTheDocument();
    act(() => screen.getByRole('button', { name: 'Dark theme' }).focus());
    expect(screen.queryByTestId('sidebar-peek')).not.toBeInTheDocument();
  });

  it('does not let a pending hover timer open the peek after a breakpoint change', () => {
    vi.useFakeTimers();
    const media = stubMatchMedia({ wide: true, hover: true });
    renderShell();
    fireEvent.mouseEnter(railRegion());
    act(() => media.set({ wide: false }));
    act(() => vi.advanceTimersByTime(PEEK_OPEN_DELAY_MS * 2));
    act(() => media.set({ wide: true }));
    expect(screen.queryByTestId('sidebar-peek')).not.toBeInTheDocument();
  });

  it('drops an open hover peek when the device switches to touch (and back)', () => {
    vi.useFakeTimers();
    const media = stubMatchMedia({ wide: true, hover: true });
    renderShell();
    fireEvent.mouseEnter(railRegion());
    act(() => vi.advanceTimersByTime(PEEK_OPEN_DELAY_MS));
    expect(screen.getByTestId('sidebar-peek')).toBeInTheDocument();

    act(() => media.set({ hover: false }));
    expect(screen.queryByTestId('sidebar-peek')).not.toBeInTheDocument();
    expect(content()).not.toHaveAttribute('inert');

    fireEvent.click(screen.getByRole('button', { name: 'Expand navigation' }));
    expect(screen.getByRole('dialog', { name: 'Primary navigation' })).toBeInTheDocument();
    act(() => media.set({ hover: true }));
    expect(screen.queryByTestId('sidebar-peek')).not.toBeInTheDocument();
  });

  it('leaves Esc to the content when a hover peek is open but focus is outside it', () => {
    vi.useFakeTimers();
    stubMatchMedia({ wide: true, hover: true });
    renderShell();
    fireEvent.mouseEnter(railRegion());
    act(() => vi.advanceTimersByTime(PEEK_OPEN_DELAY_MS));
    const contentControl = screen.getByRole('button', { name: 'Dark theme' });
    act(() => contentControl.focus());

    fireEvent.keyDown(document, { key: 'Escape' });
    act(() => vi.advanceTimersByTime(10));
    expect(contentControl).toHaveFocus();
    expect(screen.getByTestId('sidebar-peek')).toBeInTheDocument();
  });

  it('returns focus to the rail button after the touch peek is dismissed by the scrim', async () => {
    stubMatchMedia({ wide: true, hover: false });
    renderShell();
    const expand = screen.getByRole('button', { name: 'Expand navigation' });
    await userEvent.click(expand);
    fireEvent.click(screen.getByTestId('sidebar-scrim'));
    await waitFor(() => expect(expand).toHaveFocus());
  });
});

describe('Icon-only shell buttons have a tooltip (UI-REFRESH-001 spec 1c)', () => {
  it('mobile menu and drawer close buttons show their tooltip on focus', async () => {
    stubMatchMedia({ wide: false, hover: false });
    renderShell();
    const menu = screen.getByRole('button', { name: 'Open navigation' });
    act(() => menu.focus());
    expect(menu.parentElement!.querySelector('[role="tooltip"]')).toHaveTextContent('Open navigation');
    expect(menu.parentElement!.querySelector('[role="tooltip"]')).toBeVisible();
    await userEvent.click(menu);
    const close = screen.getByRole('button', { name: 'Close navigation' });
    act(() => close.focus());
    expect(close.parentElement!.querySelector('[role="tooltip"]')).toBeVisible();
  });
});
