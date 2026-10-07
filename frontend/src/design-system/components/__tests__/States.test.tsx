import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState, ErrorState, LoadingState, NoAccessState } from '../States';
import { Button } from '../Button';

describe('LoadingState', () => {
  it('renders skeleton rows with an accessible label, never a blank area', () => {
    const { container } = render(<LoadingState label="Loading balances…" rows={4} />);
    expect(screen.getByText('Loading balances…')).toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(4);
    expect(container.firstChild).toHaveAttribute('aria-busy', 'true');
  });

  it('defaults to 6 rows and "Loading…"', () => {
    render(<LoadingState />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(6);
  });
});

describe('ErrorState', () => {
  it('shows the plain reason, says the data is safe, and Try again calls onRetry', async () => {
    const onRetry = vi.fn();
    render(
      <ErrorState title="Stock balances could not be loaded" message="The server did not answer." onRetry={onRetry} />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Stock balances could not be loaded');
    expect(alert).toHaveTextContent('The server did not answer.');
    expect(alert).toHaveTextContent('Your data is safe');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('can leave out the safe line and has no Try again without onRetry', () => {
    render(<ErrorState message="Not allowed." safeNote={false} />);
    expect(screen.queryByText(/Your data is safe/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('says what to do next and offers the action', async () => {
    const onAdd = vi.fn();
    render(
      <EmptyState
        title="No stock in the ledger yet"
        message="Start by entering opening stock for each store, kitchen and freezer."
        action={<Button onClick={onAdd}>Add opening stock</Button>}
      />,
    );
    expect(screen.getByText('No stock in the ledger yet')).toBeInTheDocument();
    expect(screen.getByText(/Start by entering opening stock/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add opening stock' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

describe('NoAccessState', () => {
  it('says who can see the page and to ask the owner', () => {
    render(<NoAccessState who="the Owner and Managers" />);
    expect(screen.getByText("You don't have access to this page")).toBeInTheDocument();
    expect(
      screen.getByText('Only the Owner and Managers can see this page. Ask the owner for access.'),
    ).toBeInTheDocument();
  });

  it('accepts a custom title, message and action', () => {
    render(
      <NoAccessState
        title="You don't have access to the Stock Ledger"
        who="the Owner and Managers"
        message="Only the Owner and Managers can see stock quantities."
        action={<Button variant="secondary">Go to Item Master</Button>}
      />,
    );
    expect(screen.getByText("You don't have access to the Stock Ledger")).toBeInTheDocument();
    expect(screen.getByText('Only the Owner and Managers can see stock quantities.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to Item Master' })).toBeInTheDocument();
  });
});
