import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../../lib/api-client';
import { ToastProvider } from '../../../../design-system/components';
import { stubMatchMedia } from '../../../../test/media';
import { UomMasterPanel } from '../UomMasterPanel';
import * as uomApi from '../api';
import type { Uom } from '../types';

vi.mock('../api');

const kg: Uom = {
  id: '1',
  name: 'KG',
  unit_type: 'WEIGHT',
  active: true,
  created_at: '2026-09-26T00:00:00Z',
  updated_at: '2026-09-26T00:00:00Z',
};
const liter: Uom = {
  id: '2',
  name: 'LITER',
  unit_type: 'VOLUME',
  active: true,
  created_at: '2026-09-26T00:00:00Z',
  updated_at: '2026-09-26T00:00:00Z',
};

describe('UomMasterPanel', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('shows a loading state, then the live list once units resolve', async () => {
    vi.mocked(uomApi.listUoms).mockResolvedValue([kg, liter]);
    render(<UomMasterPanel />);

    expect(screen.getByText(/loading units/i)).toBeInTheDocument();
    expect(await screen.findByText('KG')).toBeInTheDocument();
    expect(screen.getByText('LITER')).toBeInTheDocument();
    expect(screen.getByText('2 units')).toBeInTheDocument();
  });

  it('shows a real error state instead of silently hiding a non-403 failure', async () => {
    vi.mocked(uomApi.listUoms).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'boom'));
    render(<UomMasterPanel />);

    expect(await screen.findByText('boom')).toBeInTheDocument();
  });

  it('shows an empty state with no units', async () => {
    vi.mocked(uomApi.listUoms).mockResolvedValue([]);
    render(<UomMasterPanel />);

    expect(await screen.findByText('No UOMs yet')).toBeInTheDocument();
    expect(screen.getByText(/add the units you use for items/i)).toBeInTheDocument();
  });

  it('filters the list by name as the user searches', async () => {
    vi.mocked(uomApi.listUoms).mockResolvedValue([kg, liter]);
    render(<UomMasterPanel />);
    await screen.findByText('KG');

    await userEvent.type(screen.getByLabelText(/search units by name/i), 'lit');
    expect(screen.getByText('LITER')).toBeInTheDocument();
    expect(screen.queryByText('KG')).not.toBeInTheDocument();
  });

  it('shows a search-specific empty state when nothing matches', async () => {
    vi.mocked(uomApi.listUoms).mockResolvedValue([kg]);
    render(<UomMasterPanel />);
    await screen.findByText('KG');

    await userEvent.type(screen.getByLabelText(/search units by name/i), 'zzz');
    expect(screen.getByText('No units match your search')).toBeInTheDocument();
  });

  it('creates a new unit and reloads the list', async () => {
    vi.mocked(uomApi.listUoms).mockResolvedValue([kg]);
    vi.mocked(uomApi.createUom).mockResolvedValue({ ...liter, name: 'PACKET', unit_type: 'PACKAGING' });
    render(<UomMasterPanel />);
    await screen.findByText('KG');

    await userEvent.click(screen.getByRole('button', { name: /new unit/i }));
    await userEvent.type(screen.getByLabelText(/^name/i), 'PACKET');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /unit type/i }), 'Packaging');
    await userEvent.click(screen.getByRole('button', { name: /create unit/i }));

    await waitFor(() =>
      expect(uomApi.createUom).toHaveBeenCalledWith({ name: 'PACKET', unit_type: 'PACKAGING' }),
    );
    await waitFor(() => expect(uomApi.listUoms).toHaveBeenCalledTimes(2));
  });

  it('shows a field-level error and banner on a 409 duplicate name', async () => {
    vi.mocked(uomApi.listUoms).mockResolvedValue([kg]);
    vi.mocked(uomApi.createUom).mockRejectedValue(
      new ApiError(409, 'DUPLICATE_UOM_NAME', 'A UOM with this name already exists'),
    );
    render(<UomMasterPanel />);
    await screen.findByText('KG');

    await userEvent.click(screen.getByRole('button', { name: /new unit/i }));
    await userEvent.type(screen.getByLabelText(/^name/i), 'kg');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /unit type/i }), 'Weight');
    await userEvent.click(screen.getByRole('button', { name: /create unit/i }));

    expect(await screen.findByText('Please fix the highlighted fields.')).toBeInTheDocument();
    expect(screen.getByText('A UOM with this name already exists')).toBeInTheDocument();
  });

  it('edits an existing unit, including toggling its active state', async () => {
    vi.mocked(uomApi.listUoms).mockResolvedValue([kg]);
    vi.mocked(uomApi.updateUom).mockResolvedValue({ ...kg, name: 'KILOGRAM' });
    render(<UomMasterPanel />);
    await screen.findByText('KG');

    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    const nameInput = screen.getByLabelText(/^name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'KILOGRAM');
    await userEvent.click(screen.getByRole('switch', { name: /active/i }));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(uomApi.updateUom).toHaveBeenCalledWith('1', { name: 'KILOGRAM', unit_type: 'WEIGHT', active: false }),
    );
  });

  it('deactivates a unit directly from the table row action', async () => {
    vi.mocked(uomApi.listUoms).mockResolvedValue([kg]);
    vi.mocked(uomApi.updateUom).mockResolvedValue({ ...kg, active: false });
    render(<UomMasterPanel />);
    await screen.findByText('KG');

    await userEvent.click(screen.getByRole('button', { name: /deactivate/i }));
    await waitFor(() => expect(uomApi.updateUom).toHaveBeenCalledWith('1', { active: false }));
  });

  it('surfaces an error instead of silently doing nothing when a toggle fails', async () => {
    vi.mocked(uomApi.listUoms).mockResolvedValue([kg]);
    vi.mocked(uomApi.updateUom).mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'boom'));
    render(<UomMasterPanel />);
    await screen.findByText('KG');

    await userEvent.click(screen.getByRole('button', { name: /deactivate/i }));
    expect(await screen.findByText(/couldn't deactivate kg: boom/i)).toBeInTheDocument();
    expect(screen.getByText('KG')).toBeInTheDocument();
  });

  it('shows stored unit names exactly as saved (no display-label mapping)', async () => {
    vi.mocked(uomApi.listUoms).mockResolvedValue([kg, liter]);
    render(<UomMasterPanel />);

    expect(await screen.findByText('LITER')).toBeInTheDocument();
    expect(screen.queryByText('L')).not.toBeInTheDocument();
    expect(screen.queryByText('kg')).not.toBeInTheDocument();
  });

  it('opens the unit dialog at the small (440px) size', async () => {
    vi.mocked(uomApi.listUoms).mockResolvedValue([kg]);
    render(<UomMasterPanel />);
    await screen.findByText('KG');

    await userEvent.click(screen.getByRole('button', { name: /new unit/i }));
    expect(screen.getByRole('dialog', { name: 'New unit' })).toHaveAttribute('data-size', 'small');
  });

  it('closes an untouched dialog on Cancel straight away', async () => {
    vi.mocked(uomApi.listUoms).mockResolvedValue([kg]);
    render(<UomMasterPanel />);
    await screen.findByText('KG');

    await userEvent.click(screen.getByRole('button', { name: /new unit/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'New unit' })).not.toBeInTheDocument();
  });

  it('asks before discarding unsaved changes on Cancel (Keep editing keeps the values)', async () => {
    vi.mocked(uomApi.listUoms).mockResolvedValue([kg]);
    render(<UomMasterPanel />);
    await screen.findByText('KG');

    await userEvent.click(screen.getByRole('button', { name: /new unit/i }));
    await userEvent.type(screen.getByLabelText(/^name/i), 'BOX');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText(/^name/i)).toHaveValue('BOX');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('dialog', { name: 'New unit' })).not.toBeInTheDocument();
    expect(uomApi.createUom).not.toHaveBeenCalled();
  });

  it('shows a success toast after creating a unit (what happened + record, no codes)', async () => {
    vi.mocked(uomApi.listUoms).mockResolvedValue([kg]);
    vi.mocked(uomApi.createUom).mockResolvedValue({ ...liter, name: 'PACKET', unit_type: 'PACKAGING' });
    render(
      <ToastProvider>
        <UomMasterPanel />
      </ToastProvider>,
    );
    await screen.findByText('KG');

    await userEvent.click(screen.getByRole('button', { name: /new unit/i }));
    await userEvent.type(screen.getByLabelText(/^name/i), 'PACKET');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /unit type/i }), 'Packaging');
    await userEvent.click(screen.getByRole('button', { name: /create unit/i }));

    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('Unit created');
    expect(toast).toHaveTextContent('PACKET was added as a packaging unit.');
    expect(screen.queryByRole('dialog', { name: 'New unit' })).not.toBeInTheDocument();
  });

  it('shows a success toast after editing a unit, and keeps a failed save inline in the dialog', async () => {
    vi.mocked(uomApi.listUoms).mockResolvedValue([kg]);
    vi.mocked(uomApi.updateUom)
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'boom'))
      .mockResolvedValueOnce({ ...kg, name: 'KILOGRAM' });
    render(
      <ToastProvider>
        <UomMasterPanel />
      </ToastProvider>,
    );
    await screen.findByText('KG');

    await userEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    const nameInput = screen.getByLabelText(/^name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'KILOGRAM');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    const dialog = screen.getByRole('dialog', { name: 'Edit unit' });
    expect(await within(dialog).findByText('boom')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('Unit updated');
    expect(toast).toHaveTextContent('KILOGRAM was saved.');
  });

  it('shows a success toast after deactivating a unit from the row', async () => {
    vi.mocked(uomApi.listUoms).mockResolvedValue([kg]);
    vi.mocked(uomApi.updateUom).mockResolvedValue({ ...kg, active: false });
    render(
      <ToastProvider>
        <UomMasterPanel />
      </ToastProvider>,
    );
    await screen.findByText('KG');

    await userEvent.click(screen.getByRole('button', { name: /deactivate/i }));
    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('Unit deactivated');
    expect(toast).toHaveTextContent('KG is now inactive.');
  });

  it('locks the required Unit and Actions columns on a desktop; Unit type can be hidden', async () => {
    stubMatchMedia({ hover: true, wide: true });
    vi.mocked(uomApi.listUoms).mockResolvedValue([kg]);
    render(<UomMasterPanel />);
    await screen.findByText('KG');

    await userEvent.click(screen.getByRole('button', { name: /^Columns/ }));
    for (const name of ['Unit', 'Actions']) {
      const box = screen.getByRole('checkbox', { name: `${name} (required, cannot be hidden)` });
      expect(box).toBeChecked();
      expect(box).toBeDisabled();
    }
    await userEvent.click(screen.getByRole('checkbox', { name: /^Unit type/ }));
    expect(screen.queryByRole('columnheader', { name: 'Unit type' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Unit' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
  });
});
