import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '../../../app/shell/AppShell';
import { ApiError } from '../../../lib/api-client';
import { DevSessionProvider } from '../../../lib/session';
import { ThemeProvider } from '../../../lib/theme';
import { stubMatchMedia, type MediaState } from '../../../test/media';
import { AiAssistantProvider } from '../AiAssistantProvider';
import * as api from '../api';
import type { AiChatResponse, AiStatusResponse } from '../types';

vi.mock('../api');

const READY: AiStatusResponse = {
  enabled: true,
  state: 'READY',
  available: true,
  provider: 'local',
  model: 'some-model',
  fallback_provider: null,
  cloud_enabled: false,
  tool_calling_enabled: true,
  write_actions_enabled: false,
};

function answer(message: string, overrides: Partial<AiChatResponse> = {}): AiChatResponse {
  return {
    message,
    provider: 'local',
    model: 'some-model',
    tool_calls: [{ name: 'inventory_get_stock_balances', mode: 'READ', status: 'SUCCESS' }],
    requires_approval: false,
    proposed_action: null,
    metadata: {
      request_id: 'r1',
      conversation_id: null,
      prompt_version: 'erp-ai-v1',
      rounds: 2,
      fallback_used: false,
      limit_reached: false,
    },
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderApp(path = '/items', media: Partial<MediaState> = { wide: true, hover: true }) {
  stubMatchMedia(media);
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <DevSessionProvider>
          <AiAssistantProvider>
            <AppShell>
              <Routes>
                <Route path="/items" element={<Link to="/suppliers">go to suppliers</Link>} />
                <Route path="/suppliers" element={<p>suppliers screen</p>} />
                <Route path="/stock/ledger" element={<p>ledger screen</p>} />
                <Route path="/other" element={<p>other screen</p>} />
              </Routes>
            </AppShell>
          </AiAssistantProvider>
        </DevSessionProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

const askButton = () => screen.findByRole('button', { name: 'Ask AI' });
const panel = () => screen.getByTestId('ai-panel');
const composer = () => screen.getByRole('textbox', { name: 'Message to the AI Assistant' });

async function openPanel() {
  await userEvent.click(await askButton());
  return panel();
}

async function ask(text: string) {
  await userEvent.type(composer(), text);
  await userEvent.keyboard('{Enter}');
}

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(api.getAiStatus).mockResolvedValue(READY);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  document.documentElement.removeAttribute('data-theme');
});

describe('Ask AI button visibility (GET /api/ai/status)', () => {
  it('available: true → button shown; plain status only, never ?check=true', async () => {
    renderApp();
    expect(await askButton()).toBeInTheDocument();
    expect(api.getAiStatus).toHaveBeenCalledTimes(1);
    expect(api.getAiStatus).toHaveBeenCalledWith();
    await openPanel();
    expect(api.getAiStatus).toHaveBeenCalledTimes(1); // opening the panel makes no status/health call
  });

  it('available: false → button hidden', async () => {
    vi.mocked(api.getAiStatus).mockResolvedValue({ enabled: true, state: 'READY', available: false });
    renderApp();
    await waitFor(() => expect(api.getAiStatus).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Ask AI' })).not.toBeInTheDocument();
  });

  it('status call failing (e.g. 401 before real auth) → button hidden, no fake state', async () => {
    vi.mocked(api.getAiStatus).mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Not signed in.'));
    renderApp();
    await waitFor(() => expect(api.getAiStatus).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Ask AI' })).not.toBeInTheDocument();
  });

  it('enabled: false (DISABLED) → button stays and the panel explains (frame 09)', async () => {
    vi.mocked(api.getAiStatus).mockResolvedValue({ enabled: false, state: 'DISABLED' });
    renderApp();
    await openPanel();
    expect(screen.getByTestId('ai-blocked-disabled')).toHaveTextContent('AI Assistant is turned off');
    expect(screen.getByTestId('ai-status-pill')).toHaveTextContent('Turned off');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New chat' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close AI Assistant' })).toHaveFocus();
  });

  it('enabled: false (MISCONFIGURED) → AI_UNAVAILABLE variant text', async () => {
    vi.mocked(api.getAiStatus).mockResolvedValue({ enabled: false, state: 'MISCONFIGURED' });
    renderApp();
    await openPanel();
    expect(screen.getByTestId('ai-blocked-misconfigured')).toHaveTextContent(
      'AI Assistant is not set up correctly. Please contact the administrator.',
    );
  });

  it('sits in the header before the theme toggle', async () => {
    renderApp();
    const button = await askButton();
    const toggle = screen.getByRole('group', { name: 'Colour theme' });
    expect(button.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('Panel open / close / Esc / expand (desktop, mouse)', () => {
  it('opens as a non-modal 440px panel under the header with focus in the composer', async () => {
    renderApp();
    const dialog = await openPanel();
    expect(dialog).toHaveAttribute('data-variant', 'desktop');
    expect(dialog).not.toHaveAttribute('aria-modal');
    expect(dialog.className).toContain('md:w-[440px]');
    expect(dialog.className).toContain('top-16');
    expect(screen.getByTestId('shell-root')).not.toHaveAttribute('inert');
    expect(screen.queryByTestId('ai-scrim')).not.toBeInTheDocument();
    expect(composer()).toHaveFocus();
    expect(await askButton()).toHaveAttribute('aria-expanded', 'true');
  });

  it('✕ closes and returns focus to the Ask AI button', async () => {
    renderApp();
    await openPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Close AI Assistant' }));
    expect(screen.queryByTestId('ai-panel')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ask AI' })).toHaveFocus());
  });

  it('Esc closes when focus is in the panel, but not while the user works in the page', async () => {
    renderApp();
    await openPanel();
    screen.getByRole('link', { name: 'go to suppliers' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByTestId('ai-panel')).toBeInTheDocument();
    composer().focus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('ai-panel')).not.toBeInTheDocument();
  });

  it('the header button toggles the panel', async () => {
    renderApp();
    await openPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
    expect(screen.queryByTestId('ai-panel')).not.toBeInTheDocument();
  });

  it('Expand widens to 760px and Collapse returns to 440px', async () => {
    renderApp();
    await openPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Expand panel' }));
    expect(panel()).toHaveAttribute('data-expanded', 'true');
    expect(panel().className).toContain('md:w-[760px]');
    await userEvent.click(screen.getByRole('button', { name: 'Collapse panel' }));
    expect(panel().className).toContain('md:w-[440px]');
  });

  it('the conversation survives screen changes and closing/reopening; New chat clears it', async () => {
    vi.mocked(api.sendAiChat).mockResolvedValue(answer('Oil is **86.5 L**.'));
    renderApp();
    await openPanel();
    await ask('stock of oil?');
    expect(await screen.findByText('86.5 L')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('link', { name: 'go to suppliers' }));
    expect(screen.getByText('suppliers screen')).toBeInTheDocument();
    expect(screen.getByText('86.5 L')).toBeInTheDocument();
    expect(screen.getByTestId('ai-context-chip')).toHaveTextContent('Purchasing');

    await userEvent.click(screen.getByRole('button', { name: 'Close AI Assistant' }));
    await openPanel();
    expect(screen.getByText('86.5 L')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'New chat' }));
    expect(screen.queryByText('86.5 L')).not.toBeInTheDocument();
    expect(screen.getByText('Ask about your inventory data')).toBeInTheDocument();
  });
});

describe('Tablet (touch) and mobile variants', () => {
  it('tablet: 480px modal sheet with scrim; tapping the scrim closes; shell is inert; 36px targets', async () => {
    renderApp('/items', { wide: true, hover: false });
    const dialog = await openPanel();
    expect(dialog).toHaveAttribute('data-variant', 'touch');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.className).toContain('md:w-[480px]');
    expect(dialog.className).toContain('inset-y-0');
    expect(screen.getByTestId('shell-root')).toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Close AI Assistant', hidden: true }).className).toContain('h-9 w-9');

    fireEvent.click(screen.getByTestId('ai-scrim'));
    expect(screen.queryByTestId('ai-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('shell-root')).not.toHaveAttribute('inert');
  });

  it('tablet: Esc closes the modal sheet even when focus is elsewhere', async () => {
    renderApp('/items', { wide: true, hover: false });
    await openPanel();
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('ai-panel')).not.toBeInTheDocument();
  });

  it('mobile (< 768px): icon-only header button opens a full-screen modal sheet without Expand', async () => {
    renderApp('/items', { wide: false, hover: false });
    const button = await askButton();
    expect(within(button).getByText('Ask AI')).toHaveClass('hidden');
    const dialog = await openPanel();
    expect(dialog).toHaveAttribute('data-variant', 'mobile');
    expect(dialog.className).toContain('inset-0');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.queryByRole('button', { name: 'Expand panel' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('ai-scrim')).not.toBeInTheDocument();
    expect(screen.getByTestId('shell-root')).toHaveAttribute('inert');
  });
});

describe('Composer rules', () => {
  it('Enter sends, Shift+Enter makes a new line, empty input never sends', async () => {
    vi.mocked(api.sendAiChat).mockResolvedValue(answer('ok'));
    renderApp();
    await openPanel();
    await userEvent.keyboard('{Enter}');
    expect(api.sendAiChat).not.toHaveBeenCalled();
    await userEvent.type(composer(), 'line one{Shift>}{Enter}{/Shift}line two');
    expect(composer()).toHaveValue('line one\nline two');
    expect(api.sendAiChat).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    expect(api.sendAiChat).toHaveBeenCalledWith({ message: 'line one\nline two', module: 'inventory' });
    expect(await screen.findByText('ok')).toBeInTheDocument();
  });

  it('shows the 4,000-character counter and blocks over-length messages (frame 08)', async () => {
    renderApp();
    await openPanel();
    expect(screen.getByTestId('ai-char-count')).toHaveTextContent('0 / 4,000');
    fireEvent.change(composer(), { target: { value: 'x'.repeat(4000) } });
    expect(screen.getByTestId('ai-char-count')).toHaveTextContent('4,000 / 4,000');
    expect(screen.getByRole('button', { name: 'Send question' })).toBeEnabled();
    fireEvent.change(composer(), { target: { value: 'x'.repeat(4120) } });
    expect(screen.getByTestId('ai-char-count')).toHaveTextContent('4,120 / 4,000');
    expect(screen.getByText('Message is too long — maximum 4,000 characters.')).toBeInTheDocument();
    expect(composer()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Send question' })).toBeDisabled();
    fireEvent.keyDown(composer(), { key: 'Enter' });
    expect(api.sendAiChat).not.toHaveBeenCalled();
  });

  it('a suggestion fills the composer instead of sending', async () => {
    renderApp();
    await openPanel();
    await userEvent.click(screen.getByRole('button', { name: /Kaun se purchase orders abhi open hain\?/ }));
    expect(composer()).toHaveValue('Kaun se purchase orders abhi open hain?');
    expect(api.sendAiChat).not.toHaveBeenCalled();
  });

  it('server 400 puts the question back in the composer with the reason underneath', async () => {
    vi.mocked(api.sendAiChat).mockRejectedValue(
      new ApiError(400, 'VALIDATION_ERROR', 'The request was invalid.', [{ path: ['message'], message: 'Too big' }]),
    );
    renderApp();
    await openPanel();
    await ask('hello');
    expect(await screen.findByText('The question could not be sent — message: Too big')).toBeInTheDocument();
    expect(composer()).toHaveValue('hello');
    expect(screen.queryByText('hello', { selector: 'div' })).not.toBeInTheDocument();
  });
});

describe('Waiting state (no streaming, no cancel)', () => {
  it('locks the composer, shows a generic indicator with an elapsed timer, then the answer', async () => {
    const pending = deferred<AiChatResponse>();
    vi.mocked(api.sendAiChat).mockReturnValue(pending.promise);
    renderApp();
    await openPanel();
    await ask('compare rates');

    expect(screen.getByText('Checking ERP data…')).toBeInTheDocument();
    expect(composer()).toBeDisabled();
    expect(composer()).toHaveAttribute('placeholder', 'Waiting for the answer…');
    expect(screen.getByText('The local model can take a little time. One question at a time.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New chat' })).toBeDisabled();
    expect(screen.getByTestId('ai-elapsed')).toHaveTextContent('0 s');
    expect(screen.getByTestId('ai-elapsed')).toHaveAttribute('aria-hidden', 'true');

    // The timer ticks once a second from the request start (real interval; clock moved forward).
    const realNow = Date.now.bind(Date);
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 8000);
    await waitFor(() => expect(screen.getByTestId('ai-elapsed')).toHaveTextContent(/^(8|9) s$/), { timeout: 2500 });
    clock.mockRestore();

    // A second question cannot be sent while waiting.
    fireEvent.keyDown(composer(), { key: 'Enter' });
    expect(api.sendAiChat).toHaveBeenCalledTimes(1);

    await act(async () => pending.resolve(answer('done')));
    expect(await screen.findByText('done')).toBeInTheDocument();
    expect(screen.queryByText('Checking ERP data…')).not.toBeInTheDocument();
    expect(composer()).toBeEnabled();
    await waitFor(() => expect(composer()).toHaveFocus());
  });

  it('closing the panel while waiting does not lose the answer', async () => {
    const pending = deferred<AiChatResponse>();
    vi.mocked(api.sendAiChat).mockReturnValue(pending.promise);
    renderApp();
    await openPanel();
    await ask('q');
    await userEvent.click(screen.getByRole('button', { name: 'Close AI Assistant' }));
    await act(async () => pending.resolve(answer('arrived later')));
    await openPanel();
    expect(screen.getByText('arrived later')).toBeInTheDocument();
  });
});

describe('Answers: chips, meta line, Markdown', () => {
  it('shows "ERP data used" chips from tool_calls and the meta line', async () => {
    vi.mocked(api.sendAiChat).mockResolvedValue(
      answer('Total 86.5 L', {
        tool_calls: [
          { name: 'inventory_get_stock_balances', mode: 'READ', status: 'SUCCESS' },
          { name: 'inventory_get_stock_movements', mode: 'READ', status: 'SUCCESS' },
          { name: 'inventory_list_suppliers', mode: 'READ', status: 'DENIED' },
          { name: 'inventory_list_goods_receipts', mode: 'READ', status: 'ERROR' },
        ],
      }),
    );
    renderApp();
    await openPanel();
    await ask('stock?');
    const chips = await screen.findByRole('list', { name: 'ERP data used' });
    const items = within(chips).getAllByRole('listitem');
    expect(items.map(item => item.getAttribute('data-tone'))).toEqual(['success', 'success', 'denied', 'failed']);
    expect(items[0]).toHaveTextContent('Stock balances');
    expect(items[1]).toHaveTextContent('Stock ledger');
    expect(items[2]).toHaveTextContent('Suppliersnot permitted');
    expect(items[3]).toHaveTextContent('Goods receiptsfailed');
    expect(screen.getByTestId('ai-meta')).toHaveTextContent(/^Local model · 4 ERP lookups · \d+\.\d s$/);
  });

  it('meta names a fallback provider and flags an incomplete answer', async () => {
    vi.mocked(api.sendAiChat).mockResolvedValue(
      answer('partial', {
        provider: 'anthropic',
        tool_calls: [{ name: 'inventory_list_suppliers', mode: 'READ', status: 'SUCCESS' }],
        metadata: { request_id: 'r', conversation_id: null, prompt_version: 'v', rounds: 4, fallback_used: true, limit_reached: true },
      }),
    );
    renderApp();
    await openPanel();
    await ask('q');
    expect(await screen.findByTestId('ai-meta')).toHaveTextContent(/^Cloud model \(fallback\) · 1 ERP lookup · /);
    expect(screen.getByText(/Answer may be incomplete/)).toBeInTheDocument();
  });

  it('renders a Markdown table answer safely (no HTML from the model)', async () => {
    vi.mocked(api.sendAiChat).mockResolvedValue(
      answer('| Supplier | Rate |\n|---|---|\n| Punjab Oil Mills | Rs 528.13 |\n\n<img src=x onerror=alert(1)>'),
    );
    const { container } = renderApp();
    await openPanel();
    await ask('rates');
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Rs 528.13' })).toHaveClass('text-right');
    expect(container.ownerDocument.querySelector('[data-testid="ai-panel"] img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
  });

  it('Copy copies the plain answer text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    vi.mocked(api.sendAiChat).mockResolvedValue(answer('**bold** answer'));
    renderApp();
    await openPanel();
    await ask('q');
    await userEvent.click(await screen.findByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('**bold** answer');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });
});

describe('Request: module and client-side history', () => {
  it('sends the current screen module and no module where there is none', async () => {
    vi.mocked(api.sendAiChat).mockResolvedValue(answer('ok'));
    renderApp('/stock/ledger');
    await openPanel();
    expect(screen.getByTestId('ai-context-chip')).toHaveTextContent('Stock');
    await ask('a');
    await screen.findByText('ok');
    expect(api.sendAiChat).toHaveBeenLastCalledWith({ message: 'a', module: 'stock' });
  });

  it('omits module on a screen outside inventory / purchasing / stock', async () => {
    vi.mocked(api.sendAiChat).mockResolvedValue(answer('ok'));
    renderApp('/other');
    await openPanel();
    expect(screen.queryByTestId('ai-context-chip')).not.toBeInTheDocument();
    await ask('a');
    await screen.findByText('ok');
    expect(api.sendAiChat).toHaveBeenLastCalledWith({ message: 'a' });
  });

  it('sends earlier answered turns as history, never failed ones', async () => {
    vi.mocked(api.sendAiChat)
      .mockResolvedValueOnce(answer('first answer'))
      .mockRejectedValueOnce(new ApiError(503, 'AI_PROVIDER_UNAVAILABLE', 'down'))
      .mockResolvedValueOnce(answer('third answer'));
    renderApp();
    await openPanel();
    await ask('first');
    await screen.findByText('first answer');
    await ask('second');
    await screen.findByTestId('ai-error-offline');
    await ask('third');
    await screen.findByText('third answer');
    expect(api.sendAiChat).toHaveBeenLastCalledWith({
      message: 'third',
      module: 'inventory',
      history: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'first answer' },
      ],
    });
  });
});

describe('Error states (Figma frames 06–10)', () => {
  it('503 AI_PROVIDER_UNAVAILABLE → "AI model is offline" + Retry; pill shows Model offline until a success', async () => {
    vi.mocked(api.sendAiChat)
      .mockRejectedValueOnce(new ApiError(503, 'AI_PROVIDER_UNAVAILABLE', 'down'))
      .mockResolvedValueOnce(answer('back online'));
    renderApp();
    await openPanel();
    await ask('chicken ka stock?');
    const card = await screen.findByTestId('ai-error-offline');
    expect(card).toHaveTextContent('AI model is offline');
    expect(card).toHaveTextContent('503 · AI_PROVIDER_UNAVAILABLE');
    expect(screen.getByTestId('ai-status-pill')).toHaveTextContent('Model offline');

    await userEvent.click(within(card).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('back online')).toBeInTheDocument();
    expect(api.sendAiChat).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.sendAiChat).mock.calls[1]?.[0]).toEqual(vi.mocked(api.sendAiChat).mock.calls[0]?.[0]);
    expect(screen.getByTestId('ai-status-pill')).toHaveTextContent('Local model');
    expect(screen.getAllByText('chicken ka stock?')).toHaveLength(1);
  });

  it('429 AI_RATE_LIMITED → warning card "wait about a minute" + Retry, question kept', async () => {
    vi.mocked(api.sendAiChat).mockRejectedValue(new ApiError(429, 'AI_RATE_LIMITED', 'Too many'));
    renderApp();
    await openPanel();
    await ask('goods received this week?');
    const card = await screen.findByTestId('ai-error-rate-limited');
    expect(card).toHaveTextContent('Too many questions — please wait');
    expect(card).toHaveTextContent('Wait about a minute, then press Retry. Your question is kept.');
    expect(card).toHaveTextContent('429 · AI_RATE_LIMITED');
    expect(card.className).toContain('bg-warning-50');
    expect(within(card).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByText('goods received this week?')).toBeInTheDocument();
  });

  it('500 AI_AUDIT_FAILED → "Stopped for safety" + Retry', async () => {
    vi.mocked(api.sendAiChat).mockRejectedValue(new ApiError(500, 'AI_AUDIT_FAILED', 'stopped'));
    renderApp();
    await openPanel();
    await ask('q');
    const card = await screen.findByTestId('ai-error-audit-failed');
    expect(card).toHaveTextContent('Stopped for safety — not answered');
    expect(card).toHaveTextContent('500 · AI_AUDIT_FAILED');
    expect(within(card).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('503 AI_DISABLED from chat → whole panel shows "turned off"', async () => {
    vi.mocked(api.sendAiChat).mockRejectedValue(new ApiError(503, 'AI_DISABLED', 'off'));
    renderApp();
    await openPanel();
    await ask('q');
    expect(await screen.findByTestId('ai-blocked-disabled')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('503 AI_UNAVAILABLE from chat → "not set up correctly" variant', async () => {
    vi.mocked(api.sendAiChat).mockRejectedValue(new ApiError(503, 'AI_UNAVAILABLE', 'misconfigured'));
    renderApp();
    await openPanel();
    await ask('q');
    expect(await screen.findByTestId('ai-blocked-misconfigured')).toBeInTheDocument();
  });

  it('403 AI_FORBIDDEN → "Not available for your role"', async () => {
    vi.mocked(api.sendAiChat).mockRejectedValue(new ApiError(403, 'AI_FORBIDDEN', 'no'));
    renderApp();
    await openPanel();
    await ask('q');
    const state = await screen.findByTestId('ai-blocked-forbidden');
    expect(state).toHaveTextContent('Not available for your role');
    expect(state).toHaveTextContent('403 · AI_FORBIDDEN');
    expect(screen.getByTestId('ai-status-pill')).toHaveTextContent('No access');
  });

  it('401 is shown plainly without Retry (no fake sign-in)', async () => {
    vi.mocked(api.sendAiChat).mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Not signed in.'));
    renderApp();
    await openPanel();
    await ask('q');
    const card = await screen.findByTestId('ai-error-unauthenticated');
    expect(card).toHaveTextContent('Not signed in');
    expect(within(card).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('a network failure is visible with its code and Retry', async () => {
    vi.mocked(api.sendAiChat).mockRejectedValue(
      new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Is the backend running?'),
    );
    renderApp();
    await openPanel();
    await ask('q');
    const card = await screen.findByTestId('ai-error-generic');
    expect(card).toHaveTextContent('Could not reach the server. Is the backend running?');
    expect(card).toHaveTextContent('NETWORK_ERROR');
  });

  it('only the latest failed question offers Retry', async () => {
    vi.mocked(api.sendAiChat).mockRejectedValue(new ApiError(429, 'AI_RATE_LIMITED', 'Too many'));
    renderApp();
    await openPanel();
    await ask('one');
    await screen.findByTestId('ai-error-rate-limited');
    await ask('two');
    await waitFor(() => expect(screen.getAllByTestId('ai-error-rate-limited')).toHaveLength(2));
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1);
  });
});

describe('Waiting hint follows the provider', () => {
  it('a cloud primary provider does not claim to be the local model', async () => {
    vi.mocked(api.getAiStatus).mockResolvedValue({ ...READY, provider: 'anthropic' });
    vi.mocked(api.sendAiChat).mockReturnValue(new Promise(() => {}));
    renderApp();
    await openPanel();
    expect(screen.getByTestId('ai-status-pill')).toHaveTextContent('Cloud model');
    await ask('q');
    expect(screen.getByText('The AI model can take a little time. One question at a time.')).toBeInTheDocument();
  });
});

describe('Light / Dark', () => {
  it('uses theme tokens only, so the panel follows the Dark theme', async () => {
    window.localStorage.setItem('itp-erp:theme', 'dark');
    renderApp();
    await openPanel();
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    const html = panel().outerHTML;
    expect(html).not.toMatch(/#[0-9a-f]{3,6}\b/i);
    expect(html).not.toMatch(/\b(bg|text|border)-(white|black|slate|gray|zinc|neutral-\d|red|blue|amber|green)-?\d*/);
    expect(html).toContain('bg-canvas');
  });
});
