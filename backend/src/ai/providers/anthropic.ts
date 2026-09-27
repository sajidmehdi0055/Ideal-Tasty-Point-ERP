import { z } from 'zod';
import type { AiChatRequest, AiChatResult, AiMessage, AiProvider, FetchLike } from '../types.js';
import { AiProviderError } from '../types.js';
import { joinUrl, postJson } from './http.js';

const ANTHROPIC_VERSION = '2023-06-01';

/** Anthropic Messages API provider (ADR-0011 D-02). Cloud: usable only when AI_CLOUD_ENABLED=true. */
export class AnthropicProvider implements AiProvider {
  constructor(
    public readonly name: string,
    public readonly model: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs: number,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
  ) {}

  async chat(request: AiChatRequest): Promise<AiChatResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: 2048,
      system: request.system,
      messages: toWire(request.messages),
    };
    if (request.tools.length > 0) {
      body.tools = request.tools.map(tool => ({ name: tool.name, description: tool.description, input_schema: tool.parameters }));
    }
    const raw = await postJson(this.fetchImpl, joinUrl(this.baseUrl, 'messages'),
      { 'x-api-key': this.apiKey, 'anthropic-version': ANTHROPIC_VERSION }, body, this.timeoutMs);
    const parsed = responseSchema.safeParse(raw);
    if (!parsed.success) throw new AiProviderError('PROVIDER_BAD_RESPONSE');
    // A reply cut off by the token limit may contain a truncated tool call: never act on it.
    if (parsed.data.stop_reason === 'max_tokens' && parsed.data.content.some(block => block.type === 'tool_use')) {
      throw new AiProviderError('PROVIDER_BAD_RESPONSE');
    }
    const text: string[] = [];
    const toolCalls: AiChatResult['toolCalls'] = [];
    for (const block of parsed.data.content) {
      if (block.type === 'text' && typeof block.text === 'string') text.push(block.text);
      if (block.type === 'tool_use' && block.id && block.name) toolCalls.push({ id: block.id, name: block.name, arguments: block.input ?? {} });
    }
    return { text: text.join('\n'), toolCalls };
  }

  async healthCheck() {
    try {
      await this.chat({ system: 'Reply with OK.', messages: [{ role: 'user', content: 'ping' }], tools: [] });
      return { ok: true };
    } catch (error) {
      return { ok: false, code: error instanceof AiProviderError ? error.code : 'PROVIDER_UNAVAILABLE' };
    }
  }
}

type WireBlock = Record<string, unknown>;
type WireMessage = { role: 'user' | 'assistant'; content: WireBlock[] };

/** Converts neutral messages; consecutive tool results are merged into one user turn as Anthropic requires. */
function toWire(messages: AiMessage[]): WireMessage[] {
  const out: WireMessage[] = [];
  const push = (role: WireMessage['role'], block: WireBlock) => {
    const last = out.at(-1);
    if (last && last.role === role) last.content.push(block);
    else out.push({ role, content: [block] });
  };
  for (const message of messages) {
    if (message.role === 'user') push('user', { type: 'text', text: message.content });
    else if (message.role === 'tool') push('user', { type: 'tool_result', tool_use_id: message.toolCallId, content: message.content, ...(message.isError ? { is_error: true } : {}) });
    else {
      if (message.content) push('assistant', { type: 'text', text: message.content });
      for (const call of message.toolCalls ?? []) push('assistant', { type: 'tool_use', id: call.id, name: call.name, input: call.arguments ?? {} });
    }
  }
  return out;
}

const responseSchema = z.object({
  stop_reason: z.string().nullish(),
  content: z.array(z.object({
    type: z.string(),
    text: z.string().optional(),
    id: z.string().optional(),
    name: z.string().optional(),
    input: z.unknown().optional(),
  })),
});
