import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';
import * as uomApi from '../features/catalog-settings/uom/api';

vi.mock('../features/catalog-settings/uom/api');

describe('App routing (UI-UOM-001)', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/');
    vi.clearAllMocks();
  });

  it('redirects the old /uom route to Catalog Settings on the UOM Master tab', async () => {
    vi.mocked(uomApi.listUoms).mockResolvedValue([]);
    window.history.pushState({}, '', '/uom');
    render(<App />);

    expect(await screen.findByRole('tab', { name: /uom master/i })).toHaveAttribute('aria-selected', 'true');
    expect(window.location.pathname).toBe('/catalog-settings');
  });

  it('redirects the old /brands route to Catalog Settings on the Brands tab', async () => {
    vi.mocked(uomApi.listUoms).mockResolvedValue([]);
    window.history.pushState({}, '', '/brands');
    render(<App />);

    expect(await screen.findByRole('tab', { name: /brands/i })).toHaveAttribute('aria-selected', 'true');
    expect(window.location.pathname).toBe('/catalog-settings');
  });

  it('redirects the old /pack-variants route to Catalog Settings on the Pack Variants tab', async () => {
    vi.mocked(uomApi.listUoms).mockResolvedValue([]);
    window.history.pushState({}, '', '/pack-variants');
    render(<App />);

    expect(await screen.findByRole('tab', { name: /pack variants/i })).toHaveAttribute('aria-selected', 'true');
    expect(window.location.pathname).toBe('/catalog-settings');
  });

  it('renders the new placeholder screens for Suppliers, Purchases and Stock', async () => {
    for (const [path, title] of [
      ['/suppliers', 'Suppliers'],
      ['/purchases', 'Purchases & Rates'],
      ['/stock/locations', 'Stock Locations'],
      ['/stock/ledger', 'Stock Ledger'],
    ] as const) {
      window.history.pushState({}, '', path);
      const { unmount } = render(<App />);
      expect(await screen.findByRole('heading', { name: title, level: 3 })).toBeInTheDocument();
      unmount();
    }
  });
});
