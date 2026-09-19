import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient, ApiError } from './api-client';

async function captureError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('Expected the promise to reject with an ApiError');
}

describe('apiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves with the parsed JSON body on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 201 })));
    await expect(apiClient.post('/api/x', { a: 1 })).resolves.toEqual({ ok: true });
  });

  it('throws an ApiError carrying the server status/code/message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'FORBIDDEN', message: 'nope' }), { status: 403 })),
    );
    const error = await captureError(apiClient.post('/api/x', {}));
    expect(error).toMatchObject({ status: 403, code: 'FORBIDDEN', message: 'nope' });
  });

  it('carries Zod validation issues through for field-level mapping', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: 'VALIDATION_ERROR', issues: [{ path: ['item_name'], message: 'Required' }] }),
          { status: 400 },
        ),
      ),
    );
    const error = await captureError(apiClient.post('/api/x', {}));
    expect(error.issues).toEqual([{ path: ['item_name'], message: 'Required' }]);
  });

  it('maps an unreachable backend to a NETWORK_ERROR ApiError instead of an unhandled rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const error = await captureError(apiClient.get('/api/x'));
    expect(error.code).toBe('NETWORK_ERROR');
  });

  it('classifies a non-JSON response (e.g. a broken proxy returning HTML) instead of throwing a raw SyntaxError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>502 Bad Gateway</html>', { status: 502 })));
    const error = await captureError(apiClient.get('/api/x'));
    expect(error).toMatchObject({ status: 502, code: 'INVALID_RESPONSE' });
  });
});
