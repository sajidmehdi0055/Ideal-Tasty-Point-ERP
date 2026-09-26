import { requireItemEditor } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import { openingStockInputSchema, stockAdjustmentInputSchema, stockQuerySchema } from '../domain/stock.js';
import type { StockRepository } from './stock-repository.js';

export class StockService {
  constructor(private readonly repository: StockRepository) {}

  async createOpening(body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const movement = await this.repository.createOpening(openingStockInputSchema.parse(body), auth);
    if (!movement) throw new AppError(404, 'NOT_FOUND', 'Referenced item or location not found');
    return movement;
  }

  async createAdjustment(body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const movement = await this.repository.createAdjustment(stockAdjustmentInputSchema.parse(body), auth);
    if (!movement) throw new AppError(404, 'NOT_FOUND', 'Referenced item or location not found');
    return movement;
  }

  async listBalances(query: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    return this.repository.listBalances(stockQuerySchema.parse(query ?? {}), auth);
  }

  async listMovements(query: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    return this.repository.listMovements(stockQuerySchema.parse(query ?? {}), auth);
  }
}
