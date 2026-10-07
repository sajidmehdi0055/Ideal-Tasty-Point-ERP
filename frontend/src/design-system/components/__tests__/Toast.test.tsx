import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider, useToast, TOAST_SUCCESS_TIMEOUT_MS, type ToastInput } from '../Toast';

function Trigger({ kind, toast }: { kind: 'success' | 'error'; toast: ToastInput }) {
  const api = useToast();
  return (
    <button type="button" onClick={() => api[kind](toast)}>
      Show {kind}
    </button>
  );
}

function renderWithProvider(kind: 'success' | 'error', toast: ToastInput) {
  render(
    <ToastProvider>
      <Trigger kind={kind} toast={toast} />
    </ToastProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: `Show ${kind}` }));
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a success toast as a polite status that hides after 5 seconds', () => {
    renderWithProvider('success', { title: 'Adjustment saved', detail: 'Cooking Oil · Main Store · 72 → 69.5 L' });
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Adjustment saved');
    expect(toast).toHaveTextContent('Cooking Oil · Main Store · 72 → 69.5 L');

    act(() => vi.advanceTimersByTime(TOAST_SUCCESS_TIMEOUT_MS - 1));
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('pauses the success timer while hovered and hides 5 seconds after the pointer leaves', () => {
    renderWithProvider('success', { title: 'Adjustment saved' });
    const toast = screen.getByRole('status');
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(TOAST_SUCCESS_TIMEOUT_MS * 3));
    expect(screen.getByRole('status')).toBeInTheDocument();

    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(TOAST_SUCCESS_TIMEOUT_MS - 1));
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('pauses the success timer while keyboard focus is inside the toast', () => {
    renderWithProvider('success', { title: 'Adjustment saved' });
    fireEvent.focus(screen.getByRole('button', { name: 'Dismiss notification' }));
    act(() => vi.advanceTimersByTime(TOAST_SUCCESS_TIMEOUT_MS * 2));
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('keeps an error toast (role=alert) until the user closes it', () => {
    renderWithProvider('error', { title: 'Could not save', detail: 'Balance would go below zero. Nothing was changed.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save');
    act(() => vi.advanceTimersByTime(TOAST_SUCCESS_TIMEOUT_MS * 10));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stacks several toasts', () => {
    renderWithProvider('error', { title: 'Could not save' });
    fireEvent.click(screen.getByRole('button', { name: 'Show error' }));
    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });

  it('is a harmless no-op outside a ToastProvider', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Trigger kind="success" toast={{ title: 'Saved' }} />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Show success' }))).not.toThrow();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    warn.mockRestore();
  });
});
