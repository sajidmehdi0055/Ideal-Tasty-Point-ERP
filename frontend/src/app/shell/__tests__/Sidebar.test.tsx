import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../Sidebar';

/** Simulates a desktop viewport for `(min-width: 768px)` — the default test shim never matches. */
function stubDesktopViewport() {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: query === '(min-width: 768px)',
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

describe('Sidebar', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists Item Master as active and marks the S-02 screens as pending', () => {
    render(
      <MemoryRouter initialEntries={['/items']}>
        <Sidebar open onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /item master/i })).toBeInTheDocument();
    for (const label of [/uom master/i, /brands/i, /pack variants/i]) {
      expect(screen.getByRole('link', { name: label })).toHaveTextContent('Pending');
    }
    expect(screen.getByRole('link', { name: /item master/i })).not.toHaveTextContent('Pending');
  });

  it('is inert (unreachable by keyboard/AT) when closed on a mobile viewport', () => {
    render(
      <MemoryRouter initialEntries={['/items']}>
        <Sidebar open={false} onClose={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('navigation', { name: 'Primary', hidden: true }).closest('aside')).toHaveAttribute(
      'inert',
    );
  });

  it('is not inert, and is a modal dialog, when open on a mobile viewport', () => {
    render(
      <MemoryRouter initialEntries={['/items']}>
        <Sidebar open onClose={vi.fn()} />
      </MemoryRouter>,
    );
    const aside = screen.getByRole('dialog', { name: 'Primary navigation' });
    expect(aside).not.toHaveAttribute('inert');
    expect(aside).toHaveAttribute('aria-modal', 'true');
  });

  it('calls onClose on Escape when open on a mobile viewport', async () => {
    const onClose = vi.fn();
    render(
      <MemoryRouter initialEntries={['/items']}>
        <Sidebar open onClose={onClose} />
      </MemoryRouter>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is never inert or a dialog on a desktop viewport, regardless of open state', () => {
    stubDesktopViewport();
    render(
      <MemoryRouter initialEntries={['/items']}>
        <Sidebar open={false} onClose={vi.fn()} />
      </MemoryRouter>,
    );
    const aside = screen.getByRole('navigation', { name: 'Primary' }).closest('aside');
    expect(aside).not.toHaveAttribute('inert');
    expect(aside).not.toHaveAttribute('role', 'dialog');
  });
});
