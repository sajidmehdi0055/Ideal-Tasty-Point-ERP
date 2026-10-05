import type { FastifyInstance } from 'fastify';
import type { AuthContextProvider } from '../../auth/context.js';
import { requireItemEditor } from '../../auth/context.js';
import type { ItemService } from '../application/item-service.js';

export const ITEM_LIST_TRUNCATED_HEADER = 'x-result-truncated';

export function registerItemRoutes(app: FastifyInstance, service: ItemService, authProvider: AuthContextProvider) {
  app.post('/api/inventory/items', async (request, reply) => {
    const context = requireItemEditor(await authProvider(request));
    return reply.code(201).send(await service.create(request.body, context));
  });

  app.patch<{ Params: { id: string } }>('/api/inventory/items/:id', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.update(request.params.id, request.body, context);
  });

  // The body stays a plain JSON array of Item; when more items matched than
  // `limit`, only the first `limit` are sent and this header says so.
  app.get('/api/inventory/items', async (request, reply) => {
    const context = requireItemEditor(await authProvider(request));
    const result = await service.list(request.query, context);
    if (result.truncated) reply.header(ITEM_LIST_TRUNCATED_HEADER, 'true');
    return result.items;
  });

  app.get<{ Params: { id: string } }>('/api/inventory/items/:id', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.get(request.params.id, context);
  });
}
