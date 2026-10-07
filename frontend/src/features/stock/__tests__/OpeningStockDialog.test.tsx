import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../lib/api-client';
import { stubMatchMedia } from '../../../test/media';
import * as itemsApi from '../../items/api';
import type { Item } from '../../items/types';
import * as stockApi from '../api';
import { ITEM_PICKER_LIMIT } from '../ledger/ItemPicker';
import { StockLedgerPage } from '../ledger/StockLedgerPage';
import { BALANCES, FREEZER_2, LOCATIONS, movement, renderWithProviders } from './fixtures';

vi.mock('../api');
vi.mock('../../items/api');

function item(id: string, name: string, code: string, uom: string): Item {
  return {
    id,
    item_code: code,
    item_name: name,
    primary_item_type: 'RAW_MATERIAL',
    base_uom: uom,
    brand: 'Generic / No Brand',
    branch_id: 'branch-main',
    active: true,
    created_at: '2026-09-26T00:00:00Z',
    updated_at: '2026-09-26T00:00:00Z',
  };
}

const OIL = item('item-oil', 'Cooking Oil', 'CO-001', 'LITER');
const RICE = item('item-rice', 'Basmati Rice', 'RC-001', 'KG');
const ITEMS = [RICE, OIL];

async function openDialog() {
  renderWithProviders(<StockLedgerPage />);
  await screen.findByRole('table');
  await userEvent.click(screen.getByRole('button', { name: 'Opening stock' }));
  return screen.getByRole('dialog', { name: 'Opening stock' });
}

async function pickItem(dialog: HTMLElement, search: string, name: string) {
  const input = within(dialog).getByRole('combobox', { name: 'Item' });
  await userEvent.type(input, search);
  await userEvent.click(await within(dialog).findByRole('option', { name: new RegExp(name) }));
}

async function fillForm(dialog: HTMLElement, quantity = '12') {
  await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Location' }), FREEZER_2.id);
  await pickItem(dialog, 'oil', 'Cooking Oil');
  await userEvent.type(within(dialog).getByLabelText('Quantity (L)'), quantity);
}

