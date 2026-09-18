import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../Sidebar';

describe('Sidebar', () => {
  it('lists Item Master as active and marks the S-02 screens as pending', () => {
    render(
      <MemoryRouter initialEntries={['/items']}>
        <Sidebar open onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /item master/i })).toBeInTheDocument();
    for (const label of [/uom master/i, /brands/i, /pack variants/i]) {
      expect(screen.getByRole('link', { name: label })).toHaveTextContent('Pending');
    }
    expect(screen.getByRole('link', { name: /item master/i })).not.toHaveTextContent('Pending');
  });
});
