import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '../../../app/shell/AppShell';
import { DevSessionProvider } from '../../../lib/session';
import { ThemeProvider } from '../../../lib/theme';
import { clampWidth, readStoredWidth } from '../../../lib/use-resizable-width';
import { stubMatchMedia, type MediaState } from '../../../test/media';
import { AiAssistantProvider } from '../AiAssistantProvider';
import * as api from '../api';
import type { AiStatusResponse } from '../types';
import {
  AI_PANEL_DEFAULT_WIDTH,
  AI_PANEL_MAX_WIDTH,
  AI_PANEL_MIN_WIDTH,
  AI_PANEL_WIDTH_KEY,
} from '../components/PanelResizeHandle';

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

function renderApp(media: Partial<MediaState> = { wide: true, hover: true }) {
  stubMatchMedia(media);
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/items']}>
        <DevSessionProvider>
          <AiAssistantProvider>
            <AppShell>
              <p>page</p>
            </AppShell>
          </AiAssistantProvider>
        </DevSessionProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

async function openPanel() {
  await userEvent.click(await screen.findByRole('button', { name: 'Ask AI' }));
  return screen.getByTestId('ai-panel');
}

const handle = () => screen.getByRole('separator', { name: 'Resize AI Assistant panel' });

function drag(fromX: number, toX: number) {
  fireEvent.mouseDown(handle(), { button: 0, clientX: fromX });
  fireEvent.mouseMove(document, { clientX: toX });
  fireEvent.mouseUp(document, { clientX: toX });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(api.getAiStatus).mockResolvedValue(READY);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AI panel width — helpers', () => {
  it('clamps to 440–760 px', () => {
    expect(clampWidth(100, AI_PANEL_MIN_WIDTH, AI_PANEL_MAX_WIDTH)).toBe(440);
    expect(clampWidth(5000, AI_PANEL_MIN_WIDTH, AI_PANEL_MAX_WIDTH)).toBe(760);
    expect(clampWidth(600.4, AI_PANEL_MIN_WIDTH, AI_PANEL_MAX_WIDTH)).toBe(600);
  });

  it.each([
    ['missing', null, 440],
    ['valid', '612', 612],
    ['too small', '200', 440],
    ['too large', '9000', 760],
    ['not a number', 'wide', 440],
    ['negative', '-500', 440],
    ['decimal / junk', '600px', 440],
  ])('reads a %s stored value safely', (_label, stored, expected) => {
    if (stored !== null) window.localStorage.setItem(AI_PANEL_WIDTH_KEY, stored);
    const options = {
      storageKey: AI_PANEL_WIDTH_KEY,
      min: AI_PANEL_MIN_WIDTH,
      max: AI_PANEL_MAX_WIDTH,
      defaultWidth: AI_PANEL_DEFAULT_WIDTH,
    };
    expect(readStoredWidth(options)).toBe(expected);
  });
});

