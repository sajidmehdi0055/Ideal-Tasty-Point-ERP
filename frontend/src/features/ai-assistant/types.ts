/**
 * Contract types for the AI-S01 backend (docs/architecture/AI_ARCHITECTURE.md §6).
 * Mirrors what the backend actually returns — nothing here is invented.
 */

export type AiModule = 'inventory' | 'purchasing' | 'stock';

export type AiToolCallStatus = 'SUCCESS' | 'DENIED' | 'INVALID' | 'UNKNOWN_TOOL' | 'ERROR' | 'PROPOSED';

export interface AiToolCall {
  name: string;
  mode: 'READ' | 'WRITE';
  status: AiToolCallStatus;
}

export interface AiChatMetadata {
  request_id: string;
  conversation_id: string | null;
  prompt_version: string;
  rounds: number;
  fallback_used: boolean;
  limit_reached: boolean;
}

export interface AiChatResponse {
  message: string;
  provider: string;
  model: string;
  tool_calls: AiToolCall[];
  requires_approval: boolean;
  /** Shape not defined until AI-S02 — never rendered in Phase 1. */
  proposed_action: unknown;
  metadata: AiChatMetadata;
}

export interface AiHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiChatRequest {
  message: string;
  module?: AiModule;
  history?: AiHistoryTurn[];
}

/**
 * GET /api/ai/status. Three shapes:
 *  - `{ enabled: false, state }` — DISABLED / MISCONFIGURED
 *  - `{ enabled: true, state, available: false }` — caller may not use the assistant
 *  - `{ enabled: true, state, available: true, provider, model, … }`
 */
export interface AiStatusResponse {
  enabled: boolean;
  state: 'DISABLED' | 'MISCONFIGURED' | 'READY' | string;
  available?: boolean;
  provider?: string;
  model?: string;
  fallback_provider?: string | null;
  cloud_enabled?: boolean;
  tool_calling_enabled?: boolean;
  write_actions_enabled?: boolean;
}
