import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DevSessionProvider, DEV_IDENTITY_STORAGE_KEY } from '../../../lib/session';
import { ApiError } from '../../../lib/api-client';
import { ItemFormPage } from '../ItemFormPage';
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

function renderAt(path: string, state?: unknown) {
  return render(
    <DevSessionProvider>
      <MemoryRouter initialEntries={[{ pathname: path, state }]}>
        <Routes>
          <Route path="/items/new" element={<ItemFormPage />} />
          <Route path="/items/:id/edit" element={<ItemFormPage />} />
          <Route path="/items" element={<p>Back on the item list</p>} />
        </Routes>
      </MemoryRouter>
    </DevSessionProvider>,
  );
}

describe('ItemFormPage', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('creates an item and returns to the list with a success message', async () => {
    vi.mocked(itemsApi.createItem).mockResolvedValue(item);
    renderAt('/items/new');

    await userEvent.type(screen.getByLabelText(/item name/i), 'Flour');
    await userEvent.selectOptions(screen.getByLabelText(/primary item type/i), 'RAW_MATERIAL');
    await userEvent.type(screen.getByLabelText(/base uom/i), 'kg');
    await userEvent.click(screen.getByRole('button', { name: /create item/i }));

    await waitFor(() => expect(itemsApi.createItem).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Back on the item list')).toBeInTheDocument();
  });

  it('surfaces a 401 honestly instead of pretending the create succeeded', async () => {
    vi.mocked(itemsApi.createItem).mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'no session'));
    renderAt('/items/new');

    await userEvent.type(screen.getByLabelText(/item name/i), 'Flour');
    await userEvent.selectOptions(screen.getByLabelText(/primary item type/i), 'RAW_MATERIAL');
    await userEvent.type(screen.getByLabelText(/base uom/i), 'kg');
    await userEvent.click(screen.getByRole('button', { name: /create item/i }));

    expect(await screen.findByText(/sign-in is not implemented yet/i)).toBeInTheDocument();
  });

  it('shows a not-permitted message instead of the form for a non-Owner/Manager identity (INV-11)', () => {
    window.localStorage.setItem(
      DEV_IDENTITY_STORAGE_KEY,
      JSON.stringify({ userId: 'u', role: 'STAFF', branchId: 'branch-main' }),
    );
    renderAt('/items/new');
    expect(screen.getByText(/not permitted/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/item name/i)).not.toBeInTheDocument();
  });

  it('explains why an item cannot be edited when it is not available in this session', () => {
    renderAt('/items/unknown-id/edit');
    expect(screen.getByText(/item not available for editing/i)).toBeInTheDocument();
  });

  it('prefills from router state and saves an edit', async () => {
    vi.mocked(itemsApi.updateItem).mockResolvedValue({ ...item, item_name: 'Fine Flour' });
    renderAt('/items/1/edit', { item });

    expect(screen.getByDisplayValue('Flour')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText(/item name/i));
    await userEvent.type(screen.getByLabelText(/item name/i), 'Fine Flour');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(itemsApi.updateItem).toHaveBeenCalledWith('1', expect.objectContaining({ item_name: 'Fine Flour' })),
    );
  });
});
