import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '../../../../design-system/components';
import { ApiError } from '../../../../lib/api-client';
import { stubMatchMedia } from '../../../../test/media';
import * as stockApi from '../../api';
import { BALANCES, FREEZER_2, LOCATIONS, LOWER_FREEZER_B, MAIN, renderWithSession } from '../../__tests__/fixtures';
import { StockLocationsPage } from '../StockLocationsPage';

vi.mock('../../api');

function renderPage() {
  return renderWithSession(
    <ToastProvider>
      <StockLocationsPage />
    </ToastProvider>,
  );
}

function tileValue(label: string) {
  const tiles = screen.getByLabelText('Locations summary');
  const term = within(tiles).getByText(label, { selector: 'dt' });
  const tile = term.parentElement;
  if (!tile) throw new Error(`no tile ${label}`);
  const [value, note] = within(tile).getAllByRole('definition');
  return { value: value?.textContent, note: note?.textContent };
}

describe('StockLocationsPage — Direction A refresh (UI-REFRESH-001)', () => {
  beforeEach(() => {
    stubMatchMedia({ wide: true, hover: true });
    vi.mocked(stockApi.listLocations).mockResolvedValue(LOCATIONS);
    vi.mocked(stockApi.listBalances).mockResolvedValue(BALANCES);
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows the page intro and summary tiles computed from the loaded locations (inactive included)', async () => {
    renderPage();
    await screen.findByRole('table');
    expect(screen.getByRole('heading', { name: 'Stores, kitchens and freezers' })).toBeInTheDocument();
    // 6 locations: Main Store, Old Store (inactive) · Lower Kitchen · Freezer 1, Freezer 2, Lower Kitchen Freezer B (inactive).
    expect(tileValue('Locations')).toEqual({ value: '6', note: '2 inactive' });
    expect(tileValue('Stores').value).toBe('2');
    expect(tileValue('Kitchens').value).toBe('1');
    expect(tileValue('Freezers').value).toBe('3');
  });

  it('counts shown rows against all locations in the result count', async () => {
    renderPage();
    await screen.findByRole('table');
    expect(screen.getByText('6 locations')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Show inactive' }));
    expect(screen.getByText('4 of 6 locations')).toBeInTheDocument();
  });

  it('keeps Location and Actions locked in the Columns menu; an optional column can be hidden', async () => {
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: /^Columns/ }));
    const panel = screen.getByRole('dialog', { name: 'Show columns' });
    expect(within(panel).getByRole('checkbox', { name: /^Location/ })).toBeDisabled();
    expect(within(panel).getByRole('checkbox', { name: /^Actions/ })).toBeDisabled();
    for (const label of ['Type', 'Parent', 'Items in stock', 'Status']) {
      expect(within(panel).getByRole('checkbox', { name: label })).toBeEnabled();
    }
    await userEvent.click(within(panel).getByRole('checkbox', { name: 'Parent' }));
    expect(screen.queryByRole('columnheader', { name: 'Parent' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Location' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
    // Remaining cells still line up with the remaining headers.
    expect(screen.getAllByRole('row')[1]?.querySelectorAll('td')).toHaveLength(5);
  });

  it('focuses the search with "/"', async () => {
    renderPage();
    await screen.findByRole('table');
    await userEvent.keyboard('/');
    expect(screen.getByRole('searchbox', { name: 'Search locations by name' })).toHaveFocus();
  });

  it('uses the medium dialog for New location / Rename and the small one for Deactivate / Cannot deactivate', async () => {
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'New location' }));
    expect(screen.getByRole('dialog', { name: 'New location' })).toHaveAttribute('data-size', 'medium');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await userEvent.click(screen.getByRole('button', { name: 'Rename Main Store' }));
    expect(screen.getByRole('dialog', { name: 'Rename “Main Store”' })).toHaveAttribute('data-size', 'medium');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Freezer 2' }));
    expect(screen.getByRole('dialog', { name: 'Deactivate “Freezer 2”?' })).toHaveAttribute('data-size', 'small');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Main Store' }));
    expect(screen.getByRole('dialog', { name: 'Cannot deactivate “Main Store”' })).toHaveAttribute('data-size', 'small');
  });

  it('asks before discarding a started New location; an untouched form closes straight away', async () => {
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'New location' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'New location' }));
    const dialog = screen.getByRole('dialog', { name: 'New location' });
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Rented Store');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(within(dialog).getByText('Discard unsaved changes?')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Rented Store');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Close dialog' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(stockApi.createLocation).not.toHaveBeenCalled();
  });

  it('shows a success toast after create (record + change, no codes)', async () => {
    vi.mocked(stockApi.createLocation).mockResolvedValue(FREEZER_2);
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'New location' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Freezer 3');
    await userEvent.click(within(dialog).getByRole('radio', { name: /^Freezer/ }));
    await userEvent.selectOptions(within(dialog).getByLabelText('Parent (store or kitchen)'), MAIN.name);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create location' }));

    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('Location created');
    expect(toast).toHaveTextContent('Freezer 3 · Freezer under Main Store');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows success toasts after rename, deactivate and activate', async () => {
    vi.mocked(stockApi.updateLocation).mockResolvedValue(FREEZER_2);
    renderPage();
    await screen.findByRole('table');

    await userEvent.click(screen.getByRole('button', { name: 'Rename Freezer 2' }));
    const name = within(screen.getByRole('dialog')).getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Freezer Two');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Location renamed')).toBeInTheDocument();
    expect(screen.getByText('Freezer 2 → Freezer Two')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Freezer 2' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByText('Location deactivated')).toBeInTheDocument();
    expect(screen.getByText('Freezer 2 · Active → Inactive')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: `Activate ${LOWER_FREEZER_B.name}` }));
    expect(await screen.findByText('Location activated')).toBeInTheDocument();
    expect(screen.getByText(`${LOWER_FREEZER_B.name} · Inactive → Active`)).toBeInTheDocument();
  });

  it('keeps a dialog error inline (no toast) when the write fails', async () => {
    vi.mocked(stockApi.updateLocation).mockRejectedValue(new ApiError(500, 'INTERNAL', 'The server did not answer.'));
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Freezer 2' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('The server did not answer.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows skeleton rows while loading, with no tiles yet', () => {
    vi.mocked(stockApi.listLocations).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getAllByTestId('skeleton-row').length).toBeGreaterThan(0);
    expect(screen.getByText('Loading locations…')).toBeInTheDocument();
    expect(screen.queryByLabelText('Locations summary')).not.toBeInTheDocument();
  });

  it('shows the error state (plain reason, data is safe, Try again reloads)', async () => {
    vi.mocked(stockApi.listLocations).mockRejectedValueOnce(new ApiError(500, 'INTERNAL', 'The server did not answer.'));
    renderPage();
    expect(await screen.findByText("Couldn't load stock locations")).toBeInTheDocument();
    expect(screen.getByText('The server did not answer.')).toBeInTheDocument();
    expect(screen.getByText('Your data is safe — nothing was changed.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(stockApi.listLocations).toHaveBeenCalledTimes(2);
  });

  it('shows the empty state with zero tiles and a New location action', async () => {
    vi.mocked(stockApi.listLocations).mockResolvedValue([]);
    vi.mocked(stockApi.listBalances).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No stock locations yet')).toBeInTheDocument();
    expect(tileValue('Locations')).toEqual({ value: '0', note: '0 inactive' });
    const buttons = screen.getAllByRole('button', { name: 'New location' });
    await userEvent.click(buttons[buttons.length - 1]!);
    expect(screen.getByRole('dialog', { name: 'New location' })).toBeInTheDocument();
  });
});
