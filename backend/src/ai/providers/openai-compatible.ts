import { z } from 'zod';
import type { AiChatRequest, AiChatResult, AiMessage, AiProvider, FetchLike } from '../types.js';
import { AiProviderError } from '../types.js';
import { joinUrl, parseArguments, postJson } from './http.js';

/**
 * OpenAI Chat Completions compatible provider (ADR-0011 D-02). The same adapter
 * serves a local model server (Ollama, LM Studio, llama.cpp server, vLLM...)
 * and OpenAI itself: only base URL, model and optional key differ.
 */
export class OpenAiCompatibleProvider implements AiProvider {
  constructor(
    public readonly name: string,
    public readonly model: string,
    private readonly baseUrl: string,
    private readonly apiKey: string | null,
    private readonly timeoutMs: number,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
  ) {}

  private headers(): Record<string, string> {
    return this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {};
  }

  async chat(request: AiChatRequest): Promise<AiChatResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: [{ role: 'system', content: request.system }, ...request.messages.map(toWire)],
      temperature: 0.2,
      stream: false,
    };
    if (request.tools.length > 0) {
      body.tools = request.tools.map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
      body.tool_choice = 'auto';
    }
    const raw = await postJson(this.fetchImpl, joinUrl(this.baseUrl, 'chat/completions'), this.headers(), body, this.timeoutMs);
    const parsed = responseSchema.safeParse(raw);
    if (!parsed.success) throw new AiProviderError('PROVIDER_BAD_RESPONSE');
    const message = parsed.data.choices[0]!.message;
    return {
      text: message.content ?? '',
      toolCalls: (message.tool_calls ?? []).map((call, index) => ({
        id: call.id ?? `call_${index}`,
        name: call.function.name,
        arguments: parseArguments(call.function.arguments),
      })),
    };
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

function toWire(message: AiMessage) {
  if (message.role === 'tool') return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: message.content || null,
      tool_calls: message.toolCalls.map(call => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) } })),
    };
  }
  return { role: message.role, content: message.content };
}

const responseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string().nullish(),
      tool_calls: z.array(z.object({
        id: z.string().optional(),
        function: z.object({ name: z.string().min(1), arguments: z.unknown() }),
      })).nullish(),
    }),
  })).min(1),
});
