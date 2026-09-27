import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AuthContextProvider } from '../auth/context.js';
import { requireAuthenticated } from '../auth/context.js';
import { AppError } from '../errors.js';
import type { AiRuntime } from './module.js';

const noNul = (value: string) => !value.includes('\u0000');

const chatBodySchema = z.object({
  message: z.string().trim().min(1).max(4000).refine(noNul, 'NUL characters are invalid'),
  conversation_id: z.uuid().optional(),
  // Fixed list: this value is placed in the system prompt, so free text is not accepted.
  module: z.enum(['inventory', 'purchasing', 'stock']).optional(),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(8000).refine(noNul, 'NUL characters are invalid'),
  }).strict()).max(20).optional(),
}).strict().refine(
  body => (body.history ?? []).reduce((sum, turn) => sum + turn.content.length, 0) <= 32000,
  { message: 'history is too long', path: ['history'] },
);

const statusQuerySchema = z.object({ check: z.enum(['true', 'false']).optional() }).strict();

/**
 * AI endpoints (ADR-0012 D-11). Both require the same trusted AuthContext as
 * every other route. They exist even when AI is disabled so the UI gets a
 * clear, stable answer instead of a 404.
 */
export function registerAiRoutes(app: FastifyInstance, runtime: AiRuntime, authProvider: AuthContextProvider) {
  app.get('/api/ai/status', async request => {
    const auth = requireAuthenticated(await authProvider(request));
    const query = statusQuerySchema.parse(request.query ?? {});
    if (runtime.state !== 'READY') return { enabled: false, state: runtime.state };
    // Provider details only for users who may use the assistant.
    if (!runtime.gateway.isAvailableTo(auth)) return { enabled: true, state: runtime.state, available: false };
    const { config } = runtime;
    const status = {
      enabled: true,
      state: runtime.state,
      available: true,
      provider: runtime.primary.name,
      model: runtime.primary.model,
      fallback_provider: runtime.fallback?.name ?? null,
      cloud_enabled: config.cloudEnabled,
      tool_calling_enabled: config.toolCallingEnabled,
      write_actions_enabled: config.writeActionsEnabled,
    };
    if (query.check !== 'true') return status;
    // A health check is a real model call: same role gate and rate limit as chat.
    return { ...status, health: await runtime.gateway.healthCheck(auth) };
  });

  app.post('/api/ai/chat', async request => {
    const auth = requireAuthenticated(await authProvider(request));
    if (runtime.state === 'DISABLED') throw new AppError(503, 'AI_DISABLED', 'AI assistant is turned off');
    if (runtime.state === 'MISCONFIGURED') throw new AppError(503, 'AI_UNAVAILABLE', 'AI assistant is not configured correctly');
    const body = chatBodySchema.parse(request.body);
    return runtime.gateway.chat({
      message: body.message,
      history: body.history ?? [],
      conversationId: body.conversation_id ?? null,
      moduleHint: body.module,
    }, auth);
  });
}
