import { requireItemEditor } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import { goodsReceiptIdSchema, goodsReceiptInputSchema } from '../domain/goods-receipt.js';
import type { GoodsReceiptRepository } from './goods-receipt-repository.js';

export class GoodsReceiptService {
  constructor(private readonly repository: GoodsReceiptRepository) {}

  async create(body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const receipt = await this.repository.create(goodsReceiptInputSchema.parse(body), auth);
    if (!receipt) throw new AppError(404, 'NOT_FOUND', 'Referenced location or item not found');
    return receipt;
  }

  async list(context: unknown) {
    return this.repository.list(requireItemEditor(context));
  }

  async get(id: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const receipt = await this.repository.get(goodsReceiptIdSchema.parse(id), auth);
    if (!receipt) throw new AppError(404, 'RECEIPT_NOT_FOUND', 'Goods receipt not found');
    return receipt;
  }
}
