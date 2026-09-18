import type { FastifyInstance } from 'fastify';
import type { AuthContextProvider } from '../../auth/context.js';
import { requireItemEditor } from '../../auth/context.js';
import type { PackVariantService } from '../application/pack-variant-service.js';

export function registerPackVariantRoutes(app: FastifyInstance, service: PackVariantService, authProvider: AuthContextProvider) {
  app.post('/api/inventory/pack-variants', async (request, reply) => {
    const context = requireItemEditor(await authProvider(request));
    return reply.code(201).send(await service.create(request.body, context));
  });

  app.patch<{ Params: { id: string } }>('/api/inventory/pack-variants/:id', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.update(request.params.id, request.body, context);
  });

  app.get('/api/inventory/pack-variants', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.list(context);
  });
}