describe('AI panel width — desktop side panel', () => {
  it('starts at the 440 px default with an accessible separator on the left edge', async () => {
    renderApp();
    const panel = await openPanel();
    expect(panel.style.width).toBe('440px');
    const separator = handle();
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator).toHaveAttribute('aria-valuemin', '440');
    expect(separator).toHaveAttribute('aria-valuemax', '760');
    expect(separator).toHaveAttribute('aria-valuenow', '440');
    expect(separator).toHaveAttribute('tabindex', '0');
    expect(separator).toHaveClass('cursor-col-resize');
    expect(separator.querySelector('[role="tooltip"]')).toHaveTextContent(
      'Drag to resize · 440–760 px · double-click to reset',
    );
  });

  it('dragging the left edge to the left widens the panel, clamped at 760 px, and saves the width', async () => {
    renderApp();
    const panel = await openPanel();
    drag(1000, 880); // 120 px to the left
    expect(panel.style.width).toBe('560px');
    expect(handle()).toHaveAttribute('aria-valuenow', '560');
    expect(window.localStorage.getItem(AI_PANEL_WIDTH_KEY)).toBe('560');

    drag(1000, 200); // far beyond the maximum
    expect(panel.style.width).toBe('760px');
    expect(window.localStorage.getItem(AI_PANEL_WIDTH_KEY)).toBe('760');

    drag(500, 1400); // far beyond the minimum
    expect(panel.style.width).toBe('440px');
    expect(window.localStorage.getItem(AI_PANEL_WIDTH_KEY)).toBe('440');
  });

  it('saves only when the drag ends, and leaves no listeners or cursor behind', async () => {
    renderApp();
    const panel = await openPanel();
    fireEvent.mouseDown(handle(), { button: 0, clientX: 1000 });
    expect(document.body.style.cursor).toBe('col-resize');
    fireEvent.mouseMove(document, { clientX: 900 });
    expect(panel.style.width).toBe('540px');
    expect(window.localStorage.getItem(AI_PANEL_WIDTH_KEY)).toBeNull();
    fireEvent.mouseUp(document);
    expect(window.localStorage.getItem(AI_PANEL_WIDTH_KEY)).toBe('540');
    expect(document.body.style.cursor).toBe('');
    fireEvent.mouseMove(document, { clientX: 100 });
    expect(panel.style.width).toBe('540px');
  });

  it('restores the remembered width when the panel is opened again', async () => {
    window.localStorage.setItem(AI_PANEL_WIDTH_KEY, '640');
    renderApp();
    const panel = await openPanel();
    expect(panel.style.width).toBe('640px');
    await userEvent.click(screen.getByRole('button', { name: 'Close AI Assistant' }));
    const reopened = await openPanel();
    expect(reopened.style.width).toBe('640px');
  });

  it('double-click on the edge resets to the 440 px default and saves it', async () => {
    window.localStorage.setItem(AI_PANEL_WIDTH_KEY, '700');
    renderApp();
    const panel = await openPanel();
    expect(panel.style.width).toBe('700px');
    fireEvent.doubleClick(handle());
    expect(panel.style.width).toBe('440px');
    expect(window.localStorage.getItem(AI_PANEL_WIDTH_KEY)).toBe('440');
  });

  it('keyboard: ArrowLeft widens and ArrowRight narrows by 16 px; Home/End jump to min/max', async () => {
    renderApp();
    const panel = await openPanel();
    handle().focus();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(panel.style.width).toBe('472px');
    expect(handle()).toHaveAttribute('aria-valuenow', '472');
    await userEvent.keyboard('{ArrowRight}');
    expect(panel.style.width).toBe('456px');
    expect(window.localStorage.getItem(AI_PANEL_WIDTH_KEY)).toBe('456');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(panel.style.width).toBe('440px');
    await userEvent.keyboard('{End}');
    expect(panel.style.width).toBe('760px');
    await userEvent.keyboard('{Home}');
    expect(panel.style.width).toBe('440px');
  });

  it('falls back to the default and keeps working when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    renderApp();
    const panel = await openPanel();
    expect(panel.style.width).toBe('440px');
    drag(1000, 900);
    expect(panel.style.width).toBe('540px');
  });

  it('a corrupt stored width falls back to the default', async () => {
    window.localStorage.setItem(AI_PANEL_WIDTH_KEY, '{"oops":1}');
    renderApp();
    const panel = await openPanel();
    expect(panel.style.width).toBe('440px');
  });

  it('Expand still uses the fixed 760 px width and hides the resize edge', async () => {
    window.localStorage.setItem(AI_PANEL_WIDTH_KEY, '600');
    renderApp();
    const panel = await openPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Expand panel' }));
    expect(panel.className).toContain('md:w-[760px]');
    expect(panel.style.width).toBe('');
    expect(screen.queryByRole('separator', { name: 'Resize AI Assistant panel' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Collapse panel' }));
    expect(panel.style.width).toBe('600px');
  });
});

describe('AI panel width — not on touch or mobile sheets', () => {
  it.each([
    ['tablet / touch', { wide: true, hover: false }],
    ['mobile', { wide: false, hover: false }],
  ] as const)('%s: no resize edge and no inline width', async (_label, media) => {
    window.localStorage.setItem(AI_PANEL_WIDTH_KEY, '700');
    renderApp(media);
    const panel = await openPanel();
    expect(panel.style.width).toBe('');
    expect(screen.queryByRole('separator', { name: 'Resize AI Assistant panel' })).not.toBeInTheDocument();
  });
});

describe('Icon-only buttons always have a tooltip (spec 1c)', () => {
  it.each([
    ['New chat', 'New chat'],
    ['Expand panel', 'Expand panel'],
    ['Close AI Assistant', 'Close'],
    ['Light theme', 'Light theme'],
    ['Dark theme', 'Dark theme'],
    ['Pin sidebar', 'Pin sidebar'],
  ])('%s shows "%s" on keyboard focus and has no native title', async (name, text) => {
    renderApp();
    await openPanel();
    const button = screen.getByRole('button', { name });
    expect(button).not.toHaveAttribute('title');
    act(() => button.focus());
    const tooltip = button.parentElement!.querySelector('[role="tooltip"]')!;
    expect(tooltip).toBeVisible();
    expect(tooltip).toHaveTextContent(text);
  });
});
