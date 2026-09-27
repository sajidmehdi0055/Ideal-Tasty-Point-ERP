/** Provider-neutral chat types (ADR-0012 D-01). Business modules never see provider formats. */
export interface AiToolCall {
  id: string;
  name: string;
  /** Raw arguments from the model. Untrusted: always validated by the tool's zod schema. */
  arguments: unknown;
}

export type AiMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: AiToolCall[] }
  | { role: 'tool'; toolCallId: string; toolName: string; content: string; isError?: boolean };

export interface AiToolSpec {
  name: string;
  description: string;
  /** JSON Schema of the tool's input object. */
  parameters: Record<string, unknown>;
}

export interface AiChatRequest {
  system: string;
  messages: AiMessage[];
  tools: AiToolSpec[];
}

export interface AiChatResult {
  text: string;
  toolCalls: AiToolCall[];
}

export interface AiProvider {
  /** Configured provider name, e.g. "local", "openai", "anthropic". */
  readonly name: string;
  readonly model: string;
  /** One model turn. Tools are optional; a provider that gets none behaves as plain generate/chat. */
  chat(request: AiChatRequest): Promise<AiChatResult>;
  /** Cheap reachability check. Never throws. */
  healthCheck(): Promise<{ ok: boolean; code?: string }>;
}

export type AiProviderErrorCode =
  | 'PROVIDER_UNAVAILABLE' | 'PROVIDER_TIMEOUT' | 'PROVIDER_RATE_LIMITED'
  | 'PROVIDER_AUTH_FAILED' | 'PROVIDER_BAD_REQUEST' | 'PROVIDER_BAD_RESPONSE';

/** Error raised by providers. Carries only a stable code: never a provider body, URL or key. */
export class AiProviderError extends Error {
  constructor(public readonly code: AiProviderErrorCode) {
    super(code);
    this.name = 'AiProviderError';
  }

  /** Whether trying the fallback provider makes sense (provider-side or transient failure). */
  get retryable(): boolean {
    return this.code === 'PROVIDER_UNAVAILABLE' || this.code === 'PROVIDER_TIMEOUT'
      || this.code === 'PROVIDER_RATE_LIMITED' || this.code === 'PROVIDER_BAD_RESPONSE';
  }
}

export type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;
