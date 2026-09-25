import type { FastifyInstance } from 'fastify';
import type { AuthContextProvider } from '../../auth/context.js';
import { requireItemEditor } from '../../auth/context.js';
import type { PurchaseRecordService } from '../application/purchase-record-service.js';

export function registerPurchaseRecordRoutes(app: FastifyInstance, service: PurchaseRecordService, authProvider: AuthContextProvider) {
  app.post('/api/inventory/purchases', async (request, reply) => {
    const context = requireItemEditor(await authProvider(request));
    return reply.code(201).send(await service.create(request.body, context));
  });

  // Read-only, create-only entity: no PATCH route exists. Correcting/reversing
  // a purchase record is an explicitly deferred, undecided business rule.
  app.get('/api/inventory/purchases', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.list(context);
  });

  app.get('/api/inventory/purchases/rate-comparison', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.rateComparison(request.query, context);
  });
}
