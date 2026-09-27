import { requireItemEditor } from '../../auth/context.js';
import { AppError } from '../../errors.js';
import {
  purchaseOrderIdSchema, purchaseOrderInputSchema, purchaseOrderListQuerySchema, purchaseOrderPatchSchema, purchaseOrderReasonSchema,
} from '../domain/purchase-order.js';
import type { PurchaseOrderRepository } from './purchase-order-repository.js';

const notFound = () => new AppError(404, 'PURCHASE_ORDER_NOT_FOUND', 'Purchase order not found');

export class PurchaseOrderService {
  constructor(private readonly repository: PurchaseOrderRepository) {}

  async create(body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const order = await this.repository.create(purchaseOrderInputSchema.parse(body), auth);
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Referenced item not found');
    return order;
  }

  async update(id: unknown, body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const orderId = purchaseOrderIdSchema.parse(id);
    const order = await this.repository.update(orderId, purchaseOrderPatchSchema.parse(body), auth);
    if (!order) throw notFound();
    return order;
  }

  async cancel(id: unknown, body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const orderId = purchaseOrderIdSchema.parse(id);
    const order = await this.repository.cancel(orderId, purchaseOrderReasonSchema.parse(body).reason, auth);
    if (!order) throw notFound();
    return order;
  }

  async close(id: unknown, body: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const orderId = purchaseOrderIdSchema.parse(id);
    const order = await this.repository.close(orderId, purchaseOrderReasonSchema.parse(body).reason, auth);
    if (!order) throw notFound();
    return order;
  }

  async list(query: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    return this.repository.list(purchaseOrderListQuerySchema.parse(query ?? {}), auth);
  }

  async get(id: unknown, context: unknown) {
    const auth = requireItemEditor(context);
    const order = await this.repository.get(purchaseOrderIdSchema.parse(id), auth);
    if (!order) throw notFound();
    return order;
  }
}
