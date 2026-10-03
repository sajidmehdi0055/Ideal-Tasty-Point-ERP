import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../lib/api-client';
import { availabilityFromStatus } from '../AiAssistantProvider';
import { classifyChatError } from '../errors';
import { buildHistory, type CompletedExchange } from '../history';
import { moduleForPath } from '../module';
import { providerLabel, toolChips, toolLabel } from '../tool-labels';

describe('buildHistory (≤ 20 turns / 32,000 chars, whole pairs, newest kept)', () => {
  const pair = (n: number, size = 10): CompletedExchange => ({ question: `q${n}`.padEnd(size, '.'), answer: `a${n}`.padEnd(size, '.') });

  it('sends nothing for an empty conversation and alternating user/assistant turns otherwise', () => {
    expect(buildHistory([])).toEqual([]);
    expect(buildHistory([pair(1)])).toEqual([
      { role: 'user', content: 'q1........' },
      { role: 'assistant', content: 'a1........' },
    ]);
  });

  it('keeps only the newest 10 pairs (20 turns)', () => {
    const history = buildHistory(Array.from({ length: 13 }, (_, i) => pair(i + 1)));
    expect(history).toHaveLength(20);
    expect(history[0]).toEqual({ role: 'user', content: 'q4........' });
    expect(history[19]).toEqual({ role: 'assistant', content: 'a13.......' });
  });

  it('drops the oldest pairs to stay within 32,000 characters in total', () => {
    // 5 pairs × 2 × 4,000 = 40,000 chars → only the newest 4 pairs (32,000) fit.
    const history = buildHistory(Array.from({ length: 5 }, (_, i) => pair(i + 1, 4000)));
    expect(history).toHaveLength(8);
    expect(history.reduce((sum, turn) => sum + turn.content.length, 0)).toBeLessThanOrEqual(32000);
    expect(history[0]?.content.startsWith('q2')).toBe(true);
  });

  it('stops at a turn longer than the backend per-turn limit (8,000) so the context stays contiguous', () => {
    const history = buildHistory([pair(1), { question: 'q2', answer: 'x'.repeat(8001) }, pair(3)]);
    expect(history).toEqual([
      { role: 'user', content: 'q3........' },
      { role: 'assistant', content: 'a3........' },
    ]);
  });

  it('removes NUL characters the backend would reject', () => {
    expect(buildHistory([{ question: 'q\u0000', answer: 'a\u0000b' }])).toEqual([
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'ab' },
    ]);
  });

  it('trims turns (the backend trims and rejects empty content)', () => {
    expect(buildHistory([{ question: '  hi  ', answer: ' ok ' }])).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'ok' },
    ]);
    expect(buildHistory([pair(1), { question: 'q', answer: '   ' }])).toEqual([]);
  });
});

describe('moduleForPath (request `module` from the current screen)', () => {
  it.each([
    ['/items', 'inventory'],
    ['/items/new', 'inventory'],
    ['/items/abc/edit', 'inventory'],
    ['/catalog-settings', 'inventory'],
    ['/suppliers', 'purchasing'],
    ['/purchases', 'purchasing'],
    ['/stock/locations', 'stock'],
    ['/stock/ledger', 'stock'],
    ['/somewhere-else', undefined],
  ])('%s → %s', (path, expected) => {
    expect(moduleForPath(path)).toBe(expected);
  });
});

