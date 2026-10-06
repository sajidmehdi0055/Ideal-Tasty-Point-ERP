import { describe, expect, it } from 'vitest';
import { AnthropicProvider } from '../../src/ai/providers/anthropic.js';
import { createProvider } from '../../src/ai/providers/factory.js';
import { OpenAiCompatibleProvider } from '../../src/ai/providers/openai-compatible.js';
import type { AiChatRequest, FetchLike } from '../../src/ai/types.js';
import { AiProviderError } from '../../src/ai/types.js';
import { fakeFetch } from '../helpers/ai-fakes.js';

const request: AiChatRequest = {
  system: 'SYSTEM',
  messages: [
    { role: 'user', content: 'stock?' },
    { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'inventory_get_stock_balances', arguments: { limit: 5 } }, { id: 't2', name: 'inventory_list_suppliers', arguments: {} }] },
    { role: 'tool', toolCallId: 't1', toolName: 'inventory_get_stock_balances', content: '{"a":1}' },
    { role: 'tool', toolCallId: 't2', toolName: 'inventory_list_suppliers', content: '{"b":2}' },
  ],
  tools: [{ name: 'inventory_get_stock_balances', description: 'd', parameters: { type: 'object' } }],
};

async function providerError(promise: Promise<unknown>) {
  try { await promise; } catch (error) { return error; }
  throw new Error('expected rejection');
}

describe('OpenAI-compatible provider (local model servers and OpenAI)', () => {
  it('sends the chat-completions wire format and parses tool calls', async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: { choices: [{ message: { content: null, tool_calls: [
      { id: 'c1', function: { name: 'inventory_list_suppliers', arguments: '{"name_contains":"ali"}' } },
      { function: { name: 'inventory_get_stock_balances', arguments: '{not json' } },
    ] } }] } }]);
    const provider = new OpenAiCompatibleProvider('local', 'qwen', 'http://127.0.0.1:11434/v1/', null, 1000, impl);
    const result = await provider.chat(request);
    expect(calls[0]!.url).toBe('http://127.0.0.1:11434/v1/chat/completions');
    expect(calls[0]!.headers).not.toHaveProperty('authorization');
    const body = calls[0]!.body as { messages: unknown[] };
    expect(body).toMatchObject({
      model: 'qwen',
      tools: [{ type: 'function', function: { name: 'inventory_get_stock_balances', description: 'd', parameters: { type: 'object' } } }],
    });
    expect(body.messages[0]).toEqual({ role: 'system', content: 'SYSTEM' });
    expect(body.messages[2]).toMatchObject({ tool_calls: [{ id: 't1', type: 'function', function: { name: 'inventory_get_stock_balances', arguments: '{"limit":5}' } }, { id: 't2' }] });
    expect(body.messages[3]).toEqual({ role: 'tool', tool_call_id: 't1', content: '{"a":1}' });
    expect(result.toolCalls).toEqual([
      { id: 'c1', name: 'inventory_list_suppliers', arguments: { name_contains: 'ali' } },
      { id: expect.stringMatching(/^call_[0-9a-f-]{36}$/), name: 'inventory_get_stock_balances', arguments: { __invalid_json__: true } },
    ]);
  });

  it('sends a bearer key only when configured and omits tools when none are offered', async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: { choices: [{ message: { content: 'hi' } }] } }]);
    const provider = new OpenAiCompatibleProvider('openai', 'gpt', 'https://api.openai.com/v1', 'sk-abc', 1000, impl);
    expect(await provider.chat({ system: 's', messages: [{ role: 'user', content: 'x' }], tools: [] })).toEqual({ text: 'hi', toolCalls: [] });
    expect(calls[0]!.headers.authorization).toBe('Bearer sk-abc');
    expect(calls[0]!.body).not.toHaveProperty('tools');
  });

  it.each([
    [500, 'PROVIDER_UNAVAILABLE', true], [503, 'PROVIDER_UNAVAILABLE', true], [429, 'PROVIDER_RATE_LIMITED', true],
    [401, 'PROVIDER_AUTH_FAILED', false], [400, 'PROVIDER_BAD_REQUEST', false], [408, 'PROVIDER_TIMEOUT', true],
  ])('maps HTTP %i to %s without leaking the provider body', async (status, code, retryable) => {
    const { impl } = fakeFetch([{ status, body: { error: 'secret upstream detail sk-abc' } }]);
    const error = await providerError(new OpenAiCompatibleProvider('openai', 'gpt', 'https://x/v1', 'sk-abc', 1000, impl).chat(request));
    expect(error).toBeInstanceOf(AiProviderError);
    expect((error as AiProviderError).code).toBe(code);
    expect((error as AiProviderError).retryable).toBe(retryable);
    expect(String((error as Error).message)).not.toContain('secret');
  });

  it('maps network errors, timeouts and malformed bodies', async () => {
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' });
    const { impl } = fakeFetch([new TypeError('fetch failed'), timeout, { status: 200, body: { choices: [] } }, { status: 200, body: 'nope' }]);
    const provider = new OpenAiCompatibleProvider('local', 'm', 'http://x/v1', null, 1000, impl);
    expect(((await providerError(provider.chat(request))) as AiProviderError).code).toBe('PROVIDER_UNAVAILABLE');
    expect(((await providerError(provider.chat(request))) as AiProviderError).code).toBe('PROVIDER_TIMEOUT');
    expect(((await providerError(provider.chat(request))) as AiProviderError).code).toBe('PROVIDER_BAD_RESPONSE');
    expect(((await providerError(provider.chat(request))) as AiProviderError).code).toBe('PROVIDER_BAD_RESPONSE');
  });

  it('never acts on tool calls from a reply cut off by the token limit', async () => {
    const { impl } = fakeFetch([{ status: 200, body: { choices: [{ finish_reason: 'length', message: { tool_calls: [{ id: 'x', function: { name: 'a', arguments: '{"li' } }] } }] } }]);
    const error = await providerError(new OpenAiCompatibleProvider('local', 'm', 'http://x/v1', null, 1000, impl).chat(request));
    expect((error as AiProviderError).code).toBe('PROVIDER_BAD_RESPONSE');
  });

  it('healthCheck never throws', async () => {
    const { impl } = fakeFetch([new TypeError('down')]);
    expect(await new OpenAiCompatibleProvider('local', 'm', 'http://x/v1', null, 1000, impl).healthCheck()).toEqual({ ok: false, code: 'PROVIDER_UNAVAILABLE' });
  });
});

