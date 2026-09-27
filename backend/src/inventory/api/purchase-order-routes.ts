import type { FastifyInstance } from 'fastify';
import type { AuthContextProvider } from '../../auth/context.js';
import { requireItemEditor } from '../../auth/context.js';
import type { PurchaseOrderService } from '../application/purchase-order-service.js';

// ADR-0010: Owner/Manager only (existing pattern). No DELETE route: a PO is
// cancelled (no receipt yet) or closed (after receipts), never deleted.
export function registerPurchaseOrderRoutes(app: FastifyInstance, service: PurchaseOrderService, authProvider: AuthContextProvider) {
  app.post('/api/inventory/purchase-orders', async (request, reply) => {
    const context = requireItemEditor(await authProvider(request));
    return reply.code(201).send(await service.create(request.body, context));
  });

  app.get('/api/inventory/purchase-orders', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.list(request.query, context);
  });

  app.get<{ Params: { id: string } }>('/api/inventory/purchase-orders/:id', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.get(request.params.id, context);
  });

  app.patch<{ Params: { id: string } }>('/api/inventory/purchase-orders/:id', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.update(request.params.id, request.body, context);
  });

  app.post<{ Params: { id: string } }>('/api/inventory/purchase-orders/:id/cancel', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.cancel(request.params.id, request.body, context);
  });

  app.post<{ Params: { id: string } }>('/api/inventory/purchase-orders/:id/close', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.close(request.params.id, request.body, context);
  });
}
