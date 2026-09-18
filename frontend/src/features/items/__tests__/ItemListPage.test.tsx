import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DevSessionProvider, DEV_IDENTITY_STORAGE_KEY } from '../../../lib/session';
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

function renderPage() {
  return render(
    <DevSessionProvider>
      <MemoryRouter initialEntries={['/items']}>
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
    vi.mocked(itemsApi.listItems).mockResolvedValue([item]);
    renderPage();

    expect(screen.getByText(/loading items/i)).toBeInTheDocument();
    expect(await screen.findByText('Flour')).toBeInTheDocument();
    expect(screen.getByText('ITM-000001')).toBeInTheDocument();
  });

  it('falls back to the session cache with a clear banner when the list endpoint 404s', async () => {
    vi.mocked(itemsApi.listItems).mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'not found'));
    renderPage();

    expect(await screen.findByText(/does not have a list endpoint/i)).toBeInTheDocument();
    expect(screen.getByText(/no items yet/i)).toBeInTheDocument();
  });

  it('shows a real error state instead of silently hiding a non-404 failure', async () => {
    vi.mocked(itemsApi.listItems).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'boom'));
    renderPage();

    expect(await screen.findByText('boom')).toBeInTheDocument();
  });

  it('hides the New item action for a non-Owner/Manager dev identity (INV-11)', async () => {
    window.localStorage.setItem(
      DEV_IDENTITY_STORAGE_KEY,
      JSON.stringify({ userId: 'u', role: 'STAFF', branchId: 'branch-main' }),
    );
    vi.mocked(itemsApi.listItems).mockResolvedValue([item]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Flour')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /new item/i })).not.toBeInTheDocument();
    expect(screen.getByText(/view only/i)).toBeInTheDocument();
  });

  it('shows the New item action for the default Owner dev identity', async () => {
    vi.mocked(itemsApi.listItems).mockResolvedValue([]);
    renderPage();

    expect(await screen.findByRole('link', { name: /new item/i })).toBeInTheDocument();
  });
});
