import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAiStatus, sendAiChat } from '../api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI API client', () => {
  it('status uses the plain endpoint — never ?check=true (a real, rate-limited model call)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ enabled: false, state: 'DISABLED' })));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getAiStatus()).resolves.toEqual({ enabled: false, state: 'DISABLED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/ai/status');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'GET' });
  });

  it('chat POSTs the request body unchanged', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'ok' })));
    vi.stubGlobal('fetch', fetchMock);
    const request = { message: 'hi', module: 'stock' as const, history: [{ role: 'user' as const, content: 'a' }] };
    await sendAiChat(request);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/ai/chat');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify(request) });
  });
});
