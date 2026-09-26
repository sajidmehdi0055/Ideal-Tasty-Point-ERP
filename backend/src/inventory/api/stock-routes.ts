import type { FastifyInstance } from 'fastify';
import type { AuthContextProvider } from '../../auth/context.js';
import { requireItemEditor } from '../../auth/context.js';
import type { StockService } from '../application/stock-service.js';

export function registerStockRoutes(app: FastifyInstance, service: StockService, authProvider: AuthContextProvider) {
  app.post('/api/inventory/stock/opening', async (request, reply) => {
    const context = requireItemEditor(await authProvider(request));
    return reply.code(201).send(await service.createOpening(request.body, context));
  });

  // Movements are append-only: there is no PATCH/DELETE route. A wrong entry
  // is corrected by a new ADJUSTMENT with a reason (owner decision, ADR-0008).
  app.post('/api/inventory/stock/adjustments', async (request, reply) => {
    const context = requireItemEditor(await authProvider(request));
    return reply.code(201).send(await service.createAdjustment(request.body, context));
  });

  app.get('/api/inventory/stock/balances', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.listBalances(request.query, context);
  });

  app.get('/api/inventory/stock/movements', async request => {
    const context = requireItemEditor(await authProvider(request));
    return service.listMovements(request.query, context);
  });
}
