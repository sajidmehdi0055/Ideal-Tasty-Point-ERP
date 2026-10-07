import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DevSessionProvider } from '../../../lib/session';
import { DEV_IDENTITY_STORAGE_KEY } from '../../../lib/dev-session';
import { ApiError } from '../../../lib/api-client';
import { TRUNCATION_MESSAGE } from '../../../design-system/data-table';
import { stubMatchMedia } from '../../../test/media';
import { ItemListPage } from '../ItemListPage';
import * as itemsApi from '../api';
import type { Item } from '../types';

vi.mock('../api');

const item: Item = {
  id: '1',
  item_code: 'ITM-000001',
  item_name: 'Flour',
  primary_item_type: 'RAW_MATERIAL',
  base_uom: 'kg',
  brand: 'Generic / No Brand',
  branch_id: 'branch-main',
  active: true,
  created_at: '2026-09-17T00:00:00Z',
  updated_at: '2026-09-17T00:00:00Z',
};

function renderPage(state?: unknown) {
  return render(
    <DevSessionProvider>
      <MemoryRouter initialEntries={[{ pathname: '/items', state }]}>
        <ItemListPage />
      </MemoryRouter>
    </DevSessionProvider>,
  );
}

describe('ItemListPage', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows a loading state, then the live list once items resolve', async () => {
    vi.mocked(itemsApi.listItems).mockResolvedValue({ items: [item], truncated: false });
    renderPage();

    expect(screen.getByText(/loading items/i)).toBeInTheDocument();
    expect(await screen.findByText('Flour')).toBeInTheDocument();
    expect(screen.getByText('ITM-000001')).toBeInTheDocument();
  });

  it.each([
    ['404', new ApiError(404, 'NOT_FOUND', 'Not found.')],
    ['a network failure', new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Is the backend running?')],
  ])('shows %s as an error with Try again — never a cached or "no items" list', async (_label, failure) => {
    window.sessionStorage.setItem('itp-erp:session-items', JSON.stringify([{ ...item, item_name: 'Stale cached' }]));
    vi.mocked(itemsApi.listItems).mockRejectedValueOnce(failure).mockResolvedValueOnce({ items: [item], truncated: false });
    renderPage();

    expect(await screen.findByText(failure.message)).toBeInTheDocument();
    expect(screen.queryByText('Stale cached')).not.toBeInTheDocument();
    expect(screen.queryByText(/no items yet/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Flour')).toBeInTheDocument();
    expect(itemsApi.listItems).toHaveBeenCalledTimes(2);
  });

  it('says plainly when the backend capped the list (X-Result-Truncated) and hides it otherwise', async () => {
    vi.mocked(itemsApi.listItems).mockResolvedValue({ items: [item], truncated: true });
    renderPage();

    expect(await screen.findByText(TRUNCATION_MESSAGE)).toBeInTheDocument();
    expect(TRUNCATION_MESSAGE).toBe('Showing the first 200 items. Search or choose a location to see the rest.');
    // The count stays honest: it says these are only the first items.
    expect(screen.getByText('First 1 items')).toBeInTheDocument();
    // Counts from a capped list would be wrong, so no summary tiles are shown.
    expect(screen.queryByText('Total items')).not.toBeInTheDocument();
  });

  it('does not show the capped-list notice for a complete list', async () => {
    vi.mocked(itemsApi.listItems).mockResolvedValue({ items: [item], truncated: false });
    renderPage();

    expect(await screen.findByText('Flour')).toBeInTheDocument();
    expect(screen.queryByText(TRUNCATION_MESSAGE)).not.toBeInTheDocument();
    expect(screen.getByText('1 item')).toBeInTheDocument();
  });

  it('searches on the backend (debounced, trimmed) so items beyond the cap are still found', async () => {
    const sugar: Item = { ...item, id: '2', item_code: 'ITM-000250', item_name: 'Sugar' };
    vi.mocked(itemsApi.listItems).mockImplementation(async query =>
      query?.search ? { items: [sugar], truncated: false } : { items: [item], truncated: true },
    );
    renderPage();

    expect(await screen.findByText('Flour')).toBeInTheDocument();
    expect(itemsApi.listItems).toHaveBeenLastCalledWith({});
    await userEvent.type(screen.getByLabelText(/search items/i), '  sug ');
    expect(await screen.findByText('Sugar')).toBeInTheDocument();
    expect(itemsApi.listItems).toHaveBeenLastCalledWith({ search: 'sug' });
    // Debounced: one request for the whole typed term, not one per keystroke.
    expect(itemsApi.listItems).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Flour')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/search items/i)).toHaveAttribute('maxLength', '100');
  });

  it('shows "No items match your search" when the backend finds nothing', async () => {
    vi.mocked(itemsApi.listItems).mockImplementation(async query =>
      query?.search ? { items: [], truncated: false } : { items: [item], truncated: false },
    );
    renderPage();

    expect(await screen.findByText('Flour')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/search items/i), 'zzz');
    expect(await screen.findByText(/no items match your search/i)).toBeInTheDocument();
  });

  it('shows a real error state instead of silently hiding a non-404 failure', async () => {
    vi.mocked(itemsApi.listItems).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'boom'));
    renderPage();

    expect(await screen.findByText('boom')).toBeInTheDocument();
  });

  it('shows a clear no-access message without Try again when the backend answers 403 (STAFF, INV-11)', async () => {
    window.localStorage.setItem(
      DEV_IDENTITY_STORAGE_KEY,
      JSON.stringify({ userId: 'u', role: 'STAFF', branchId: 'branch-main' }),
    );
    vi.mocked(itemsApi.listItems).mockRejectedValue(
      new ApiError(403, 'FORBIDDEN', 'Item creation/editing requires Owner or Manager'),
    );
    renderPage();

    expect(await screen.findByText(/only owner or manager can view items/i)).toBeInTheDocument();
    expect(screen.queryByText(/item creation\/editing requires/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /new item/i })).not.toBeInTheDocument();
  });

  it('shows the New item action for the default Owner dev identity', async () => {
    vi.mocked(itemsApi.listItems).mockResolvedValue({ items: [], truncated: false });
    renderPage();

    expect(await screen.findByRole('link', { name: /new item/i })).toBeInTheDocument();
  });

  // Success after create/edit is now a toast raised by ItemFormPage (see its tests);
  // the list never shows a pinned banner from router state.
  it('ignores a leftover success message in router state (no pinned banner)', async () => {
    vi.mocked(itemsApi.listItems).mockResolvedValue({ items: [item], truncated: false });
    renderPage({ successMessage: 'Item ITM-000001 created.' });

    expect(await screen.findByText('Flour')).toBeInTheDocument();
    expect(screen.queryByText('Item ITM-000001 created.')).not.toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    vi.mocked(itemsApi.listItems).mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getAllByTestId('skeleton-row').length).toBeGreaterThan(0);
  });

  it('shows the empty state with what to do next and a New item action', async () => {
    vi.mocked(itemsApi.listItems).mockResolvedValue({ items: [], truncated: false });
    renderPage();

    expect(await screen.findByText('No items yet')).toBeInTheDocument();
    expect(screen.getByText(/create your first item to get started/i)).toBeInTheDocument();
    // One New item in the page intro, one in the empty state.
    expect(screen.getAllByRole('link', { name: /new item/i })).toHaveLength(2);
  });

  it('shows the error reason, that data is safe, and Try again', async () => {
    vi.mocked(itemsApi.listItems).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'The server did not answer.'));
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('The server did not answer.')).toBeInTheDocument();
    expect(within(alert).getByText(/your data is safe/i)).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('counts summary tiles from a complete list (total, active, inactive, types in use)', async () => {
    const sugar: Item = { ...item, id: '2', item_code: 'ITM-000002', item_name: 'Sugar', active: false };
    const karahi: Item = {
      ...item,
      id: '3',
      item_code: 'ITM-000003',
      item_name: 'Chicken Karahi',
      primary_item_type: 'FINISHED_SELLING_PRODUCT',
    };
    vi.mocked(itemsApi.listItems).mockResolvedValue({ items: [item, sugar, karahi], truncated: false });
    renderPage();

    const summary = await screen.findByLabelText('Item summary');
    const tile = (label: string) => within(summary).getByText(label).parentElement!;
    expect(within(tile('Total items')).getByText('3')).toBeInTheDocument();
    expect(within(tile('Active')).getByText('2')).toBeInTheDocument();
    expect(within(tile('Inactive')).getByText('1')).toBeInTheDocument();
    expect(within(tile('Primary types in use')).getByText('2')).toBeInTheDocument();
    expect(within(tile('Primary types in use')).getByText('Raw material · Finished selling product')).toBeInTheDocument();
  });

  it('shows the base unit as a display label (kg, L) and keeps the stored code on hover', async () => {
    vi.mocked(itemsApi.listItems).mockResolvedValue({
      items: [{ ...item, base_uom: 'LITER' }],
      truncated: false,
    });
    renderPage();

    const cell = await screen.findByText('L');
    expect(cell).toHaveAttribute('title', 'LITER');
  });

  it('"/" focuses the item search, but not while typing in another field', async () => {
    vi.mocked(itemsApi.listItems).mockResolvedValue({ items: [item], truncated: false });
    render(
      <DevSessionProvider>
        <MemoryRouter initialEntries={['/items']}>
          <input aria-label="Other field" />
          <ItemListPage />
        </MemoryRouter>
      </DevSessionProvider>,
    );
    await screen.findByText('Flour');
    const searchBox = screen.getByLabelText(/search items/i);

    const other = screen.getByLabelText('Other field');
    await userEvent.click(other);
    await userEvent.keyboard('/');
    expect(other).toHaveFocus();
    expect(other).toHaveValue('/');

    other.blur();
    await userEvent.keyboard('/');
    expect(searchBox).toHaveFocus();
    expect(searchBox).toHaveValue('');
  });

  describe('on a desktop (table settings enabled)', () => {
    it('locks the required Item and Actions columns in the Columns menu; others can be hidden', async () => {
      stubMatchMedia({ hover: true, wide: true });
      vi.mocked(itemsApi.listItems).mockResolvedValue({ items: [item], truncated: false });
      renderPage();
      await screen.findByText('Flour');

      await userEvent.click(screen.getByRole('button', { name: /^Columns/ }));
      for (const name of ['Item', 'Actions']) {
        const box = screen.getByRole('checkbox', { name: `${name} (required, cannot be hidden)` });
        expect(box).toBeChecked();
        expect(box).toBeDisabled();
      }
      const brand = screen.getByRole('checkbox', { name: /^Brand/ });
      expect(brand).toBeEnabled();
      await userEvent.click(brand);
      expect(screen.queryByRole('columnheader', { name: 'Brand' })).not.toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Item' })).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
    });

    it('puts the item code under the name (comfortable) and on the same line (compact)', async () => {
      stubMatchMedia({ hover: true, wide: true });
      vi.mocked(itemsApi.listItems).mockResolvedValue({ items: [item], truncated: false });
      renderPage();
      const code = await screen.findByText('ITM-000001');
      expect(code.parentElement!.className).toContain('flex-col');

      await userEvent.click(screen.getByRole('button', { name: 'Compact' }));
      expect(screen.getByText('ITM-000001').parentElement!.className).not.toContain('flex-col');
    });
  });
});
