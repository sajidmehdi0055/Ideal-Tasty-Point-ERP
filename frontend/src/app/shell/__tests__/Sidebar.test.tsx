import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../Sidebar';

describe('Sidebar', () => {
  it('lists Item Master and Catalog Settings as live, and the rest as pending', () => {
    render(
      <MemoryRouter initialEntries={['/items']}>
        <Sidebar open onClose={vi.fn()} isDesktop={false} />
      </MemoryRouter>,
    );

    for (const label of [/item master/i, /catalog settings/i]) {
      expect(screen.getByRole('link', { name: label })).not.toHaveTextContent('Pending');
    }
    for (const label of [/suppliers/i, /purchases & rates/i, /stock locations/i, /stock ledger/i]) {
      expect(screen.getByRole('link', { name: label })).toHaveTextContent('Pending');
    }
  });

  it('groups nav items under Inventory, Purchasing and Stock section labels', () => {
    render(
      <MemoryRouter initialEntries={['/items']}>
        <Sidebar open onClose={vi.fn()} isDesktop={false} />
      </MemoryRouter>,
    );

    for (const section of ['Inventory', 'Purchasing', 'Stock']) {
      expect(screen.getByText(section)).toBeInTheDocument();
    }
  });

  it('is inert (unreachable by keyboard/AT) when closed on a mobile viewport', () => {
    render(
      <MemoryRouter initialEntries={['/items']}>
        <Sidebar open={false} onClose={vi.fn()} isDesktop={false} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('navigation', { name: 'Primary', hidden: true }).closest('aside')).toHaveAttribute(
      'inert',
    );
  });

  it('is not inert, and is a modal dialog, when open on a mobile viewport', () => {
    render(
      <MemoryRouter initialEntries={['/items']}>
        <Sidebar open onClose={vi.fn()} isDesktop={false} />
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
        <Sidebar open onClose={onClose} isDesktop={false} />
      </MemoryRouter>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is never inert or a dialog on a desktop viewport, regardless of open state', () => {
    render(
      <MemoryRouter initialEntries={['/items']}>
        <Sidebar open={false} onClose={vi.fn()} isDesktop />
      </MemoryRouter>,
    );
    const aside = screen.getByRole('navigation', { name: 'Primary' }).closest('aside');
    expect(aside).not.toHaveAttribute('inert');
    expect(aside).not.toHaveAttribute('role', 'dialog');
  });
});
