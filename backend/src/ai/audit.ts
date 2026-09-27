import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AuthContext } from '../auth/context.js';

export type AiAuditEventType = 'CHAT' | 'TOOL_CALL';
export type AiAuditOutcome =
  | 'SUCCESS' | 'ERROR' | 'DENIED' | 'INVALID' | 'UNKNOWN_TOOL' | 'PROPOSED' | 'PROVIDER_ERROR' | 'LIMIT_REACHED';

/** One immutable AI audit row (ADR-0011 D-07). Never contains prompt text, model answers or secrets. */
export interface AiAuditEntry {
  requestId: string;
  conversationId: string | null;
  auth: AuthContext;
  eventType: AiAuditEventType;
  provider: string | null;
  model: string | null;
  promptVersion: string;
  toolName: string | null;
  toolMode: 'READ' | 'WRITE' | null;
  toolParams: Record<string, unknown> | null;
  permissionResult: 'ALLOWED' | 'DENIED' | null;
  approvalStatus: 'NOT_REQUIRED' | 'PENDING' | null;
  outcome: AiAuditOutcome;
  errorCode: string | null;
  durationMs: number;
  details: Record<string, unknown> | null;
}

export interface AiAuditSink {
  record(entry: AiAuditEntry): Promise<void>;
}

/** Keeps audit parameters small and free of long free text. */
export function sanitizeParams(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value).slice(0, 20)) {
    if (typeof raw === 'string') out[key.slice(0, 64)] = raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
    else if (typeof raw === 'number' || typeof raw === 'boolean' || raw === null) out[key.slice(0, 64)] = raw;
    else out[key.slice(0, 64)] = '[omitted]';
  }
  return out;
}

export class PgAiAuditSink implements AiAuditSink {
  constructor(private readonly pool: Pool) {}

  async record(entry: AiAuditEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO ai_audit_log
         (id, request_id, conversation_id, branch_id, actor_id, actor_role, event_type, provider, model, prompt_version,
          tool_name, tool_mode, tool_params, permission_result, approval_status, outcome, error_code, duration_ms, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, $17, $18, $19::jsonb)`,
      [randomUUID(), entry.requestId, entry.conversationId, entry.auth.branchId, entry.auth.userId, entry.auth.role,
        entry.eventType, entry.provider, entry.model, entry.promptVersion, entry.toolName, entry.toolMode,
        entry.toolParams === null ? null : JSON.stringify(entry.toolParams), entry.permissionResult, entry.approvalStatus,
        entry.outcome, entry.errorCode, Math.max(0, Math.round(entry.durationMs)),
        entry.details === null ? null : JSON.stringify(entry.details)],
    );
  }
}