describe('Opening stock dialog (UI-STOCK-003, G4)', () => {
  beforeEach(() => {
    stubMatchMedia({ wide: true, hover: true });
    vi.mocked(stockApi.listLocations).mockResolvedValue(LOCATIONS);
    vi.mocked(stockApi.listBalances).mockResolvedValue(BALANCES);
    vi.mocked(stockApi.listMovements).mockResolvedValue([]);
    vi.mocked(itemsApi.listItems).mockImplementation(async query => {
      const term = (query?.search ?? '').toLowerCase();
      const items = ITEMS.filter(
        entry => entry.item_name.toLowerCase().includes(term) || entry.item_code.toLowerCase().includes(term),
      );
      return { items, truncated: false };
    });
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows the G4 form: active locations only (freezers as "Freezer 2 · Main Store"), item picker, base-unit quantity, note', async () => {
    const dialog = await openDialog();
    const options = within(within(dialog).getByRole('combobox', { name: 'Location' })).getAllByRole('option');
    expect(options.map(option => option.textContent)).toEqual([
      'Choose a location',
      'Lower Kitchen',
      'Main Store',
      'Freezer 1 · Main Store',
      'Freezer 2 · Main Store',
    ]);
    expect(within(dialog).getByText('Active locations only.')).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: 'Item' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(dialog).getByLabelText('Quantity (base unit)')).toBeInTheDocument();
    expect(within(dialog).getByText(/entered once per item and location/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/not available yet/i)).not.toBeInTheDocument();
    expect(itemsApi.listItems).not.toHaveBeenCalled();
  });

  it('searches active items on the server (search, active=true, limit) and picks one with the keyboard', async () => {
    vi.mocked(stockApi.createOpening).mockResolvedValue(
      movement('new', OIL.id, FREEZER_2, 'OPENING', '5.000000', null, '2026-10-05T08:00:00Z'),
    );
    const dialog = await openDialog();
    // Location and quantity are filled, so a form submit would really save — Enter in the picker must not.
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Location' }), FREEZER_2.id);
    await userEvent.type(within(dialog).getByLabelText('Quantity (base unit)'), '5');
    const input = within(dialog).getByRole('combobox', { name: 'Item' });
    await userEvent.click(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(await within(dialog).findByRole('option', { name: /Basmati Rice/ })).toBeInTheDocument();
    expect(itemsApi.listItems).toHaveBeenLastCalledWith({ search: '', active: true, limit: ITEM_PICKER_LIMIT });

    await userEvent.type(input, 'oil');
    await waitFor(() =>
      expect(itemsApi.listItems).toHaveBeenLastCalledWith({ search: 'oil', active: true, limit: ITEM_PICKER_LIMIT }),
    );
    // Debounced: one request for the typed term, not one per keystroke.
    expect(vi.mocked(itemsApi.listItems).mock.calls.map(([query]) => query?.search)).toEqual(['', 'oil']);
    const option = await within(dialog).findByRole('option', { name: /Cooking Oil/ });
    expect(option).toHaveTextContent(/CO-001 · L$/);
    expect(option).not.toHaveTextContent('LITER');
    expect(within(dialog).queryByRole('option', { name: /Basmati Rice/ })).not.toBeInTheDocument();

    await userEvent.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-activedescendant', option.id);
    await userEvent.keyboard('{Enter}');
    expect(input).toHaveValue('Cooking Oil · CO-001');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(within(dialog).getByLabelText('Quantity (L)')).toBeInTheDocument();
    // Owner decision 2026-10-08: display label in the dialog, never the stored code.
    expect(dialog).not.toHaveTextContent('LITER');
    expect(stockApi.createOpening).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Opening stock' })).toBeInTheDocument();
  });

  it('ignores a slower answer for an older search term (stale response)', async () => {
    let resolveOld: (page: itemsApi.ItemListResult) => void = () => undefined;
    vi.mocked(itemsApi.listItems).mockImplementation(query => {
      if (query?.search === 'r') return new Promise(done => (resolveOld = done));
      return Promise.resolve({ items: [OIL], truncated: false });
    });
    const dialog = await openDialog();
    const input = within(dialog).getByRole('combobox', { name: 'Item' });
    await userEvent.type(input, 'r');
    await waitFor(() => expect(itemsApi.listItems).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'r' })));
    await userEvent.type(input, 'oil');
    expect(await within(dialog).findByRole('option', { name: /Cooking Oil/ })).toBeInTheDocument();
    resolveOld({ items: [RICE], truncated: true });
    await new Promise(done => setTimeout(done, 50));
    expect(within(dialog).queryByRole('option', { name: /Basmati Rice/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Showing the first/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: /Cooking Oil/ })).toBeInTheDocument();
  });

  it('never sends a search term longer than the server limit (100), even from a long picked label', async () => {
    const longItem = item('item-long', 'L'.repeat(120), 'LG-001', 'KG');
    vi.mocked(itemsApi.listItems).mockResolvedValue({ items: [longItem], truncated: false });
    const dialog = await openDialog();
    const input = within(dialog).getByRole('combobox', { name: 'Item' });
    await userEvent.click(input);
    await userEvent.click(await within(dialog).findByRole('option', { name: /LG-001/ }));
    await userEvent.type(input, '{Backspace}');
    await waitFor(() => expect(vi.mocked(itemsApi.listItems).mock.calls.length).toBeGreaterThan(1));
    for (const [query] of vi.mocked(itemsApi.listItems).mock.calls) {
      expect((query?.search ?? '').length).toBeLessThanOrEqual(100);
    }
  });

  it('asks the user to refine the search when the server truncated the list (X-Result-Truncated)', async () => {
    vi.mocked(itemsApi.listItems).mockResolvedValue({ items: ITEMS, truncated: true });
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Item' }));
    expect(
      await within(dialog).findByText('Showing the first 2 matches — type more of the name or code to narrow the search.'),
    ).toBeInTheDocument();
  });

  it('says when nothing matches, and offers Retry when the item list fails', async () => {
    const dialog = await openDialog();
    const input = within(dialog).getByRole('combobox', { name: 'Item' });
    await userEvent.type(input, 'zzz');
    expect(await within(dialog).findByText('No active item matches “zzz”.')).toBeInTheDocument();

    vi.mocked(itemsApi.listItems).mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'Operation failed'));
    await userEvent.clear(input);
    await userEvent.type(input, 'ric');
    expect(await within(dialog).findByText('Could not load items: Operation failed')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));
    expect(await within(dialog).findByRole('option', { name: /Basmati Rice/ })).toBeInTheDocument();
  });

  it('Escape closes the item list but keeps the dialog open', async () => {
    const dialog = await openDialog();
    const input = within(dialog).getByRole('combobox', { name: 'Item' });
    await userEvent.click(input);
    await within(dialog).findByRole('option', { name: /Cooking Oil/ });
    await userEvent.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('dialog', { name: 'Opening stock' })).toBeInTheDocument();
  });

  it('validates on the client: location, item and quantity', async () => {
    const dialog = await openDialog();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save opening stock' }));
    expect(within(dialog).getByText('Choose a location.')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose an item.')).toBeInTheDocument();
    expect(within(dialog).getByText('Enter a quantity.')).toBeInTheDocument();

    await userEvent.type(within(dialog).getByLabelText('Quantity (base unit)'), '0');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save opening stock' }));
    expect(within(dialog).getByText('Quantity must be above zero.')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Quantity (base unit)'), '.1234567');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save opening stock' }));
    expect(within(dialog).getByText(/up to 6 decimals, e\.g\. 2\.5/)).toBeInTheDocument();
    expect(stockApi.createOpening).not.toHaveBeenCalled();
  });

  it('saves a decimal-string quantity, closes, re-reads balances and confirms in one line', async () => {
    vi.mocked(stockApi.createOpening).mockResolvedValue(
      movement('new', OIL.id, FREEZER_2, 'OPENING', '12.500000', null, '2026-10-05T08:00:00Z'),
    );
    const dialog = await openDialog();
    await fillForm(dialog, ' 12.5 ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save opening stock' }));

    expect(stockApi.createOpening).toHaveBeenCalledWith({ item_id: OIL.id, location_id: FREEZER_2.id, quantity: '12.5' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Success toast (Figma R5): what happened + record and change, no codes.
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Opening stock saved');
    expect(toast).toHaveTextContent('Cooking Oil · Main Store › Freezer 2 · +12.5 L');
    await waitFor(() => expect(stockApi.listBalances).toHaveBeenCalledTimes(2));
  });

  const serverErrors: [string, ApiError, 'Item' | 'Location' | 'Quantity' | 'form', RegExp][] = [
    [
      '409 STOCK_HISTORY_EXISTS',
      new ApiError(409, 'STOCK_HISTORY_EXISTS', 'x'),
      'Item',
      /Cooking Oil already has stock entries at Main Store › Freezer 2 — opening stock must be the first entry there\. Use Adjust on its balance row instead\. \(409 · STOCK_HISTORY_EXISTS\)/,
    ],
    [
      '409 OPENING_ALREADY_EXISTS',
      new ApiError(409, 'OPENING_ALREADY_EXISTS', 'x'),
      'Item',
      /Opening stock for Cooking Oil at Main Store › Freezer 2 already exists\. Use Adjust .*\(409 · OPENING_ALREADY_EXISTS\)/,
    ],
    [
      '409 ITEM_INACTIVE',
      new ApiError(409, 'ITEM_INACTIVE', 'x'),
      'Item',
      /Cooking Oil is inactive — stock cannot be recorded for it\. \(409 · ITEM_INACTIVE\)/,
    ],
    [
      '409 LOCATION_INACTIVE',
      new ApiError(409, 'LOCATION_INACTIVE', 'x'),
      'Location',
      /Main Store › Freezer 2 is inactive — stock cannot be recorded there\. \(409 · LOCATION_INACTIVE\)/,
    ],
    [
      '400 VALIDATION_ERROR',
      new ApiError(400, 'VALIDATION_ERROR', 'x', [{ path: ['quantity'], message: 'quantity must be greater than 0' }]),
      'Quantity',
      /quantity must be greater than 0/,
    ],
    ['401', new ApiError(401, 'UNAUTHENTICATED', 'x'), 'form', /Not signed in/],
    ['403', new ApiError(403, 'FORBIDDEN', 'x'), 'form', /only Owner or Manager/],
    [
      '404 NOT_FOUND',
      new ApiError(404, 'NOT_FOUND', 'x'),
      'form',
      /The item or location no longer exists — close this dialog, refresh and choose again\. \(404 · NOT_FOUND\)/,
    ],
  ];

  it.each(serverErrors)('maps %s to the UI and keeps the dialog open', async (_label, error, target, text) => {
    vi.mocked(stockApi.createOpening).mockRejectedValue(error);
    const dialog = await openDialog();
    await fillForm(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save opening stock' }));

    const message = await within(dialog).findByText(text);
    expect(screen.getByRole('dialog', { name: 'Opening stock' })).toBeInTheDocument();
    if (target === 'form') {
      expect(message.closest('[role="alert"]')).toBeInTheDocument();
    } else {
      const field =
        target === 'Item'
          ? within(dialog).getByRole('combobox', { name: 'Item' })
          : target === 'Location'
            ? within(dialog).getByRole('combobox', { name: 'Location' })
            : within(dialog).getByLabelText('Quantity (L)');
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field).toHaveAccessibleDescription(text);
    }
    expect(within(dialog).getByRole('button', { name: 'Save opening stock' })).toBeEnabled();
  });

  it('clears a pair error when the item or location changes', async () => {
    vi.mocked(stockApi.createOpening).mockRejectedValue(new ApiError(409, 'STOCK_HISTORY_EXISTS', 'x'));
    const dialog = await openDialog();
    await fillForm(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save opening stock' }));
    await within(dialog).findByText(/STOCK_HISTORY_EXISTS/);
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Location' }), 'loc-lower');
    expect(within(dialog).queryByText(/STOCK_HISTORY_EXISTS/)).not.toBeInTheDocument();
  });

  it('cannot be dismissed while saving', async () => {
    let resolve: (value: ReturnType<typeof movement>) => void = () => undefined;
    vi.mocked(stockApi.createOpening).mockReturnValue(new Promise(done => (resolve = done)));
    const dialog = await openDialog();
    await fillForm(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save opening stock' }));
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Close dialog' })).toBeDisabled();
    expect(within(dialog).getByRole('combobox', { name: 'Item' })).toBeDisabled();
    resolve(movement('new', OIL.id, FREEZER_2, 'OPENING', '12.000000', null, '2026-10-05T08:00:00Z'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('uses theme tokens only, so it renders correctly in Dark mode (no raw colours or palette classes)', async () => {
    vi.mocked(stockApi.createOpening).mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'x'));
    const dialog = await openDialog();
    await fillForm(dialog);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save opening stock' }));
    await within(dialog).findByText(/no longer exists/);
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Item' }));
    await within(dialog).findByRole('option', { name: /Cooking Oil/ });

    const forbidden =
      /(^|\s)(?:[a-z-]+:)*(?:bg|text|border|ring|from|to|via|fill|stroke|outline|shadow)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})(?=\s|$)|\[#|#[0-9a-f]{3,8}\b|rgb\(/i;
    const offenders = [dialog, ...dialog.querySelectorAll('*')]
      .map(element => element.getAttribute('class') ?? '')
      .filter(className => forbidden.test(className));
    expect(offenders).toEqual([]);
    expect([...dialog.querySelectorAll('[style]')]).toEqual([]);
  });
});

describe('Opening stock dialog — Direction A refresh (UI-REFRESH-001)', () => {
  beforeEach(() => {
    stubMatchMedia({ wide: true, hover: true });
    vi.mocked(stockApi.listLocations).mockResolvedValue(LOCATIONS);
    vi.mocked(stockApi.listBalances).mockResolvedValue(BALANCES);
    vi.mocked(stockApi.listMovements).mockResolvedValue([]);
    vi.mocked(itemsApi.listItems).mockResolvedValue({ items: ITEMS, truncated: false });
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('is a medium (640px) dialog; Cancel asks before discarding a filled form', async () => {
    let dialog = await openDialog();
    expect(dialog).toHaveAttribute('data-size', 'medium');
    expect(dialog).toHaveClass('md:max-w-[640px]');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Opening stock' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Opening stock' }));
    dialog = screen.getByRole('dialog', { name: 'Opening stock' });
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Location' }), FREEZER_2.id);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(within(dialog).getByText('Discard unsaved changes?')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('dialog', { name: 'Opening stock' })).not.toBeInTheDocument();
    expect(stockApi.createOpening).not.toHaveBeenCalled();
  });
});
