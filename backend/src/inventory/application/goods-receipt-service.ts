import { requireItemEditor } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import { goodsReceiptIdSchema, goodsReceiptInputSchema } from '../domain/goods-receipt.js';
import type { GoodsReceiptRepository } from './goods-receipt-repository.js';

export class GoodsReceiptService {
  constructor(private readonly repository: GoodsReceiptRepository) {}

  async create(body: unknown, context: unknown, idempotencyKey?: unknown) {
    const auth = requireItemEditor(context);
    if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(idempotencyKey))) {
      throw new AppError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be 1–128 letters, digits, underscores or hyphens');
    }
    const input = goodsReceiptInputSchema.parse(body);
    const receipt = idempotencyKey === undefined
      ? await this.repository.create(input, auth)
      : await this.repository.create(input, auth, idempotencyKey as string);
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
