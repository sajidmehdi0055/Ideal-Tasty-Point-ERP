import type { FastifyInstance } from 'fastify';
import type { AuthContextProvider } from '../../auth/context.js';
import { requireItemEditor } from '../../auth/context.js';
import type { UomService } from '../application/uom-service.js';

export function registerUomRoutes(app: FastifyInstance, service: UomService, authProvider: AuthContextProvider) {
  app.post('/api/inventory/uoms', async (request, reply) => {
    const context = requireItemEditor(await authProvider(request));
    return reply.code(201).send(await service.create(request.body, context));
  });

  app.patch<{ Params: { id: string } }>('/api/inventory/uoms/:id', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.update(request.params.id, request.body, context);
  });

  app.get('/api/inventory/uoms', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.list(context);
  });
}
