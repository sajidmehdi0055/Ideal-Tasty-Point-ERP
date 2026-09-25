import { requireItemEditor } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import { purchaseRecordInputSchema, rateComparisonQuerySchema } from '../domain/purchase-record.js';
import type { PurchaseRecordRepository } from './purchase-record-repository.js';

export class PurchaseRecordService {
  constructor(private readonly repository: PurchaseRecordRepository) {}

  async create(body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const input = purchaseRecordInputSchema.parse(body);
    const record = await this.repository.create(input, auth);
    if (!record) throw new AppError(404, 'ITEM_NOT_FOUND', 'Referenced item not found');
    return record;
  }

  async list(context: unknown) {
    const auth = requireItemEditor(context);
    return this.repository.list(auth);
  }

  async rateComparison(query: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const parsed = rateComparisonQuerySchema.parse(query);
    const result = await this.repository.getRateComparison(parsed, auth);
    if (!result) throw new AppError(404, 'ITEM_NOT_FOUND', 'Referenced item not found');
    return result;
  }
}
