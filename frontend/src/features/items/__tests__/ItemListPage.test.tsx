import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DevSessionProvider } from '../../../lib/session';
import { DEV_IDENTITY_STORAGE_KEY } from '../../../lib/dev-session';
import { ApiError } from '../../../lib/api-client';
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

    expect(await screen.findByText(/showing the first 1 items/i)).toBeInTheDocument();
    expect(screen.getByText(/more items exist/i)).toBeInTheDocument();
  });

  it('does not show the capped-list notice for a complete list', async () => {
    vi.mocked(itemsApi.listItems).mockResolvedValue({ items: [item], truncated: false });
    renderPage();

    expect(await screen.findByText('Flour')).toBeInTheDocument();
    expect(screen.queryByText(/more items exist/i)).not.toBeInTheDocument();
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

  it('dismisses the one-time success banner once the user searches, instead of leaving it pinned', async () => {
    vi.mocked(itemsApi.listItems).mockResolvedValue({ items: [item], truncated: false });
    renderPage({ successMessage: 'Item ITM-000001 created.' });

    expect(await screen.findByText('Item ITM-000001 created.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/search items/i), 'f');
    expect(screen.queryByText('Item ITM-000001 created.')).not.toBeInTheDocument();
  });
});
