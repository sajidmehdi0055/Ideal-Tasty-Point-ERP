import { AiProviderError } from '../types.js';
import type { FetchLike } from '../types.js';

/**
 * POSTs JSON with a hard timeout and maps every failure to a stable
 * AiProviderError code. Provider response bodies on errors are discarded so
 * that no upstream detail (or echoed key) can reach logs or clients.
 */
export async function postJson(fetchImpl: FetchLike, url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<unknown> {
  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    throw new AiProviderError(name === 'TimeoutError' || name === 'AbortError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE');
  }
  if (!response.ok) throw new AiProviderError(statusCode(response.status));
  try {
    return await response.json();
  } catch {
    throw new AiProviderError('PROVIDER_BAD_RESPONSE');
  }
}

function statusCode(status: number) {
  if (status === 401 || status === 403) return 'PROVIDER_AUTH_FAILED' as const;
  if (status === 429) return 'PROVIDER_RATE_LIMITED' as const;
  if (status === 408) return 'PROVIDER_TIMEOUT' as const;
  if (status >= 500) return 'PROVIDER_UNAVAILABLE' as const;
  return 'PROVIDER_BAD_REQUEST' as const;
}

export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/** Tool-call arguments arrive as a JSON string (OpenAI format). Invalid JSON stays a marker the tool validator rejects. */
export function parseArguments(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw ?? {};
  if (raw.trim() === '') return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { __invalid_json__: true };
  }
}
