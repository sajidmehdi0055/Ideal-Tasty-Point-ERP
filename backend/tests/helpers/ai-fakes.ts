import type { AiAuditEntry, AiAuditSink } from '../../src/ai/audit.js';
import type { AiConfig } from '../../src/ai/config.js';
import type { AiChatRequest, AiChatResult, AiProvider, FetchLike } from '../../src/ai/types.js';
import { AiProviderError } from '../../src/ai/types.js';

type Step = AiChatResult | AiProviderError | ((request: AiChatRequest) => AiChatResult);

/** Scripted provider: returns the given steps in order and records every request. No network. */
export class FakeProvider implements AiProvider {
  readonly requests: AiChatRequest[] = [];
  constructor(private readonly steps: Step[], public readonly name = 'local', public readonly model = 'fake-model') {}

  async chat(request: AiChatRequest): Promise<AiChatResult> {
    // Snapshot: the gateway keeps appending to the same message array.
    this.requests.push({ ...request, messages: [...request.messages] });
    const step = this.steps.shift();
    if (!step) throw new Error('FakeProvider: no scripted step left');
    if (step instanceof AiProviderError) throw step;
    return typeof step === 'function' ? step(request) : step;
  }

  async healthCheck() {
    return { ok: true };
  }
}

export const answer = (text: string): AiChatResult => ({ text, toolCalls: [] });
export const callTool = (name: string, args: unknown, id = `call_${name}`): AiChatResult => ({ text: '', toolCalls: [{ id, name, arguments: args }] });

export class MemoryAuditSink implements AiAuditSink {
  readonly entries: AiAuditEntry[] = [];
  failWith: Error | null = null;
  async record(entry: AiAuditEntry) {
    if (this.failWith) throw this.failWith;
    this.entries.push(entry);
  }
}

export function testAiConfig(overrides: Partial<AiConfig> = {}): AiConfig {
  return {
    primary: { name: 'local', kind: 'openai-compatible', baseUrl: 'http://127.0.0.1:11434/v1', model: 'fake-model', apiKey: null },
    fallback: null,
    cloudEnabled: false,
    toolCallingEnabled: true,
    writeActionsEnabled: false,
    requestTimeoutMs: 5000,
    maxToolRounds: 4,
    maxToolCallsPerRound: 8,
    maxToolResultChars: 12000,
    rateLimitPerMinute: 100,
    ...overrides,
  };
}

export interface RecordedFetch { url: string; headers: Record<string, string>; body: unknown }

/** Fake fetch returning queued responses; records requests. */
export function fakeFetch(responses: ({ status: number; body: unknown } | Error)[]) {
  const calls: RecordedFetch[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body ? JSON.parse(init.body) as unknown : undefined });
    const next = responses.shift();
    if (!next) throw new Error('fakeFetch: no response left');
    if (next instanceof Error) throw next;
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.body };
  };
  return { impl, calls };
}
