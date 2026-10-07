import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';
import * as uomApi from '../features/catalog-settings/uom/api';
import * as stockApi from '../features/stock/api';

vi.mock('../features/catalog-settings/uom/api');
vi.mock('../features/stock/api');

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

  it('renders the placeholder screens for Suppliers and Purchases', async () => {
    for (const [path, title] of [
      ['/suppliers', 'Suppliers'],
      ['/purchases', 'Purchases & Rates'],
    ] as const) {
      window.history.pushState({}, '', path);
      const { unmount } = render(<App />);
      expect(await screen.findByRole('heading', { name: title, level: 3 })).toBeInTheDocument();
      unmount();
    }
  });

  it('routes /stock/locations and /stock/ledger to the live stock screens (UI-STOCK-002)', async () => {
    vi.mocked(stockApi.listLocations).mockResolvedValue([]);
    vi.mocked(stockApi.listBalances).mockResolvedValue([]);

    window.history.pushState({}, '', '/stock/locations');
    const first = render(<App />);
    expect(await screen.findByText('No stock locations yet')).toBeInTheDocument();
    first.unmount();

    window.history.pushState({}, '', '/stock/ledger');
    render(<App />);
    expect(await screen.findByRole('tab', { name: 'Balances' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('No stock in the ledger yet')).toBeInTheDocument();
  });
});
