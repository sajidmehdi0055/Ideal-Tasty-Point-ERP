import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../../../../lib/api-client';
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
    await userEvent.selectOptions(screen.getByLabelText(/unit type/i), 'Packaging');
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
    await userEvent.selectOptions(screen.getByLabelText(/unit type/i), 'Weight');
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
});
