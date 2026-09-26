import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DevSessionProvider } from '../../../lib/session';
import { DEV_IDENTITY_STORAGE_KEY } from '../../../lib/dev-session';
import { CatalogSettingsPage } from '../CatalogSettingsPage';
import * as uomApi from '../uom/api';

vi.mock('../uom/api');

function renderPage() {
  return render(
    <DevSessionProvider>
      <MemoryRouter initialEntries={['/catalog-settings']}>
        <CatalogSettingsPage />
      </MemoryRouter>
    </DevSessionProvider>,
  );
}

describe('CatalogSettingsPage', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('shows an access-denied card, with no tabs, for a non-Owner/Manager dev identity', () => {
    window.localStorage.setItem(
      DEV_IDENTITY_STORAGE_KEY,
      JSON.stringify({ userId: 'u', role: 'STAFF', branchId: 'branch-main' }),
    );
    renderPage();

    expect(screen.getByText("You don't have access to Catalog Settings")).toBeInTheDocument();
    expect(
      screen.getByText(/only owner or manager can view or manage units of measure/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('shows the tabs and the live UOM Master panel for the default Owner dev identity', async () => {
    vi.mocked(uomApi.listUoms).mockResolvedValue([]);
    renderPage();

    expect(screen.getByRole('tablist', { name: /catalog settings/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /uom master/i })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('No UOMs yet')).toBeInTheDocument();
  });

  it('switches to the Brands tab and shows its pending placeholder', async () => {
    vi.mocked(uomApi.listUoms).mockResolvedValue([]);
    renderPage();

    await userEvent.click(screen.getByRole('tab', { name: /brands/i }));
    expect(screen.getByText(/pending frontend integration|isn't wired up yet/i)).toBeInTheDocument();
  });
});
