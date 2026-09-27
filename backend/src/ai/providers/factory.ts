import type { AiProviderSettings } from '../config.js';
import type { AiProvider, FetchLike } from '../types.js';
import { AnthropicProvider } from './anthropic.js';
import { OpenAiCompatibleProvider } from './openai-compatible.js';

/** The only place that maps configuration to a concrete provider class. Add new providers here. */
export function createProvider(settings: AiProviderSettings, timeoutMs: number, fetchImpl?: FetchLike): AiProvider {
  if (settings.kind === 'anthropic') {
    return new AnthropicProvider(settings.name, settings.model, settings.baseUrl, settings.apiKey ?? '', timeoutMs, fetchImpl);
  }
  return new OpenAiCompatibleProvider(settings.name, settings.model, settings.baseUrl, settings.apiKey, timeoutMs, fetchImpl);
}
