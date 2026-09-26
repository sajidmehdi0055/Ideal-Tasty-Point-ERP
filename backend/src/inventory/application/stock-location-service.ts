import { requireItemEditor } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import { stockLocationIdSchema, stockLocationInputSchema, stockLocationPatchSchema } from '../domain/stock-location.js';
import type { StockLocationRepository } from './stock-location-repository.js';

export class StockLocationService {
  constructor(private readonly repository: StockLocationRepository) {}

  async create(body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    return this.repository.create(stockLocationInputSchema.parse(body), auth);
  }

  async update(id: unknown, body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const locationId = stockLocationIdSchema.parse(id);
    const patch = stockLocationPatchSchema.parse(body);
    // Same rule as the other masters: only Owner may deactivate/reactivate.
    if (patch.active !== undefined && auth.role !== 'OWNER') {
      throw new AppError(403, 'FORBIDDEN', 'Only Owner may change a stock location\'s active status');
    }
    const location = await this.repository.update(locationId, patch, auth);
    if (!location) throw new AppError(404, 'LOCATION_NOT_FOUND', 'Stock location not found');
    return location;
  }

  async list(context: unknown) {
    return this.repository.list(requireItemEditor(context));
  }
}
