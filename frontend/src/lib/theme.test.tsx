import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { THEME_STORAGE_KEY, ThemeProvider } from './theme';
import { ThemeToggle } from '../app/shell/ThemeToggle';
import { stubMatchMedia } from '../test/media';

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

const theme = () => document.documentElement.dataset.theme;

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeProvider / ThemeToggle', () => {
  it('follows the device setting when nothing is saved, including live changes', () => {
    const media = stubMatchMedia({ dark: false });
    renderToggle();
    expect(theme()).toBe('light');
    expect(screen.getByRole('button', { name: 'Light theme' })).toHaveAttribute('aria-pressed', 'true');

    act(() => media.set({ dark: true }));
    expect(theme()).toBe('dark');
    expect(screen.getByRole('button', { name: 'Dark theme' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('a chosen theme overrides the device and is remembered', async () => {
    const media = stubMatchMedia({ dark: false });
    const { unmount } = renderToggle();

    await userEvent.click(screen.getByRole('button', { name: 'Dark theme' }));
    expect(theme()).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    act(() => media.set({ dark: false })); // device change no longer wins
    expect(theme()).toBe('dark');

    unmount();
    renderToggle();
    expect(theme()).toBe('dark');
  });

  it('ignores an invalid saved value', () => {
    stubMatchMedia({ dark: true });
    window.localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    renderToggle();
    expect(theme()).toBe('dark');
  });
});
