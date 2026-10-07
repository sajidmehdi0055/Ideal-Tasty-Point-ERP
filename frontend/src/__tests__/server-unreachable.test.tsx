import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '../app/shell/AppShell';
import { ToastProvider } from '../design-system/components';
import { UomMasterPanel } from '../features/catalog-settings/uom/UomMasterPanel';
import { AiAssistantProvider } from '../features/ai-assistant/AiAssistantProvider';
import { ItemFormPage } from '../features/items/ItemFormPage';
import { StockLedgerPage } from '../features/stock/ledger/StockLedgerPage';
import { renderWithProviders, setRole } from '../features/stock/__tests__/fixtures';
import { SERVER_UNREACHABLE_MESSAGE } from '../lib/api-client';
import { DevSessionProvider } from '../lib/session';
import { ThemeProvider } from '../lib/theme';
import { stubMatchMedia } from '../test/media';

/*
 * Owner bug 2026-10-08: with the backend down, the Vite dev proxy answers
 * `/api/*` with an empty 5xx body and every screen said only "Something went
 * wrong.". These tests go through the real api-client (no module mocks): only
 * `fetch` is stubbed, so each screen must show the server-unreachable message.
 */

type Responder = (url: string, method: string) => Response | undefined;

/** Empty 500 for every request, unless `ok` answers it first. */
function stubFetch(ok: Responder = () => undefined) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      return ok(url, method) ?? new Response('', { status: 500 });
    }),
  );
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('backend not reachable (empty 5xx from the dev proxy)', () => {
  it('Item form: create shows the server-unreachable message, not "Something went wrong."', async () => {
    stubFetch();
    render(
      <DevSessionProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/items/new']}>
            <Routes>
              <Route path="/items/new" element={<ItemFormPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </DevSessionProvider>,
    );

    await userEvent.type(screen.getByLabelText(/item name/i), 'Flour');
    await userEvent.selectOptions(screen.getByLabelText(/primary item type/i), 'RAW_MATERIAL');
    await userEvent.type(screen.getByLabelText(/base uom/i), 'kg');
    await userEvent.click(screen.getByRole('button', { name: /create item/i }));

    expect(await screen.findByText(SERVER_UNREACHABLE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument();
  });

  it('UOM Master: a failed load shows the server-unreachable message', async () => {
    stubMatchMedia({ wide: true, hover: true });
    stubFetch();
    render(
      <ToastProvider>
        <UomMasterPanel />
      </ToastProvider>,
    );

    expect(await screen.findByText(SERVER_UNREACHABLE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument();
  });

  it('Stock Ledger: a failed load shows the server-unreachable message', async () => {
    stubMatchMedia({ wide: true, hover: true });
    setRole('OWNER');
    stubFetch();
    renderWithProviders(<StockLedgerPage />);

    expect((await screen.findAllByText(SERVER_UNREACHABLE_MESSAGE)).length).toBeGreaterThan(0);
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument();
  });

  it('AI panel: a failed question shows the server-unreachable message in the error card', async () => {
    stubMatchMedia({ wide: true, hover: true });
    stubFetch((url, method) =>
      url.includes('/api/ai/status') && method === 'GET' ? json({ enabled: true, state: 'READY', available: true }) : undefined,
    );
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/items']}>
          <DevSessionProvider>
            <AiAssistantProvider>
              <AppShell>
                <Routes>
                  <Route path="/items" element={<p>items</p>} />
                </Routes>
              </AppShell>
            </AiAssistantProvider>
          </DevSessionProvider>
        </MemoryRouter>
      </ThemeProvider>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Ask AI' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Message to the AI Assistant' }), 'How much oil?');
    await userEvent.keyboard('{Enter}');

    expect(await screen.findByText(SERVER_UNREACHABLE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong.')).not.toBeInTheDocument();
  });
});
