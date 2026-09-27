import type { FastifyInstance } from 'fastify';
import type { AuthContextProvider } from '../../auth/context.js';
import { requireItemEditor } from '../../auth/context.js';
import type { StockTransferService } from '../application/stock-transfer-service.js';

// ADR-0011: Owner/Manager only (existing pattern). No PATCH/DELETE route: a
// transfer is received or cancelled (before receipt), never edited or deleted.
export function registerStockTransferRoutes(app: FastifyInstance, service: StockTransferService, authProvider: AuthContextProvider) {
  app.post('/api/inventory/transfers', async (request, reply) => {
    const context = requireItemEditor(await authProvider(request));
    return reply.code(201).send(await service.send(request.body, context));
  });

  app.get('/api/inventory/transfers', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.list(request.query, context);
  });

  app.get<{ Params: { id: string } }>('/api/inventory/transfers/:id', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.get(request.params.id, context);
  });

  app.post<{ Params: { id: string } }>('/api/inventory/transfers/:id/receive', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.receive(request.params.id, request.body, context);
  });

  app.post<{ Params: { id: string } }>('/api/inventory/transfers/:id/cancel', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.cancel(request.params.id, request.body, context);
  });
}
