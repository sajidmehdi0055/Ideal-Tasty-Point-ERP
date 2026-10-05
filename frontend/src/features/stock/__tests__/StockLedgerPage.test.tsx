import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../lib/api-client';
import { stubMatchMedia } from '../../../test/media';
import * as stockApi from '../api';
import { StockLedgerPage } from '../ledger/StockLedgerPage';
import type { StockQuery } from '../types';
import {
  BALANCES,
  CHICKEN_F1,
  FREEZER_1,
  LOCATIONS,
  LOWER,
  MAIN,
  OIL_LOWER,
  OIL_MAIN,
  movement,
  renderWithSession,
  setRole,
} from './fixtures';

vi.mock('../api');

const MOVEMENTS = [
  movement('m1', 'item-oil', LOWER, 'TRANSFER_IN', '10.000000', null, '2026-10-03T05:12:00Z'),
  movement('m2', 'item-oil', MAIN, 'TRANSFER_OUT', '-10.000000', null, '2026-10-03T05:05:00Z'),
  movement('m3', 'item-oil', MAIN, 'RECEIPT', '32.000000', null, '2026-09-27T09:05:00Z'),
  movement('m4', 'item-oil', MAIN, 'ADJUSTMENT', '-2.500000', 'Spilled tin', '2026-09-26T13:40:00Z'),
  movement('m5', 'item-oil', MAIN, 'OPENING', '52.500000', null, '2026-09-26T04:00:00Z'),
  movement('m6', 'item-chicken', FREEZER_1, 'TRANSFER_RETURN', '1.000000', null, '2026-09-25T04:00:00Z'),
];

function filterBy<T extends { item_id: string; location_id: string }>(rows: T[], query: StockQuery = {}) {
  return rows.filter(
    row => (!query.item_id || row.item_id === query.item_id) && (!query.location_id || row.location_id === query.location_id),
  );
}

function renderPage() {
  return renderWithSession(<StockLedgerPage />);
}

