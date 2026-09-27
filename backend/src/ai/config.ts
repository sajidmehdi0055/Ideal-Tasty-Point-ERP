import { z } from 'zod';

/**
 * AI configuration (ADR-0011). Everything is OFF by default. When AI_ENABLED is
 * not "true" nothing else is read or validated, so a missing or wrong AI setting
 * can never stop the ERP from starting.
 */
export const AI_PROVIDER_NAMES = ['local', 'openai', 'anthropic'] as const;
export type AiProviderName = typeof AI_PROVIDER_NAMES[number];
/** Providers that send ERP data outside the business premises (AI-O-02). */
export const CLOUD_PROVIDERS: ReadonlySet<AiProviderName> = new Set(['openai', 'anthropic']);

export interface AiProviderSettings {
  name: AiProviderName;
  kind: 'openai-compatible' | 'anthropic';
  baseUrl: string;
  model: string;
  apiKey: string | null;
}

export interface AiConfig {
  primary: AiProviderSettings;
  fallback: AiProviderSettings | null;
  cloudEnabled: boolean;
  toolCallingEnabled: boolean;
  writeActionsEnabled: boolean;
  requestTimeoutMs: number;
  maxToolRounds: number;
  maxToolCallsPerRound: number;
  maxToolResultChars: number;
  rateLimitPerMinute: number;
}

export type AiConfigResult =
  | { state: 'DISABLED' }
  | { state: 'READY'; config: AiConfig }
  | { state: 'MISCONFIGURED'; problems: string[] };

const flag = (defaultValue: boolean) => z.enum(['true', 'false']).optional()
  .transform(value => value === undefined ? defaultValue : value === 'true');
const optionalText = z.string().trim().optional().transform(value => value ? value : undefined);
const intInRange = (min: number, max: number, defaultValue: number) =>
  z.string().trim().optional()
    .transform(value => value ? Number(value) : defaultValue)
    .pipe(z.number().int().min(min).max(max));

const envSchema = z.object({
  AI_PRIMARY_PROVIDER: optionalText.pipe(z.enum(AI_PROVIDER_NAMES).default('local')),
  AI_FALLBACK_PROVIDER: optionalText.pipe(z.enum(AI_PROVIDER_NAMES).optional()),
  AI_CLOUD_ENABLED: flag(false),
  AI_TOOL_CALLING_ENABLED: flag(true),
  AI_WRITE_ACTIONS_ENABLED: flag(false),
  AI_LOCAL_BASE_URL: optionalText.pipe(z.url().default('http://127.0.0.1:11434/v1')),
  AI_LOCAL_MODEL: optionalText,
  AI_LOCAL_API_KEY: optionalText,
  AI_OPENAI_BASE_URL: optionalText.pipe(z.url().default('https://api.openai.com/v1')),
  AI_OPENAI_API_KEY: optionalText,
  AI_OPENAI_MODEL: optionalText,
  AI_ANTHROPIC_BASE_URL: optionalText.pipe(z.url().default('https://api.anthropic.com/v1')),
  AI_ANTHROPIC_API_KEY: optionalText,
  AI_ANTHROPIC_MODEL: optionalText,
  AI_REQUEST_TIMEOUT_MS: intInRange(1000, 300000, 60000),
  AI_MAX_TOOL_ROUNDS: intInRange(1, 10, 4),
  AI_RATE_LIMIT_PER_MINUTE: intInRange(1, 1000, 20),
});

export function loadAiConfig(env: Record<string, string | undefined>): AiConfigResult {
  if (env.AI_ENABLED?.trim() !== 'true') return { state: 'DISABLED' };
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    // Only variable names are reported, never values (they may hold secrets).
    return { state: 'MISCONFIGURED', problems: parsed.error.issues.map(issue => `${issue.path.join('.')} is invalid`) };
  }
  const e = parsed.data;
  const problems: string[] = [];
  const settingsFor = (name: AiProviderName): AiProviderSettings | null => {
    if (CLOUD_PROVIDERS.has(name) && !e.AI_CLOUD_ENABLED) {
      problems.push(`${name} is a cloud provider but AI_CLOUD_ENABLED is not true`);
      return null;
    }
    if (name === 'local') {
      if (!e.AI_LOCAL_MODEL) { problems.push('AI_LOCAL_MODEL is required'); return null; }
      if (!e.AI_CLOUD_ENABLED && !isOnPremisesUrl(e.AI_LOCAL_BASE_URL)) {
        problems.push('AI_LOCAL_BASE_URL must point to this computer or the local network unless AI_CLOUD_ENABLED is true');
        return null;
      }
      return { name, kind: 'openai-compatible', baseUrl: e.AI_LOCAL_BASE_URL, model: e.AI_LOCAL_MODEL, apiKey: e.AI_LOCAL_API_KEY ?? null };
    }
    if (name === 'openai') {
      if (!e.AI_OPENAI_API_KEY || !e.AI_OPENAI_MODEL) { problems.push('AI_OPENAI_API_KEY and AI_OPENAI_MODEL are required'); return null; }
      return { name, kind: 'openai-compatible', baseUrl: e.AI_OPENAI_BASE_URL, model: e.AI_OPENAI_MODEL, apiKey: e.AI_OPENAI_API_KEY };
    }
    if (!e.AI_ANTHROPIC_API_KEY || !e.AI_ANTHROPIC_MODEL) { problems.push('AI_ANTHROPIC_API_KEY and AI_ANTHROPIC_MODEL are required'); return null; }
    return { name, kind: 'anthropic', baseUrl: e.AI_ANTHROPIC_BASE_URL, model: e.AI_ANTHROPIC_MODEL, apiKey: e.AI_ANTHROPIC_API_KEY };
  };
  const primary = settingsFor(e.AI_PRIMARY_PROVIDER);
  let fallback: AiProviderSettings | null = null;
  if (e.AI_FALLBACK_PROVIDER) {
    if (e.AI_FALLBACK_PROVIDER === e.AI_PRIMARY_PROVIDER) problems.push('AI_FALLBACK_PROVIDER must differ from AI_PRIMARY_PROVIDER');
    else fallback = settingsFor(e.AI_FALLBACK_PROVIDER);
  }
  if (!primary || problems.length > 0) return { state: 'MISCONFIGURED', problems };
  return {
    state: 'READY',
    config: {
      primary, fallback,
      cloudEnabled: e.AI_CLOUD_ENABLED,
      toolCallingEnabled: e.AI_TOOL_CALLING_ENABLED,
      writeActionsEnabled: e.AI_WRITE_ACTIONS_ENABLED,
      requestTimeoutMs: e.AI_REQUEST_TIMEOUT_MS,
      maxToolRounds: e.AI_MAX_TOOL_ROUNDS,
      maxToolCallsPerRound: 8,
      maxToolResultChars: 12000,
      rateLimitPerMinute: e.AI_RATE_LIMIT_PER_MINUTE,
    },
  };
}

/**
 * AI-O-02 guard for the "local" provider: with cloud disabled, the local model
 * server must be on this machine or the private network (loopback, RFC 1918,
 * link-local, IPv6 ULA, "localhost", single-label LAN names, *.local / *.lan).
 */
export function isOnPremisesUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return false;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true;
  if (/^(fc|fd)[0-9a-f]{2}:/.test(host) || host.startsWith('fe80:')) return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (host.includes(':')) return false;
  return !host.includes('.') || host.endsWith('.local') || host.endsWith('.lan');
}
