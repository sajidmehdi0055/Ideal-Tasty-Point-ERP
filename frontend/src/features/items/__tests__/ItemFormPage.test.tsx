import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { DevSessionProvider } from '../../../lib/session';
import { DEV_IDENTITY_STORAGE_KEY } from '../../../lib/dev-session';
import { ApiError } from '../../../lib/api-client';
import { ToastProvider } from '../../../design-system/components';
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
      <ToastProvider>
        <MemoryRouter initialEntries={[{ pathname: path, state }]}>
          <Routes>
            <Route path="/items/new" element={<ItemFormPage />} />
            <Route path="/items/:id/edit" element={<ItemFormPage />} />
            <Route path="/items" element={<p>Back on the item list</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </DevSessionProvider>,
  );
}

describe('ItemFormPage', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('creates an item and returns to the list with a success toast', async () => {
    vi.mocked(itemsApi.createItem).mockResolvedValue(item);
    renderAt('/items/new');

    await userEvent.type(screen.getByLabelText(/item name/i), 'Flour');
    await userEvent.selectOptions(screen.getByLabelText(/primary item type/i), 'RAW_MATERIAL');
    await userEvent.type(screen.getByLabelText(/base uom/i), 'kg');
    await userEvent.click(screen.getByRole('button', { name: /create item/i }));

    await waitFor(() => expect(itemsApi.createItem).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Back on the item list')).toBeInTheDocument();
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Item created');
    expect(toast).toHaveTextContent('Flour was added as ITM-000001.');
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

  it('surfaces INVALID_BASE_UOM as a field-level error on Base UOM, not just a generic banner', async () => {
    vi.mocked(itemsApi.createItem).mockRejectedValue(
      new ApiError(400, 'INVALID_BASE_UOM', 'base_uom must reference an existing active UOM'),
    );
    renderAt('/items/new');

    await userEvent.type(screen.getByLabelText(/item name/i), 'Flour');
    await userEvent.selectOptions(screen.getByLabelText(/primary item type/i), 'RAW_MATERIAL');
    await userEvent.type(screen.getByLabelText(/base uom/i), 'not-a-real-unit');
    await userEvent.click(screen.getByRole('button', { name: /create item/i }));

    expect(await screen.findByText('This unit is not an active unit in UOM Master.')).toBeInTheDocument();
    expect(screen.getByLabelText(/base uom/i)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Please fix the highlighted fields.')).toBeInTheDocument();
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

  it('fetches the item by id on a direct navigation with no router state, showing loading then the prefilled form', async () => {
    let resolveGetItem!: (value: Item) => void;
    vi.mocked(itemsApi.getItem).mockReturnValue(
      new Promise<Item>(resolve => {
        resolveGetItem = resolve;
      }),
    );
    renderAt('/items/1/edit');

    expect(itemsApi.getItem).toHaveBeenCalledWith('1');
    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    resolveGetItem(item);

    expect(await screen.findByDisplayValue('Flour')).toBeInTheDocument();
  });

  it('shows "Item not found for your branch." when getItem 404s', async () => {
    vi.mocked(itemsApi.getItem).mockRejectedValue(new ApiError(404, 'ITEM_NOT_FOUND', 'not found'));
    renderAt('/items/unknown-id/edit');

    expect(await screen.findByText('Item not found for your branch.')).toBeInTheDocument();
  });

  it('shows the honest sign-in message when getItem 401s', async () => {
    vi.mocked(itemsApi.getItem).mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'no session'));
    renderAt('/items/1/edit');

    expect(await screen.findByText(/sign-in is not implemented yet/i)).toBeInTheDocument();
  });

  it('shows the honest permission message when getItem 403s', async () => {
    vi.mocked(itemsApi.getItem).mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'no permission'));
    renderAt('/items/1/edit');

    expect(await screen.findByText(/only owner or manager can create or edit items/i)).toBeInTheDocument();
  });

  it('reloads the item when the user clicks Try again after a failed load', async () => {
    vi.mocked(itemsApi.getItem)
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Is the backend running?'))
      .mockResolvedValueOnce(item);
    renderAt('/items/1/edit');

    expect(await screen.findByText(/could not reach the server/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByDisplayValue(item.item_name)).toBeInTheDocument();
    expect(itemsApi.getItem).toHaveBeenCalledTimes(2);
  });

  it('loads an item by id and saves an edit', async () => {
    vi.mocked(itemsApi.getItem).mockResolvedValue(item);
    vi.mocked(itemsApi.updateItem).mockResolvedValue({ ...item, item_name: 'Fine Flour' });
    renderAt('/items/1/edit');

    expect(await screen.findByDisplayValue('Flour')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText(/item name/i));
    await userEvent.type(screen.getByLabelText(/item name/i), 'Fine Flour');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(itemsApi.updateItem).toHaveBeenCalledWith('1', expect.objectContaining({ item_name: 'Fine Flour' })),
    );
    expect(await screen.findByText('Back on the item list')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Item updated');
    expect(screen.getByRole('status')).toHaveTextContent('Fine Flour (ITM-000001) was saved.');
  });

  it("never shows a superseded id's data once its late response resolves after a newer id has already loaded", async () => {
    const itemTwo: Item = { ...item, id: '2', item_code: 'ITM-000002', item_name: 'Sugar' };
    let resolveItemOne!: (value: Item) => void;
    const getItemMock = vi.mocked(itemsApi.getItem);
    getItemMock.mockImplementation(id => {
      if (id === '1') {
        return new Promise<Item>(resolve => {
          resolveItemOne = resolve;
        });
      }
      return Promise.resolve(itemTwo);
    });

    function TestHarness() {
      const navigate = useNavigate();
      return (
        <>
          <button onClick={() => navigate('/items/2/edit')}>go-to-item-2</button>
          <Routes>
            <Route path="/items/:id/edit" element={<ItemFormPage />} />
          </Routes>
        </>
      );
    }

    render(
      <DevSessionProvider>
        <MemoryRouter initialEntries={['/items/1/edit']}>
          <TestHarness />
        </MemoryRouter>
      </DevSessionProvider>,
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'go-to-item-2' }));

    expect(await screen.findByDisplayValue('Sugar')).toBeInTheDocument();

    resolveItemOne(item);
    await waitFor(() => expect(getItemMock).toHaveBeenCalledWith('1'));

    expect(screen.queryByDisplayValue('Flour')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Sugar')).toBeInTheDocument();
  });

  describe('bounded independent-review corrections', () => {
    it('clears stale item data and form values when navigating from a loaded edit page to the new-item page', async () => {
      vi.mocked(itemsApi.getItem).mockResolvedValue(item);

      function TestHarness() {
        const navigate = useNavigate();
        return (
          <>
            <button onClick={() => navigate('/items/new')}>go-to-new</button>
            <Routes>
              <Route path="/items/new" element={<ItemFormPage />} />
              <Route path="/items/:id/edit" element={<ItemFormPage />} />
            </Routes>
          </>
        );
      }

      render(
        <DevSessionProvider>
          <MemoryRouter initialEntries={['/items/1/edit']}>
            <TestHarness />
          </MemoryRouter>
        </DevSessionProvider>,
      );

      expect(await screen.findByDisplayValue('Flour')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'go-to-new' }));

      expect(await screen.findByText('New item')).toBeInTheDocument();
      expect(screen.queryByDisplayValue('Flour')).not.toBeInTheDocument();
      expect(screen.getByLabelText(/item name/i)).toHaveValue('');
    });

    it('does not leak typed create-mode values into a subsequently loaded edit page', async () => {
      vi.mocked(itemsApi.getItem).mockResolvedValue(item);

      function TestHarness() {
        const navigate = useNavigate();
        return (
          <>
            <button onClick={() => navigate('/items/1/edit')}>go-to-edit-1</button>
            <Routes>
              <Route path="/items/new" element={<ItemFormPage />} />
              <Route path="/items/:id/edit" element={<ItemFormPage />} />
            </Routes>
          </>
        );
      }

      render(
        <DevSessionProvider>
          <MemoryRouter initialEntries={['/items/new']}>
            <TestHarness />
          </MemoryRouter>
        </DevSessionProvider>,
      );

      await userEvent.type(screen.getByLabelText(/item name/i), 'Draft Item');
      expect(screen.getByLabelText(/item name/i)).toHaveValue('Draft Item');

      await userEvent.click(screen.getByRole('button', { name: 'go-to-edit-1' }));

      expect(await screen.findByDisplayValue('Flour')).toBeInTheDocument();
      expect(screen.queryByDisplayValue('Draft Item')).not.toBeInTheDocument();
    });

    it('does not redirect or show a stale success message when a save resolves after navigating away', async () => {
      vi.mocked(itemsApi.getItem).mockResolvedValue(item);
      let resolveUpdate!: (value: Item) => void;
      vi.mocked(itemsApi.updateItem).mockReturnValue(
        new Promise<Item>(resolve => {
          resolveUpdate = resolve;
        }),
      );

      function TestHarness() {
        const navigate = useNavigate();
        return (
          <>
            <button onClick={() => navigate('/items/new')}>go-elsewhere</button>
            <Routes>
              <Route path="/items/new" element={<ItemFormPage />} />
              <Route path="/items/:id/edit" element={<ItemFormPage />} />
              <Route path="/items" element={<p>Back on the item list</p>} />
            </Routes>
          </>
        );
      }

      render(
        <DevSessionProvider>
          <MemoryRouter initialEntries={['/items/1/edit']}>
            <TestHarness />
          </MemoryRouter>
        </DevSessionProvider>,
      );

      expect(await screen.findByDisplayValue('Flour')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
      await waitFor(() => expect(itemsApi.updateItem).toHaveBeenCalledTimes(1));

      await userEvent.click(screen.getByRole('button', { name: 'go-elsewhere' }));
      expect(await screen.findByText('New item')).toBeInTheDocument();

      resolveUpdate({ ...item, item_name: 'Fine Flour' });
      await act(async () => {});

      expect(screen.queryByText('Back on the item list')).not.toBeInTheDocument();
      expect(screen.getByText('New item')).toBeInTheDocument();
    });

    it('does not surface a stale error when a save fails after navigating away', async () => {
      vi.mocked(itemsApi.getItem).mockResolvedValue(item);
      let rejectUpdate!: (reason: unknown) => void;
      vi.mocked(itemsApi.updateItem).mockReturnValue(
        new Promise<Item>((_resolve, reject) => {
          rejectUpdate = reject;
        }),
      );

      function TestHarness() {
        const navigate = useNavigate();
        return (
          <>
            <button onClick={() => navigate('/items/new')}>go-elsewhere</button>
            <Routes>
              <Route path="/items/new" element={<ItemFormPage />} />
              <Route path="/items/:id/edit" element={<ItemFormPage />} />
            </Routes>
          </>
        );
      }

      render(
        <DevSessionProvider>
          <MemoryRouter initialEntries={['/items/1/edit']}>
            <TestHarness />
          </MemoryRouter>
        </DevSessionProvider>,
      );

      expect(await screen.findByDisplayValue('Flour')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
      await waitFor(() => expect(itemsApi.updateItem).toHaveBeenCalledTimes(1));

      await userEvent.click(screen.getByRole('button', { name: 'go-elsewhere' }));
      expect(await screen.findByText('New item')).toBeInTheDocument();

      rejectUpdate(new ApiError(500, 'INTERNAL_ERROR', 'boom'));
      await act(async () => {});

      expect(screen.queryByText('boom')).not.toBeInTheDocument();
      expect(screen.getByText('New item')).toBeInTheDocument();
    });
  });
});
