import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemForm } from '../ItemForm';
import { GENERIC_BRAND } from '../../types';

describe('ItemForm', () => {
  it('blocks submit and shows field errors when required fields are blank', async () => {
    const onSubmit = vi.fn();
    render(<ItemForm mode="create" submitting={false} onSubmit={onSubmit} onCancel={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /create item/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(await screen.findByText('Select a primary item type')).toBeInTheDocument();
    expect(screen.getAllByText('Required').length).toBeGreaterThan(0);
  });

  it('pre-fills brand with the approved generic sentinel for a new item', () => {
    render(<ItemForm mode="create" submitting={false} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText(/brand/i)).toHaveValue(GENERIC_BRAND);
  });

  it('submits parsed, trimmed values once all required fields are valid', async () => {
    const onSubmit = vi.fn();
    render(<ItemForm mode="create" submitting={false} onSubmit={onSubmit} onCancel={vi.fn()} />);

    await userEvent.type(screen.getByLabelText(/item name/i), '  Flour  ');
    await userEvent.selectOptions(screen.getByLabelText(/primary item type/i), 'RAW_MATERIAL');
    await userEvent.type(screen.getByLabelText(/base uom/i), 'kg');
    await userEvent.click(screen.getByRole('button', { name: /create item/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      item_name: 'Flour',
      primary_item_type: 'RAW_MATERIAL',
      base_uom: 'kg',
      brand: GENERIC_BRAND,
    });
  });

  it('renders a server error banner and merges server-side field errors', () => {
    render(
      <ItemForm
        mode="edit"
        submitting={false}
        serverError="Please fix the highlighted fields."
        serverFieldErrors={{ base_uom: 'INVALID_BASE_UOM' }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Please fix the highlighted fields.')).toBeInTheDocument();
    expect(screen.getByText('INVALID_BASE_UOM')).toBeInTheDocument();
  });

  it('disables all fields and the cancel action while submitting', () => {
    render(<ItemForm mode="create" submitting onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText(/item name/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /create item/i })).toBeDisabled();
  });
});
