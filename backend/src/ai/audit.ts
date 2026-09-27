import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { AuthContext } from '../auth/context.js';

export type AiAuditEventType = 'CHAT' | 'TOOL_CALL';
export type AiAuditOutcome =
  | 'SUCCESS' | 'ERROR' | 'DENIED' | 'INVALID' | 'UNKNOWN_TOOL' | 'PROPOSED' | 'PROVIDER_ERROR' | 'LIMIT_REACHED' | 'RATE_LIMITED';

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

/**
 * Removes control characters (incl. NUL, which PostgreSQL rejects in text and
 * jsonb) and caps length, so model-controlled text can never break an audit insert.
 */
export function cleanAuditText(value: string, max: number): string {
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ');
  const capped = cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
  // Lone UTF-16 surrogates (also from cutting a pair above) would make PostgreSQL reject jsonb: use U+FFFD.
  return capped.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
}

/** Keeps audit parameters small and free of long free text. */
export function sanitizeParams(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, unknown> = {};
  for (const [rawKey, raw] of Object.entries(value).slice(0, 20)) {
    const key = cleanAuditText(rawKey, 64);
    if (typeof raw === 'string') out[key] = cleanAuditText(raw, 200);
    else if (typeof raw === 'number' || typeof raw === 'boolean' || raw === null) out[key] = raw;
    else out[key] = '[omitted]';
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
        entry.eventType, entry.provider, entry.model, entry.promptVersion,
        entry.toolName === null ? null : cleanAuditText(entry.toolName, 99), entry.toolMode,
        entry.toolParams === null ? null : JSON.stringify(entry.toolParams), entry.permissionResult, entry.approvalStatus,
        entry.outcome, entry.errorCode, Math.max(0, Math.round(entry.durationMs)),
        entry.details === null ? null : JSON.stringify(entry.details)],
    );
  }
}
