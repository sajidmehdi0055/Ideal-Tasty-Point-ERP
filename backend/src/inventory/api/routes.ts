import type { FastifyInstance } from 'fastify';
import type { AuthContextProvider } from '../../auth/context.js';
import { requireItemEditor } from '../../auth/context.js';
import type { ItemService } from '../application/item-service.js';

export function registerItemRoutes(app: FastifyInstance, service: ItemService, authProvider: AuthContextProvider) {
  app.post('/api/inventory/items', async (request, reply) => {
    const context = requireItemEditor(await authProvider(request));
    return reply.code(201).send(await service.create(request.body, context));
  });

  app.patch<{ Params: { id: string } }>('/api/inventory/items/:id', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.update(request.params.id, request.body, context);
  });
}
