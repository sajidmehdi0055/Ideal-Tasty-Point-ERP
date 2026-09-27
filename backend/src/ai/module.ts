import type { AiAuditSink } from './audit.js';
import type { AiConfig, AiConfigResult, AiProviderSettings } from './config.js';
import { AiGateway } from './gateway.js';
import { createProvider } from './providers/factory.js';
import type { AiTool } from './tools/tool.js';
import { AiToolRegistry } from './tools/tool.js';
import type { AiProvider } from './types.js';

/** Composition input for the AI layer. Absent → AI is DISABLED and the ERP is unaffected. */
export interface AiAppOptions {
  config: AiConfigResult;
  auditSink: AiAuditSink;
  /** Tests inject fake providers here; production uses the config-driven factory. */
  providerFactory?: (settings: AiProviderSettings, timeoutMs: number) => AiProvider;
  logError?: (details: Record<string, unknown>, message: string) => void;
}

export type AiRuntime =
  | { state: 'DISABLED' }
  | { state: 'MISCONFIGURED' }
  | { state: 'READY'; config: AiConfig; gateway: AiGateway; primary: AiProvider; fallback: AiProvider | null };

export function createAiRuntime(options: AiAppOptions | undefined, tools: AiTool[]): AiRuntime {
  if (!options || options.config.state === 'DISABLED') return { state: 'DISABLED' };
  if (options.config.state === 'MISCONFIGURED') return { state: 'MISCONFIGURED' };
  const { config } = options.config;
  const factory = options.providerFactory ?? createProvider;
  const primary = factory(config.primary, config.requestTimeoutMs);
  const fallback = config.fallback ? factory(config.fallback, config.requestTimeoutMs) : null;
  const gateway = new AiGateway({ config, primary, fallback, registry: new AiToolRegistry(tools), audit: options.auditSink, logError: options.logError });
  return { state: 'READY', config, gateway, primary, fallback };
}
