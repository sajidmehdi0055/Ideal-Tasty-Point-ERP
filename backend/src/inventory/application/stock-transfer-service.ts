import { requireItemEditor } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import {
  stockTransferCancelSchema, stockTransferIdSchema, stockTransferInputSchema, stockTransferListQuerySchema, stockTransferReceiveSchema,
} from '../domain/stock-transfer.js';
import type { StockTransferRepository } from './stock-transfer-repository.js';

const notFound = () => new AppError(404, 'TRANSFER_NOT_FOUND', 'Stock transfer not found');

export class StockTransferService {
  constructor(private readonly repository: StockTransferRepository) {}

  async send(body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const transfer = await this.repository.send(stockTransferInputSchema.parse(body), auth);
    if (!transfer) throw new AppError(404, 'NOT_FOUND', 'Referenced location or item not found');
    return transfer;
  }

  async receive(id: unknown, body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const transferId = stockTransferIdSchema.parse(id);
    const transfer = await this.repository.receive(transferId, stockTransferReceiveSchema.parse(body), auth);
    if (!transfer) throw notFound();
    return transfer;
  }

  async cancel(id: unknown, body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const transferId = stockTransferIdSchema.parse(id);
    const transfer = await this.repository.cancel(transferId, stockTransferCancelSchema.parse(body).reason, auth);
    if (!transfer) throw notFound();
    return transfer;
  }

  async list(query: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    return this.repository.list(stockTransferListQuerySchema.parse(query ?? {}), auth);
  }

  async get(id: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const transfer = await this.repository.get(stockTransferIdSchema.parse(id), auth);
    if (!transfer) throw notFound();
    return transfer;
  }
}
