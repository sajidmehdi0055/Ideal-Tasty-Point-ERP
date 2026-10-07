import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IconButton, Tooltip } from '../Tooltip';
import { HistoryIcon } from '../../icons';

describe('Tooltip', () => {
  it('shows on hover, hides on mouse leave, and describes its trigger', async () => {
    render(
      <Tooltip content="Full value: 38.500000 kg">
        <button type="button">38.5 kg</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: '38.5 kg' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await userEvent.hover(trigger);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Full value: 38.500000 kg');
    expect(trigger).toHaveAccessibleDescription('Full value: 38.500000 kg');

    await userEvent.unhover(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows on keyboard focus and hides on Escape and on blur', async () => {
    render(
      <>
        <Tooltip content="Movement history">
          <button type="button">History</button>
        </Tooltip>
        <button type="button">Next</button>
      </>,
    );
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'History' })).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Movement history');

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await userEvent.tab({ shift: true });
    await userEvent.tab();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    await userEvent.tab();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

describe('IconButton', () => {
  it('has the label as its accessible name and always shows it as a tooltip', async () => {
    const onClick = vi.fn();
    render(<IconButton label="Movement history" icon={<HistoryIcon />} onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Movement history' });
    expect(button).toHaveAttribute('aria-label', 'Movement history');
    expect(button).toHaveAttribute('type', 'button');
    expect(button.className).toContain('h-8 w-8');

    await userEvent.hover(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Movement history');

    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('describes the button when the tooltip text differs from the label', async () => {
    render(<IconButton label="History" tooltip="Movement history for Cooking Oil" icon={<HistoryIcon />} />);
    expect(screen.getByRole('button', { name: 'History' })).toHaveAccessibleDescription(
      'Movement history for Cooking Oil',
    );
  });
});