describe('tool chips (Figma board 104:3288)', () => {
  it('maps every AI-S01 tool to its approved label', () => {
    expect(toolLabel('inventory_get_stock_balances')).toBe('Stock balances');
    expect(toolLabel('inventory_get_stock_movements')).toBe('Stock ledger');
    expect(toolLabel('inventory_list_stock_locations')).toBe('Stock locations');
    expect(toolLabel('inventory_list_suppliers')).toBe('Suppliers');
    expect(toolLabel('inventory_list_pack_variants')).toBe('Pack variants');
    expect(toolLabel('inventory_compare_purchase_rates')).toBe('Rate comparison');
    expect(toolLabel('inventory_get_purchase_history')).toBe('Purchase history');
    expect(toolLabel('inventory_list_purchase_orders')).toBe('Purchase orders');
    expect(toolLabel('inventory_get_purchase_order')).toBe('Purchase orders');
    expect(toolLabel('inventory_list_goods_receipts')).toBe('Goods receipts');
    expect(toolLabel('future_tool')).toBe('future_tool');
  });

  it('collapses repeated calls but never hides a failure behind a success', () => {
    const chips = toolChips([
      { name: 'inventory_list_purchase_orders', mode: 'READ', status: 'SUCCESS' },
      { name: 'inventory_get_purchase_order', mode: 'READ', status: 'SUCCESS' },
      { name: 'inventory_get_stock_balances', mode: 'READ', status: 'SUCCESS' },
      { name: 'inventory_get_stock_balances', mode: 'READ', status: 'ERROR' },
      { name: 'inventory_list_suppliers', mode: 'READ', status: 'DENIED' },
      { name: 'x', mode: 'READ', status: 'UNKNOWN_TOOL' },
      { name: 'inventory_list_goods_receipts', mode: 'READ', status: 'INVALID' },
    ]);
    expect(chips).toEqual([
      { label: 'Purchase orders', tone: 'success' },
      { label: 'Stock balances', tone: 'success' },
      { label: 'Stock balances', tone: 'failed' },
      { label: 'Suppliers', tone: 'denied' },
      { label: 'x', tone: 'failed' },
      { label: 'Goods receipts', tone: 'failed' },
    ]);
  });

  it('names providers without inventing models', () => {
    expect(providerLabel('local')).toBe('Local model');
    expect(providerLabel('anthropic')).toBe('Cloud model');
    expect(providerLabel('openai')).toBe('Cloud model');
    expect(providerLabel(undefined)).toBe('AI model');
  });
});

describe('status → availability', () => {
  it('follows the three status shapes', () => {
    expect(availabilityFromStatus({ enabled: true, state: 'READY', available: true })).toBe('ready');
    expect(availabilityFromStatus({ enabled: true, state: 'READY', available: false })).toBe('hidden');
    expect(availabilityFromStatus({ enabled: false, state: 'DISABLED' })).toBe('disabled');
    expect(availabilityFromStatus({ enabled: false, state: 'MISCONFIGURED' })).toBe('misconfigured');
  });
});

describe('classifyChatError (error → UI state table)', () => {
  const error = (status: number, code: string) => new ApiError(status, code, 'server message');
  it.each([
    [503, 'AI_PROVIDER_UNAVAILABLE', { target: 'card', kind: 'offline' }],
    [429, 'AI_RATE_LIMITED', { target: 'card', kind: 'rate-limited' }],
    [500, 'AI_AUDIT_FAILED', { target: 'card', kind: 'audit-failed' }],
    [503, 'AI_DISABLED', { target: 'blocked', kind: 'disabled' }],
    [503, 'AI_UNAVAILABLE', { target: 'blocked', kind: 'misconfigured' }],
    [403, 'AI_FORBIDDEN', { target: 'blocked', kind: 'forbidden' }],
    [401, 'UNAUTHENTICATED', { target: 'card', kind: 'unauthenticated' }],
    [500, 'INTERNAL_ERROR', { target: 'card', kind: 'generic' }],
    [0, 'NETWORK_ERROR', { target: 'card', kind: 'generic' }],
  ])('%i %s', (status, code, expected) => {
    expect(classifyChatError(error(status, code))).toMatchObject(expected);
  });

  it('400 goes to the composer with the validation detail', () => {
    const outcome = classifyChatError(
      new ApiError(400, 'VALIDATION_ERROR', 'The request was invalid.', [{ path: ['history'], message: 'history is too long' }]),
    );
    expect(outcome).toEqual({ target: 'composer', message: 'The question could not be sent — history: history is too long' });
  });
});
