import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ActiveStatusBadge, Badge } from '../Badge';
import { Button } from '../Button';
import { PageIntro } from '../PageIntro';
import { SummaryTiles } from '../SummaryTiles';

describe('PageIntro', () => {
  it('renders the section title, description and actions', () => {
    render(
      <PageIntro
        title="Balances by location"
        description="Current quantity of every item at every store, kitchen and freezer."
        actions={<Button>Opening stock</Button>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Balances by location' })).toBeInTheDocument();
    expect(screen.getByText(/Current quantity of every item/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Opening stock' })).toBeInTheDocument();
  });
});

describe('SummaryTiles', () => {
  it('renders one tile per entry with label, value and note', () => {
    render(
      <SummaryTiles
        ariaLabel="Stock summary"
        tiles={[
          { id: 'items', label: 'Items in stock', value: 8, note: 'across 3 locations' },
          { id: 'transit', label: 'Transfers in transit', value: 2, note: 'not counted until received', tone: 'info' },
        ]}
      />,
    );
    const group = screen.getByLabelText('Stock summary');
    expect(within(group).getByText('Items in stock')).toBeInTheDocument();
    expect(within(group).getByText('across 3 locations')).toBeInTheDocument();
    const transit = within(group).getByText('2');
    expect(transit.className).toContain('tabular-nums');
    expect(transit.className).toContain('text-info-600');
  });
});

describe('Badge', () => {
  it.each(['neutral', 'info', 'success', 'warning', 'danger'] as const)('renders the %s tone', tone => {
    render(<Badge tone={tone}>Freezer</Badge>);
    expect(screen.getByText('Freezer')).toBeInTheDocument();
  });

  it('ActiveStatusBadge says Active or Inactive in words, not colour alone', () => {
    const { rerender } = render(<ActiveStatusBadge active />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    rerender(<ActiveStatusBadge active={false} />);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });
});

describe('Button sizes and variants', () => {
  it('supports the small (xs) size and the danger-text variant', () => {
    render(
      <Button size="xs" variant="danger-text">
        Deactivate
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Deactivate' });
    expect(button.className).toContain('h-[31px]');
    expect(button.className).toContain('text-danger-600');
  });
});