describe('Anthropic provider', () => {
  it('sends the Messages API format, merges tool results into one user turn and parses tool_use', async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: { content: [
      { type: 'text', text: 'Checking.' },
      { type: 'tool_use', id: 'tu1', name: 'inventory_list_suppliers', input: { limit: 3 } },
    ] } }]);
    const provider = new AnthropicProvider('anthropic', 'claude-x', 'https://api.anthropic.com/v1', 'ak', 1000, impl);
    const result = await provider.chat(request);
    expect(calls[0]!.url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0]!.headers).toMatchObject({ 'x-api-key': 'ak', 'anthropic-version': '2023-06-01' });
    const body = calls[0]!.body as { system: string; messages: unknown[] };
    expect(body.system).toBe('SYSTEM');
    expect(body.messages).toHaveLength(3);
    expect(body.messages[1]).toEqual({ role: 'assistant', content: [
      { type: 'tool_use', id: 't1', name: 'inventory_get_stock_balances', input: { limit: 5 } },
      { type: 'tool_use', id: 't2', name: 'inventory_list_suppliers', input: {} },
    ] });
    expect(body.messages[2]).toEqual({ role: 'user', content: [
      { type: 'tool_result', tool_use_id: 't1', content: '{"a":1}' },
      { type: 'tool_result', tool_use_id: 't2', content: '{"b":2}' },
    ] });
    expect(body).toMatchObject({ tools: [{ name: 'inventory_get_stock_balances', description: 'd', input_schema: { type: 'object' } }] });
    expect(result).toEqual({ text: 'Checking.', toolCalls: [{ id: 'tu1', name: 'inventory_list_suppliers', arguments: { limit: 3 } }] });
  });

  it('marks failed tool results with is_error and rejects tool_use cut off by max_tokens', async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: { stop_reason: 'max_tokens', content: [{ type: 'tool_use', id: 'x', name: 'a', input: {} }] } }]);
    const provider = new AnthropicProvider('anthropic', 'c', 'https://a/v1', 'k', 1000, impl);
    const failed: AiChatRequest = { ...request, messages: [request.messages[0]!, { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'x', arguments: {} }] }, { role: 'tool', toolCallId: 't1', toolName: 'x', content: '{}', isError: true }] };
    const error = await providerError(provider.chat(failed));
    expect((error as AiProviderError).code).toBe('PROVIDER_BAD_RESPONSE');
    expect((calls[0]!.body as { messages: unknown[] }).messages[2]).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '{}', is_error: true }] });
  });

  it('rejects malformed responses', async () => {
    const { impl } = fakeFetch([{ status: 200, body: { nope: true } }]);
    const error = await providerError(new AnthropicProvider('anthropic', 'c', 'https://a/v1', 'k', 1000, impl).chat(request));
    expect((error as AiProviderError).code).toBe('PROVIDER_BAD_RESPONSE');
  });
});

