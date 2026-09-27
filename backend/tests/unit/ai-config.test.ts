import { describe, expect, it } from 'vitest';
import { loadAiConfig } from '../../src/ai/config.js';

describe('AI configuration (ADR-0011)', () => {
  it('is DISABLED by default and ignores every other AI variable, even invalid ones', () => {
    expect(loadAiConfig({})).toEqual({ state: 'DISABLED' });
    expect(loadAiConfig({ AI_ENABLED: 'false', AI_PRIMARY_PROVIDER: 'nonsense', AI_REQUEST_TIMEOUT_MS: 'abc' })).toEqual({ state: 'DISABLED' });
    expect(loadAiConfig({ AI_ENABLED: 'yes' })).toEqual({ state: 'DISABLED' });
  });

  it('defaults to the local provider with safe flags', () => {
    const result = loadAiConfig({ AI_ENABLED: 'true', AI_LOCAL_MODEL: 'qwen2.5:7b-instruct' });
    expect(result.state).toBe('READY');
    if (result.state !== 'READY') return;
    expect(result.config.primary).toEqual({ name: 'local', kind: 'openai-compatible', baseUrl: 'http://127.0.0.1:11434/v1', model: 'qwen2.5:7b-instruct', apiKey: null });
    expect(result.config).toMatchObject({ fallback: null, cloudEnabled: false, toolCallingEnabled: true, writeActionsEnabled: false, maxToolRounds: 4, rateLimitPerMinute: 20, requestTimeoutMs: 60000 });
  });

  it('requires a local model name', () => {
    expect(loadAiConfig({ AI_ENABLED: 'true' })).toEqual({ state: 'MISCONFIGURED', problems: ['AI_LOCAL_MODEL is required'] });
  });

  it('blocks cloud providers (primary or fallback) unless AI_CLOUD_ENABLED=true (owner decision AI-O-02)', () => {
    const primaryCloud = loadAiConfig({ AI_ENABLED: 'true', AI_PRIMARY_PROVIDER: 'openai', AI_OPENAI_API_KEY: 'sk-test-secret', AI_OPENAI_MODEL: 'm' });
    expect(primaryCloud.state).toBe('MISCONFIGURED');
    const fallbackCloud = loadAiConfig({ AI_ENABLED: 'true', AI_LOCAL_MODEL: 'm', AI_FALLBACK_PROVIDER: 'anthropic', AI_ANTHROPIC_API_KEY: 'k', AI_ANTHROPIC_MODEL: 'c' });
    expect(fallbackCloud.state).toBe('MISCONFIGURED');
    expect(JSON.stringify(primaryCloud)).not.toContain('sk-test-secret');
  });

  it('builds a local primary with a cloud fallback when cloud is explicitly enabled', () => {
    const result = loadAiConfig({
      AI_ENABLED: 'true', AI_LOCAL_MODEL: 'm', AI_CLOUD_ENABLED: 'true',
      AI_FALLBACK_PROVIDER: 'anthropic', AI_ANTHROPIC_API_KEY: 'k', AI_ANTHROPIC_MODEL: 'c',
    });
    expect(result.state).toBe('READY');
    if (result.state !== 'READY') return;
    expect(result.config.fallback).toMatchObject({ name: 'anthropic', kind: 'anthropic', model: 'c', baseUrl: 'https://api.anthropic.com/v1' });
  });

  it('rejects a fallback equal to the primary, missing cloud credentials and invalid numbers without echoing values', () => {
    expect(loadAiConfig({ AI_ENABLED: 'true', AI_LOCAL_MODEL: 'm', AI_FALLBACK_PROVIDER: 'local' }).state).toBe('MISCONFIGURED');
    expect(loadAiConfig({ AI_ENABLED: 'true', AI_CLOUD_ENABLED: 'true', AI_PRIMARY_PROVIDER: 'openai', AI_OPENAI_MODEL: 'm' }).state).toBe('MISCONFIGURED');
    const bad = loadAiConfig({ AI_ENABLED: 'true', AI_LOCAL_MODEL: 'm', AI_REQUEST_TIMEOUT_MS: 'abc', AI_LOCAL_BASE_URL: 'not a url' });
    expect(bad.state).toBe('MISCONFIGURED');
    expect(JSON.stringify(bad)).not.toContain('not a url');
    expect(loadAiConfig({ AI_ENABLED: 'true', AI_LOCAL_MODEL: 'm', AI_MAX_TOOL_ROUNDS: '50' }).state).toBe('MISCONFIGURED');
  });
});
