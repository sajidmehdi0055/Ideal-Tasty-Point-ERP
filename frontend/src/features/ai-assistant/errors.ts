import { ApiError } from '../../lib/api-client';

/**
 * Error → UI state mapping, exactly as on the approved Figma board 104:3288.
 *  - card:     shown in place of the answer, inside the conversation
 *  - composer: inline message under the composer (400)
 *  - blocked:  the whole panel switches to a full state (frames 09 / 10)
 */
export type AiCardKind = 'offline' | 'rate-limited' | 'audit-failed' | 'unauthenticated' | 'generic';
export type AiBlockedKind = 'disabled' | 'misconfigured' | 'forbidden';

export type AiErrorOutcome =
  | { target: 'card'; kind: AiCardKind; status: number; code: string; message: string }
  | { target: 'composer'; message: string }
  | { target: 'blocked'; kind: AiBlockedKind };

export function classifyChatError(error: unknown): AiErrorOutcome {
  if (!(error instanceof ApiError)) {
    return { target: 'card', kind: 'generic', status: 0, code: 'UNKNOWN_ERROR', message: 'Something went wrong.' };
  }
  const { status, code, message } = error;
  if (status === 503 && code === 'AI_DISABLED') return { target: 'blocked', kind: 'disabled' };
  if (status === 503 && code === 'AI_UNAVAILABLE') return { target: 'blocked', kind: 'misconfigured' };
  if (status === 403 && code === 'AI_FORBIDDEN') return { target: 'blocked', kind: 'forbidden' };
  if (status === 503 && code === 'AI_PROVIDER_UNAVAILABLE') return { target: 'card', kind: 'offline', status, code, message };
  if (status === 429) return { target: 'card', kind: 'rate-limited', status, code, message };
  if (status === 500 && code === 'AI_AUDIT_FAILED') return { target: 'card', kind: 'audit-failed', status, code, message };
  if (status === 400) {
    const issue = error.issues?.[0];
    const detail = issue ? `${issue.path.join('.') || 'request'}: ${issue.message}` : message;
    return { target: 'composer', message: `The question could not be sent — ${detail}` };
  }
  if (status === 401) return { target: 'card', kind: 'unauthenticated', status, code, message };
  return { target: 'card', kind: 'generic', status, code, message };
}
