import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../ConfirmDialog';

describe('ConfirmDialog', () => {
  it('is hidden when closed and visible with its message when open', () => {
    const { rerender } = render(
      <ConfirmDialog
        open={false}
        title="Deactivate item"
        message="Are you sure?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByText('Are you sure?')).not.toBeVisible();

    rerender(
      <ConfirmDialog open title="Deactivate item" message="Are you sure?" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText('Are you sure?')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Deactivate item' })).toBeInTheDocument();
  });

  it('calls onConfirm and onCancel from their respective actions', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Deactivate item"
        message="Are you sure?"
        confirmLabel="Deactivate"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables both actions while busy', () => {
    render(
      <ConfirmDialog open title="Deactivate item" message="Are you sure?" busy onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });
});
