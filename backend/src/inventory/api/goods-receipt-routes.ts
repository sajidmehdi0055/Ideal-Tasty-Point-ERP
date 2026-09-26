import type { FastifyInstance } from 'fastify';
import type { AuthContextProvider } from '../../auth/context.js';
import { requireItemEditor } from '../../auth/context.js';
import type { GoodsReceiptService } from '../application/goods-receipt-service.js';

export function registerGoodsReceiptRoutes(app: FastifyInstance, service: GoodsReceiptService, authProvider: AuthContextProvider) {
  app.post('/api/inventory/receipts', async (request, reply) => {
    const context = requireItemEditor(await authProvider(request));
    return reply.code(201).send(await service.create(request.body, context));
  });

  // Receipts are create-only: no PATCH/DELETE. A wrong quantity is corrected
  // with a stock ADJUSTMENT carrying a reason (owner decision, ADR-0009 O-04).
  app.get('/api/inventory/receipts', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.list(context);
  });

  app.get<{ Params: { id: string } }>('/api/inventory/receipts/:id', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.get(request.params.id, context);
  });
}