describe('StockLedgerPage (UI-STOCK-002, desktop)', () => {
  beforeEach(() => {
    stubMatchMedia({ wide: true, hover: true });
    vi.mocked(stockApi.listLocations).mockResolvedValue(LOCATIONS);
    vi.mocked(stockApi.listBalances).mockImplementation(async query => filterBy(BALANCES, query));
    vi.mocked(stockApi.listMovements).mockImplementation(async query => filterBy(MOVEMENTS, query));
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('opens on Balances, grouped by location in tree order with the parent path; zero balances hidden by default (G1)', async () => {
    renderPage();
    expect(await screen.findByRole('tab', { name: 'Balances' })).toHaveAttribute('aria-selected', 'true');
    await screen.findByRole('table');
    const groups = screen.getAllByRole('columnheader').filter(cell => cell.getAttribute('scope') === 'colgroup');
    expect(groups.map(group => group.textContent)).toEqual([
      'Lower Kitchen· 1 item',
      'Main Store· 2 items',
      'Main Store › Freezer 1· 1 item',
    ]);
    expect(screen.queryByText('Sugar')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Hide zero balances' })).toBeChecked();
    expect(screen.getByText(/4 balances shown · 1 zero balance hidden\./)).toBeInTheDocument();
    expect(screen.getByText(/quantity only — no value or cost \(ADR-0008\)/i)).toBeInTheDocument();
    expect(screen.getAllByText('LITER')).toHaveLength(2);
    expect(screen.getByText('38.5')).toBeInTheDocument();
  });

  it('shows zero balances when unticked and filters by item name or code on the client', async () => {
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Hide zero balances' }));
    expect(screen.getByText('Sugar')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search item name or code' }), 'ch-0');
    expect(screen.getByText('Chicken Breast')).toBeInTheDocument();
    expect(screen.queryByText('Basmati Rice')).not.toBeInTheDocument();
    expect(stockApi.listBalances).toHaveBeenCalledTimes(1);
  });

  it('uses the server location filter (location_id)', async () => {
    renderPage();
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Location' }), MAIN.id);
    expect(stockApi.listBalances).toHaveBeenLastCalledWith({ location_id: MAIN.id });
    await waitFor(() => expect(screen.queryByText('Chicken Breast')).not.toBeInTheDocument());
    expect(screen.getByText('Basmati Rice')).toBeInTheDocument();
    const options = within(screen.getByRole('combobox', { name: 'Location' })).getAllByRole('option');
    expect(options.map(option => option.textContent)).toContain('Main Store › Freezer 1');
    expect(options.map(option => option.textContent)).toContain('Old Store (inactive)');
  });

  it('keeps Opening stock disabled with its explanation until the item search exists (G4 / G-1)', async () => {
    renderPage();
    const button = await screen.findByRole('button', { name: 'Opening stock' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Opening stock needs an item search, which is not available yet.');
  });

  it('History opens Movements for that item across all locations, as in the G2 frame', async () => {
    renderPage();
    await screen.findByRole('table');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Location' }), MAIN.id);
    await userEvent.click(await screen.findByRole('button', { name: 'History of Cooking Oil at Main Store' }));

    expect(screen.getByRole('tab', { name: 'Movements' })).toHaveAttribute('aria-selected', 'true');
    expect(stockApi.listMovements).toHaveBeenLastCalledWith({ item_id: 'item-oil' });
    expect(await screen.findByText('Cooking Oil (CO-001)')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Location' })).toHaveValue('');
    expect(await screen.findByText('Balance now: 86.5 LITER (2 locations)')).toBeInTheDocument();

    const table = await screen.findByRole('table');
    expect(within(table).queryByRole('columnheader', { name: 'Item' })).not.toBeInTheDocument();
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(5);
    expect(within(rows[0]!).getByText('03 Oct 2026, 10:12')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Transfer in')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Lower Kitchen')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('\u221210')).toHaveClass('text-danger-700');
    expect(within(rows[2]!).getByText('+32')).toHaveClass('text-success-700');
    expect(within(rows[3]!).getByText('Spilled tin')).toBeInTheDocument();
    expect(within(rows[4]!).getByText('Opening')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Location' }), MAIN.id);
    expect(stockApi.listMovements).toHaveBeenLastCalledWith({ item_id: 'item-oil', location_id: MAIN.id });
    expect(await screen.findByText('Balance now: 72 LITER (1 location)')).toBeInTheDocument();
  });

  it('without an item filter shows every movement with an Item column; the chip can be cleared', async () => {
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'History of Chicken Breast at Main Store › Freezer 1' }));
    await screen.findByText('Chicken Breast (CH-003)');
    await userEvent.click(screen.getByRole('button', { name: 'Clear item filter' }));
    expect(stockApi.listMovements).toHaveBeenLastCalledWith({});

    const table = await screen.findByRole('table');
    await within(table).findByText('Transfer return');
    expect(within(table).getByRole('columnheader', { name: 'Item' })).toBeInTheDocument();
    expect(within(table).getAllByText('Cooking Oil (CO-001)')).toHaveLength(5);
    expect(within(table).getByText('Main Store › Freezer 1')).toBeInTheDocument();
    expect(screen.queryByText(/balance now/i)).not.toBeInTheDocument();
  });

  it('supports arrow keys between the tabs', async () => {
    renderPage();
    const balancesTab = await screen.findByRole('tab', { name: 'Balances' });
    balancesTab.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Movements' })).toHaveFocus();
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', screen.getByRole('tab', { name: 'Movements' }).id);
  });

  it('shows the empty state when no stock exists at all (G6)', async () => {
    vi.mocked(stockApi.listBalances).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No stock recorded yet')).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Opening stock' })).toBeDisabled();
  });

  it('shows the access-denied state for other roles, and a 401 read as "not signed in"', async () => {
    setRole('STAFF');
    const { unmount } = renderPage();
    expect(screen.getByText("You don't have access to the Stock Ledger")).toBeInTheDocument();
    expect(stockApi.listLocations).not.toHaveBeenCalled();
    unmount();

    window.localStorage.clear();
    vi.mocked(stockApi.listLocations).mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    renderPage();
    expect(await screen.findByText(/not signed in — sign-in is not implemented yet/i)).toBeInTheDocument();
  });

  it('shows a balances read error with Try again that re-reads', async () => {
    vi.mocked(stockApi.listBalances).mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'Operation failed'));
    renderPage();
    expect(await screen.findByText('Operation failed')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
});

describe('Adjust stock dialog (G3 / G5)', () => {
  beforeEach(() => {
    stubMatchMedia({ wide: true, hover: true });
    vi.mocked(stockApi.listLocations).mockResolvedValue(LOCATIONS);
    vi.mocked(stockApi.listBalances).mockImplementation(async query => filterBy(BALANCES, query));
    vi.mocked(stockApi.listMovements).mockImplementation(async query => filterBy(MOVEMENTS, query));
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  async function openAdjust(name = 'Adjust Cooking Oil at Main Store') {
    renderPage();
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name }));
    return screen.getByRole('dialog', { name: 'Adjust stock' });
  }

  it('summarises the row and previews the balance after saving with exact decimals', async () => {
    const dialog = await openAdjust();
    expect(within(dialog).getByText('Cooking Oil · CO-001')).toBeInTheDocument();
    expect(within(dialog).getByText('72 LITER', { selector: 'dd' })).toBeInTheDocument();
    const preview = within(dialog).getByTestId('adjust-preview');
    expect(preview).toHaveTextContent('72 LITER—');

    await userEvent.click(within(dialog).getByRole('radio', { name: 'Decrease' }));
    await userEvent.type(within(dialog).getByLabelText('Quantity (LITER)'), '2.5');
    expect(preview).toHaveTextContent('72 LITER69.5 LITER');
    expect(preview).toHaveClass('bg-canvas-sunken');

    await userEvent.click(within(dialog).getByRole('radio', { name: 'Increase' }));
    expect(preview).toHaveTextContent('74.5 LITER');

    await userEvent.click(within(dialog).getByRole('radio', { name: 'Decrease' }));
    await userEvent.clear(within(dialog).getByLabelText('Quantity (LITER)'));
    await userEvent.type(within(dialog).getByLabelText('Quantity (LITER)'), '80');
    expect(preview).toHaveTextContent('−8 LITER');
    expect(preview).toHaveClass('bg-danger-50');
  });

  it('validates on the client: direction, quantity shape, reason required, 500 limit', async () => {
    const dialog = await openAdjust();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save adjustment' }));
    expect(within(dialog).getByText('Choose Increase or Decrease.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a quantity.')).toBeInTheDocument();
    expect(within(dialog).getByText('A reason is required.')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Quantity (LITER)'), '1.1234567');
    await userEvent.type(within(dialog).getByLabelText('Reason (required)'), '   ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save adjustment' }));
    expect(within(dialog).getByText(/up to 6 decimals, e\.g\. 2\.5/)).toBeInTheDocument();
    expect(within(dialog).getByText('A reason is required.')).toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText('Quantity (LITER)'));
    await userEvent.type(within(dialog).getByLabelText('Quantity (LITER)'), '0');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save adjustment' }));
    expect(within(dialog).getByText('Quantity must be above zero.')).toBeInTheDocument();

    const reason = within(dialog).getByLabelText('Reason (required)');
    await userEvent.clear(reason);
    await userEvent.click(reason);
    await userEvent.paste('x'.repeat(501));
    expect(within(dialog).getByText('501 / 500')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save adjustment' }));
    expect(within(dialog).getByText('Use at most 500 characters.')).toBeInTheDocument();
    expect(stockApi.createAdjustment).not.toHaveBeenCalled();
  });

  it('counts the reason after trimming, like the server (500 + trailing spaces is allowed)', async () => {
    vi.mocked(stockApi.createAdjustment).mockResolvedValue(
      movement('new', 'item-oil', MAIN, 'ADJUSTMENT', '1.000000', 'x', '2026-10-05T08:00:00Z'),
    );
    const dialog = await openAdjust();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Increase' }));
    await userEvent.type(within(dialog).getByLabelText('Quantity (LITER)'), '1');
    await userEvent.click(within(dialog).getByLabelText('Reason (required)'));
    await userEvent.paste(`${'y'.repeat(500)}   `);
    expect(within(dialog).getByText('500 / 500')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save adjustment' }));
    expect(stockApi.createAdjustment).toHaveBeenCalledWith(expect.objectContaining({ reason: 'y'.repeat(500) }));
  });

  it('sends a signed decimal-string delta and a trimmed reason, then reloads and confirms', async () => {
    vi.mocked(stockApi.createAdjustment).mockResolvedValue(
      movement('new', 'item-oil', MAIN, 'ADJUSTMENT', '-2.500000', 'Spilled tin', '2026-10-05T08:00:00Z'),
    );
    const dialog = await openAdjust();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Decrease' }));
    await userEvent.type(within(dialog).getByLabelText('Quantity (LITER)'), ' 2.5 ');
    await userEvent.type(within(dialog).getByLabelText('Reason (required)'), '  Spilled tin  ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save adjustment' }));

    expect(stockApi.createAdjustment).toHaveBeenCalledWith({
      item_id: 'item-oil',
      location_id: MAIN.id,
      quantity_delta: '-2.5',
      reason: 'Spilled tin',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent(
      'Adjustment saved — Cooking Oil at Main Store: −2.5 LITER (05 Oct 2026, 13:00).',
    );
    await waitFor(() => expect(stockApi.listBalances).toHaveBeenCalledTimes(2));
  });

  it('shows 409 NEGATIVE_BALANCE inline under Quantity (G5)', async () => {
    vi.mocked(stockApi.createAdjustment).mockRejectedValue(new ApiError(409, 'NEGATIVE_BALANCE', 'x'));
    const dialog = await openAdjust();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Decrease' }));
    await userEvent.type(within(dialog).getByLabelText('Quantity (LITER)'), '80');
    await userEvent.type(within(dialog).getByLabelText('Reason (required)'), 'Monthly count correction');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save adjustment' }));
    expect(
      await within(dialog).findByText(
        'Not enough stock: Main Store has 72 LITER of Cooking Oil. A balance cannot go below zero. (409 · NEGATIVE_BALANCE)',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Quantity (LITER)')).toHaveAttribute('aria-invalid', 'true');
  });

  it.each([
    ['LOCATION_INACTIVE', /Main Store is inactive — stock cannot be recorded there\. \(409 · LOCATION_INACTIVE\)/],
    ['ITEM_INACTIVE', /Cooking Oil is inactive — stock cannot be recorded for it\. \(409 · ITEM_INACTIVE\)/],
    ['NOT_FOUND', /no longer exists — refresh the page/],
  ])('shows %s as a form-level message', async (code, text) => {
    vi.mocked(stockApi.createAdjustment).mockRejectedValue(new ApiError(code === 'NOT_FOUND' ? 404 : 409, code, 'x'));
    const dialog = await openAdjust();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Increase' }));
    await userEvent.type(within(dialog).getByLabelText('Quantity (LITER)'), '1');
    await userEvent.type(within(dialog).getByLabelText('Reason (required)'), 'Found a tin');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save adjustment' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(text);
  });

  it('maps a 400 VALIDATION_ERROR to the fields', async () => {
    vi.mocked(stockApi.createAdjustment).mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'The request was invalid.', [{ path: ['reason'], message: 'Too long' }]),
    );
    const dialog = await openAdjust('Adjust Chicken Breast at Main Store › Freezer 1');
    expect(within(dialog).getByText('Main Store › Freezer 1')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Increase' }));
    await userEvent.type(within(dialog).getByLabelText('Quantity (KG)'), '1');
    await userEvent.type(within(dialog).getByLabelText('Reason (required)'), 'Recount');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save adjustment' }));
    expect(await within(dialog).findByText('Too long')).toBeInTheDocument();
    expect(CHICKEN_F1.location_id).toBe(FREEZER_1.id);
  });
});

describe('StockLedgerPage (UI-STOCK-002, mobile G7)', () => {
  beforeEach(() => {
    stubMatchMedia({ wide: false });
    vi.mocked(stockApi.listLocations).mockResolvedValue(LOCATIONS);
    vi.mocked(stockApi.listBalances).mockImplementation(async query => filterBy(BALANCES, query));
    vi.mocked(stockApi.listMovements).mockImplementation(async query => filterBy(MOVEMENTS, query));
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows balance cards with History / Adjust in a ⋮ menu, and movements as cards', async () => {
    renderPage();
    const menuButton = await screen.findByRole('button', { name: 'Actions for Cooking Oil at Lower Kitchen' });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Opening stock' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Main Store › Freezer 1' })).toBeInTheDocument();

    await userEvent.click(menuButton);
    await userEvent.click(screen.getByRole('menuitem', { name: 'History' }));
    expect(stockApi.listMovements).toHaveBeenLastCalledWith({ item_id: OIL_LOWER.item_id });
    expect(await screen.findByText('Transfer in')).toBeInTheDocument();
    expect(screen.getByText('+10')).toBeInTheDocument();
    expect(OIL_MAIN.location_id).toBe(MAIN.id);
  });
});
