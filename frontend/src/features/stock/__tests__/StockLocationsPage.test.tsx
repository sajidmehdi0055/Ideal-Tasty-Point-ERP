import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../lib/api-client';
import { stubMatchMedia } from '../../../test/media';
import * as stockApi from '../api';
import { StockLocationsPage } from '../locations/StockLocationsPage';
import {
  BALANCES,
  FREEZER_1,
  FREEZER_2,
  LOCATIONS,
  LOWER,
  LOWER_FREEZER_B,
  MAIN,
  renderWithSession,
  setRole,
} from './fixtures';

vi.mock('../api');

function renderPage() {
  return renderWithSession(<StockLocationsPage />);
}

function rowFor(name: string) {
  const row = screen.getByText(name, { selector: 'td span span' }).closest('tr');
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

describe('StockLocationsPage (UI-STOCK-002, desktop)', () => {
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

  it('lists stores/kitchens by name with their freezers indented under them, plus items-in-stock counts', async () => {
    renderPage();
    expect(await screen.findByRole('table')).toBeInTheDocument();
    const names = screen.getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell')[0]?.textContent);
    expect(names).toEqual(['Lower Kitchen', 'Lower Kitchen Freezer B', 'Main Store', 'Freezer 1', 'Freezer 2', 'Old Store']);
    // Main Store: oil + rice above zero (sugar is zero) → 2; Freezer 1 → 1; Lower Kitchen → 1.
    expect(within(rowFor('Main Store')).getAllByRole('cell')[3]).toHaveTextContent('2');
    expect(within(rowFor('Freezer 1')).getAllByRole('cell')[3]).toHaveTextContent('1');
    expect(within(rowFor('Freezer 2')).getAllByRole('cell')[3]).toHaveTextContent('0');
    expect(within(rowFor('Freezer 1')).getAllByRole('cell')[2]).toHaveTextContent('Main Store');
    expect(screen.getByText('6 locations · 2 inactive')).toBeInTheDocument();
  });

  it('gives the Owner Rename + Deactivate / Activate and no Owner-only note', async () => {
    renderPage();
    await screen.findByRole('table');
    expect(screen.getByRole('button', { name: 'Deactivate Main Store' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activate Old Store' })).toBeInTheDocument();
    expect(screen.queryByText(/only the owner can activate/i)).not.toBeInTheDocument();
  });

  it('hides Activate/Deactivate for a Manager (not shown disabled) and explains it once (L7)', async () => {
    setRole('MANAGER');
    renderPage();
    await screen.findByRole('table');
    expect(screen.getByText('Only the Owner can activate or deactivate locations')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^deactivate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^activate/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rename Main Store' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New location' })).toBeInTheDocument();
  });

  it('shows the access-denied state for roles other than Owner/Manager, without calling the API', () => {
    setRole('STORE_KEEPER');
    renderPage();
    expect(screen.getByText("You don't have access to Stock Locations")).toBeInTheDocument();
    expect(stockApi.listLocations).not.toHaveBeenCalled();
  });

  it('shows a 403 from the server as a permission message with Try again', async () => {
    vi.mocked(stockApi.listLocations).mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Forbidden'));
    renderPage();
    expect(await screen.findByText(/only owner or manager can view or manage stock/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('filters by name and hides inactive locations when "Show inactive" is unticked', async () => {
    renderPage();
    await screen.findByRole('table');
    expect(screen.getByRole('checkbox', { name: 'Show inactive' })).toBeChecked();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Show inactive' }));
    expect(screen.queryByText('Old Store')).not.toBeInTheDocument();
    expect(screen.queryByText('Lower Kitchen Freezer B')).not.toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search locations by name' }), 'freezer');
    expect(screen.getByText('Freezer 1')).toBeInTheDocument();
    expect(screen.queryByText('Main Store', { selector: 'td span span' })).not.toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('No locations match your search.')).toBeInTheDocument();
  });

  it('shows the empty state with a New location action (L6)', async () => {
    vi.mocked(stockApi.listLocations).mockResolvedValue([]);
    vi.mocked(stockApi.listBalances).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No stock locations yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /new location/i })).toHaveLength(2);
    expect(screen.queryByRole('checkbox', { name: 'Show inactive' })).not.toBeInTheDocument();
  });

  it('creates a freezer: parent is required and only active stores/kitchens are offered (L2)', async () => {
    vi.mocked(stockApi.createLocation).mockResolvedValue(FREEZER_2);
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'New location' }));
    const dialog = screen.getByRole('dialog', { name: 'New location' });

    expect(within(dialog).queryByLabelText(/parent/i)).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create location' }));
    expect(within(dialog).getByText('Enter a name.')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose a type.')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Name'), '  Freezer 3  ');
    await userEvent.click(within(dialog).getByRole('radio', { name: /^Freezer/ }));
    const parent = within(dialog).getByLabelText('Parent (store or kitchen)');
    const options = within(parent).getAllByRole('option').map(option => option.textContent);
    expect(options).toEqual(['Choose a store or kitchen', 'Lower Kitchen', 'Main Store']);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Create location' }));
    expect(within(dialog).getByText(/choose the store or kitchen this freezer sits under/i)).toBeInTheDocument();
    expect(stockApi.createLocation).not.toHaveBeenCalled();

    await userEvent.selectOptions(parent, 'Main Store');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create location' }));
    expect(stockApi.createLocation).toHaveBeenCalledWith({ name: 'Freezer 3', location_type: 'FREEZER', parent_id: MAIN.id });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(stockApi.listLocations).toHaveBeenCalledTimes(2);
  });

  it('creates a store without parent_id and shows a 409 duplicate name inline', async () => {
    vi.mocked(stockApi.createLocation).mockRejectedValue(
      new ApiError(409, 'DUPLICATE_LOCATION_NAME', 'A stock location with this name already exists in this branch'),
    );
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'New location' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Main Store');
    await userEvent.click(within(dialog).getByRole('radio', { name: /^Store/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create location' }));

    expect(stockApi.createLocation).toHaveBeenCalledWith({ name: 'Main Store', location_type: 'STORE' });
    expect(
      await within(dialog).findByText(
        'A location named “Main Store” already exists in this branch. (409 · DUPLICATE_LOCATION_NAME)',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
  });

  it('maps 400 INVALID_PARENT to the Parent field', async () => {
    vi.mocked(stockApi.createLocation).mockRejectedValue(new ApiError(400, 'INVALID_PARENT', 'x'));
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'New location' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Freezer 9');
    await userEvent.click(within(dialog).getByRole('radio', { name: /^Freezer/ }));
    await userEvent.selectOptions(within(dialog).getByLabelText('Parent (store or kitchen)'), 'Lower Kitchen');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create location' }));
    expect(await within(dialog).findByText(/selected parent is no longer available\. \(400 · INVALID_PARENT\)/)).toBeInTheDocument();
  });

  it('renames with type and parent read-only (L3); an unchanged name closes without a request', async () => {
    vi.mocked(stockApi.updateLocation).mockResolvedValue({ ...FREEZER_2, name: 'Freezer Two' });
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Rename Freezer 2' }));
    let dialog = screen.getByRole('dialog', { name: 'Rename “Freezer 2”' });
    expect(within(dialog).getByLabelText('Type')).toHaveValue('Freezer');
    expect(within(dialog).getByLabelText('Type')).toBeDisabled();
    expect(within(dialog).getByLabelText('Parent')).toHaveValue('Main Store');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(stockApi.updateLocation).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Rename Freezer 2' }));
    dialog = screen.getByRole('dialog');
    await userEvent.clear(within(dialog).getByLabelText('Name'));
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Freezer Two');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(stockApi.updateLocation).toHaveBeenCalledWith(FREEZER_2.id, { name: 'Freezer Two' });
  });

  it('deactivates an empty location after confirmation (L4), sending only active=false', async () => {
    vi.mocked(stockApi.updateLocation).mockResolvedValue({ ...FREEZER_2, active: false });
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Freezer 2' }));
    const dialog = screen.getByRole('dialog', { name: 'Deactivate “Freezer 2”?' });
    expect(within(dialog).getByText(/has no stock and no active freezers under it/i)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    expect(stockApi.updateLocation).toHaveBeenCalledWith(FREEZER_2.id, { active: false });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('explains straight away when the loaded data shows stock (L5) — no confirmation, no request', async () => {
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Freezer 1' }));
    const dialog = screen.getByRole('dialog', { name: 'Cannot deactivate “Freezer 1”' });
    expect(within(dialog).getByText(/still holds stock \(1 item\)/i)).toBeInTheDocument();
    expect(within(dialog).getByText('409 · LOCATION_HAS_STOCK')).toBeInTheDocument();
    expect(stockApi.updateLocation).not.toHaveBeenCalled();
  });

  it('explains active freezers under a store before asking (L5 · ACTIVE_CHILDREN)', async () => {
    vi.mocked(stockApi.listBalances).mockResolvedValue([]);
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Main Store' }));
    expect(screen.getByText('409 · LOCATION_HAS_ACTIVE_CHILDREN')).toBeInTheDocument();
    expect(stockApi.updateLocation).not.toHaveBeenCalled();
  });

  it('turns a server 409 (pending transfers) into the Cannot deactivate dialog', async () => {
    vi.mocked(stockApi.updateLocation).mockRejectedValue(new ApiError(409, 'LOCATION_HAS_PENDING_TRANSFERS', 'x'));
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate Freezer 2' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cannot deactivate “Freezer 2”' });
    expect(within(dialog).getByText(/sent transfer to or from this location is not yet received/i)).toBeInTheDocument();
    expect(within(dialog).getByText('409 · LOCATION_HAS_PENDING_TRANSFERS')).toBeInTheDocument();
  });

  it('activates directly and reports 409 PARENT_INACTIVE in a banner', async () => {
    vi.mocked(stockApi.updateLocation).mockRejectedValue(new ApiError(409, 'PARENT_INACTIVE', 'x'));
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: `Activate ${LOWER_FREEZER_B.name}` }));
    expect(stockApi.updateLocation).toHaveBeenCalledWith(LOWER_FREEZER_B.id, { active: true });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't activate Lower Kitchen Freezer B: Activate its parent store or kitchen first. (409 · PARENT_INACTIVE)",
    );
  });

  it('explains a 403 on an active change as Owner-only (client role and server identity can differ)', async () => {
    vi.mocked(stockApi.updateLocation).mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'x'));
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: `Activate ${LOWER_FREEZER_B.name}` }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't activate Lower Kitchen Freezer B: Only the Owner can activate or deactivate locations. (403 · FORBIDDEN)",
    );
  });

  it('cannot be dismissed while a create is in flight (Esc / ✕ ignored, Cancel disabled)', async () => {
    let resolve: (value: typeof FREEZER_2) => void = () => {};
    vi.mocked(stockApi.createLocation).mockReturnValue(new Promise(res => (resolve = res)));
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'New location' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Rented Store 2');
    await userEvent.click(within(dialog).getByRole('radio', { name: /^Store/ }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create location' }));

    expect(within(dialog).getByRole('button', { name: 'Close dialog' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    const cancelEvent = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancelEvent);
    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(stockApi.createLocation).toHaveBeenCalledTimes(1);

    resolve(FREEZER_2);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('marks inactive rows and keeps names readable', async () => {
    renderPage();
    await screen.findByRole('table');
    expect(rowFor(LOWER_FREEZER_B.name)).toHaveClass('opacity-60');
    expect(rowFor(LOWER.name)).not.toHaveClass('opacity-60');
    expect(within(rowFor(FREEZER_1.name)).getByText('Freezer', { selector: 'span' })).toBeInTheDocument();
  });
});

describe('StockLocationsPage (UI-STOCK-002, mobile L8)', () => {
  beforeEach(() => {
    stubMatchMedia({ wide: false });
    vi.mocked(stockApi.listLocations).mockResolvedValue(LOCATIONS);
    vi.mocked(stockApi.listBalances).mockResolvedValue(BALANCES);
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows cards with a ⋮ menu instead of the table', async () => {
    renderPage();
    const menuButton = await screen.findByRole('button', { name: 'Actions for Main Store' });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('2 items')).toBeInTheDocument();
    expect(screen.getAllByText('No stock').length).toBeGreaterThan(0);

    await userEvent.click(menuButton);
    const menu = screen.getByRole('menu', { name: 'Actions for Main Store' });
    expect(within(menu).getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Rename', 'Deactivate']);
    expect(within(menu).getByRole('menuitem', { name: 'Rename' })).toHaveFocus();

    await userEvent.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitem', { name: 'Deactivate' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(menuButton).toHaveFocus();

    await userEvent.click(menuButton);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(screen.getByRole('dialog', { name: 'Rename “Main Store”' })).toBeInTheDocument();
  });

  it('leaves Activate out of the menu while that activation is in flight (no double PATCH)', async () => {
    vi.mocked(stockApi.updateLocation).mockReturnValue(new Promise(() => {}));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: `Actions for ${LOWER_FREEZER_B.name}` }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Activate' }));
    expect(stockApi.updateLocation).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: `Actions for ${LOWER_FREEZER_B.name}` })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: `Actions for ${LOWER_FREEZER_B.name}` }));
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Rename']);
  });

  it('gives a Manager only Rename in the menu', async () => {
    setRole('MANAGER');
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Main Store' }));
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Rename']);
  });
});
