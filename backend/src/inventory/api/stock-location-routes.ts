import type { FastifyInstance } from 'fastify';
import type { AuthContextProvider } from '../../auth/context.js';
import { requireItemEditor } from '../../auth/context.js';
import type { StockLocationService } from '../application/stock-location-service.js';

export function registerStockLocationRoutes(app: FastifyInstance, service: StockLocationService, authProvider: AuthContextProvider) {
  app.post('/api/inventory/locations', async (request, reply) => {
    const context = requireItemEditor(await authProvider(request));
    return reply.code(201).send(await service.create(request.body, context));
  });

  app.patch<{ Params: { id: string } }>('/api/inventory/locations/:id', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.update(request.params.id, request.body, context);
  });

  app.get('/api/inventory/locations', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.list(context);
  });
}
