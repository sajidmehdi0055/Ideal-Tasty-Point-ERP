import Fastify from 'fastify';
import { ZodError } from 'zod';
import type { AuthContextProvider } from './auth/context.js';
import { AppError } from './errors.js';
import type { ItemRepository } from './inventory/application/item-repository.js';
import { ItemService } from './inventory/application/item-service.js';
import { registerItemRoutes } from './inventory/api/routes.js';

export interface AppOptions { repository: ItemRepository; authProvider?: AuthContextProvider }

export function buildApp(options: AppOptions) {
  const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.cookie'] } });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) return reply.code(error.status).send({ error: error.code, message: error.message });
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'VALIDATION_ERROR', issues: error.issues.map(issue => ({ path: issue.path, message: issue.message })) });
    }
    if (error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: 'INVALID_REQUEST' });
    }
    // Avoid logging SQL values, credentials or driver error detail.
    request.log.error({ requestId: request.id, errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Item operation failed');
    return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'Operation failed' });
  });
  registerItemRoutes(app, new ItemService(options.repository), options.authProvider ?? (async () => null));
  return app;
}
