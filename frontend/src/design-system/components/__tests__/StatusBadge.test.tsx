import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../StatusBadge';

describe('StatusBadge', () => {
  it.each([
    ['success', 'Active'],
    ['danger', 'Inactive'],
    ['warning', 'Pending'],
    ['neutral', 'Draft'],
    ['info', 'Raw material'],
  ] as const)('renders the %s tone with its label', (tone, label) => {
    render(<StatusBadge tone={tone} label={label} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
