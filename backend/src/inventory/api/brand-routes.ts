import type { FastifyInstance } from 'fastify';
import type { AuthContextProvider } from '../../auth/context.js';
import { requireItemEditor } from '../../auth/context.js';
import type { BrandService } from '../application/brand-service.js';

export function registerBrandRoutes(app: FastifyInstance, service: BrandService, authProvider: AuthContextProvider) {
  app.post('/api/inventory/brands', async (request, reply) => {
    const context = requireItemEditor(await authProvider(request));
    return reply.code(201).send(await service.create(request.body, context));
  });

  app.patch<{ Params: { id: string } }>('/api/inventory/brands/:id', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.update(request.params.id, request.body, context);
  });

  app.get('/api/inventory/brands', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.list(context);
  });
}