describe('provider factory (provider chosen by configuration only)', () => {
  it('maps settings to the adapter class', () => {
    expect(createProvider({ name: 'local', kind: 'openai-compatible', baseUrl: 'http://x/v1', model: 'm', apiKey: null }, 1000)).toBeInstanceOf(OpenAiCompatibleProvider);
    const anthropic = createProvider({ name: 'anthropic', kind: 'anthropic', baseUrl: 'https://a/v1', model: 'c', apiKey: 'k' }, 1000);
    expect(anthropic).toBeInstanceOf(AnthropicProvider);
    expect([anthropic.name, anthropic.model]).toEqual(['anthropic', 'c']);
  });
});

describe('provider redirect safety (AI-O-02)', () => {
  it.each([307, 308])('blocks HTTP %i before forwarding ERP data to another destination', async status => {
    const destinations: string[] = [];
    const impl: FetchLike = async (url, init) => {
      destinations.push(url);
      // Simulate fetch handling a redirect response from the local endpoint.
      const response = new Response(null, { status, headers: { location: 'https://outside.example/model' } });
      if (init.redirect === 'error') throw new TypeError('redirect disallowed');
      destinations.push(response.headers.get('location')!);
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'leaked' } }] }) };
    };
    const provider = new OpenAiCompatibleProvider('local', 'm', 'http://127.0.0.1:11434/v1', null, 1000, impl);
    await expect(provider.chat(request)).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(destinations).toEqual(['http://127.0.0.1:11434/v1/chat/completions']);
  });
});
describe('provider redirect safety over real HTTP (AI-O-02)', () => {
  it.each([301, 302, 303, 307, 308])('real fetch: HTTP %i from the model endpoint is not followed, for both providers', async status => {
    const { createServer } = await import('node:http');
    let outsideHits = 0;
    const outside = createServer((_req, res) => { outsideHits += 1; res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); });
    await new Promise<void>(resolve => outside.listen(0, '127.0.0.1', resolve));
    const outsidePort = (outside.address() as { port: number }).port;
    const redirector = createServer((_req, res) => { res.writeHead(status, { location: `http://127.0.0.1:${outsidePort}/steal` }); res.end(); });
    await new Promise<void>(resolve => redirector.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(redirector.address() as { port: number }).port}/v1`;
    try {
      // Default fetchImpl (global fetch) — no fake transport.
      const openai = new OpenAiCompatibleProvider('local', 'm', base, 'sk-test-not-real', 2000);
      const anthropic = new AnthropicProvider('anthropic', 'm', base, 'sk-test-not-real', 2000);
      expect(await providerError(openai.chat(request))).toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
      expect(await providerError(anthropic.chat(request))).toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
      expect(outsideHits).toBe(0);
    } finally {
      await new Promise(resolve => redirector.close(resolve));
      await new Promise(resolve => outside.close(resolve));
    }
  });
});
