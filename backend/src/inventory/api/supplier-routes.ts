import type { FastifyInstance } from 'fastify';
import type { AuthContextProvider } from '../../auth/context.js';
import { requireItemEditor } from '../../auth/context.js';
import type { SupplierService } from '../application/supplier-service.js';

export function registerSupplierRoutes(app: FastifyInstance, service: SupplierService, authProvider: AuthContextProvider) {
  app.post('/api/inventory/suppliers', async (request, reply) => {
    const context = requireItemEditor(await authProvider(request));
    return reply.code(201).send(await service.create(request.body, context));
  });

  app.patch<{ Params: { id: string } }>('/api/inventory/suppliers/:id', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.update(request.params.id, request.body, context);
  });

  app.get('/api/inventory/suppliers', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.list(context);
  });
}
