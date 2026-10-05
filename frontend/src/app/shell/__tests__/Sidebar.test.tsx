import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SidebarPanel, SidebarRail, type SidebarPanelVariant } from '../Sidebar';

function renderPanel(variant: SidebarPanelVariant, collapsed: string[] = []) {
  return render(
    <MemoryRouter initialEntries={['/items']}>
      <SidebarPanel
        variant={variant}
        navLabel="Primary"
        collapsedGroups={new Set(collapsed)}
        onToggleGroup={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe('SidebarPanel', () => {
  it('lists Item Master, Catalog Settings and the Stock screens as live, and the rest as pending', () => {
    renderPanel('pinned');
    for (const label of [/item master/i, /catalog settings/i, /stock locations/i, /stock ledger/i]) {
      expect(screen.getByRole('link', { name: label })).not.toHaveTextContent('Pending');
    }
    for (const label of [/suppliers/i, /purchases & rates/i]) {
      expect(screen.getByRole('link', { name: label })).toHaveTextContent('Pending');
    }
  });

  it('groups nav items under Inventory, Purchasing and Stock', () => {
    renderPanel('pinned');
    for (const section of ['Inventory', 'Purchasing', 'Stock']) {
      expect(screen.getByRole('button', { name: section })).toHaveAttribute('aria-expanded', 'true');
    }
  });

  it('hides the links of a collapsed group', () => {
    renderPanel('pinned', ['Purchasing']);
    expect(screen.getByRole('button', { name: 'Purchasing' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: /suppliers/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /item master/i })).toBeInTheDocument();
  });

  it('marks the current route as active', () => {
    renderPanel('pinned');
    expect(screen.getByRole('link', { name: /item master/i })).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['pinned', 'Collapse sidebar'],
    ['peek', 'Pin sidebar'],
    ['drawer', 'Close navigation'],
  ] as const)('%s variant shows its own control (%s)', (variant, control) => {
    renderPanel(variant);
    expect(screen.getByRole('button', { name: control })).toBeInTheDocument();
  });
});

describe('SidebarRail', () => {
  it('labels every icon link and its expand button', () => {
    render(
      <MemoryRouter initialEntries={['/catalog-settings']}>
        <SidebarRail onExpand={vi.fn()} expandLabel="Pin sidebar" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Catalog Settings' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Stock Ledger' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Suppliers (pending)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pin sidebar' })).toBeInTheDocument();
  });
});
