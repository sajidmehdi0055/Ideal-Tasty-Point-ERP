import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import type { AuthContext } from '../../src/auth/context.js';
import { AppError } from '../../src/errors.js';
import type { ItemRepository } from '../../src/inventory/application/item-repository.js';
import type { UomRepository } from '../../src/inventory/application/uom-repository.js';
import type { BrandRepository } from '../../src/inventory/application/brand-repository.js';
import type { PackVariantRepository } from '../../src/inventory/application/pack-variant-repository.js';
import type { SupplierRepository } from '../../src/inventory/application/supplier-repository.js';
import type { PurchaseRecordRepository } from '../../src/inventory/application/purchase-record-repository.js';
import type { StockLocationRepository } from '../../src/inventory/application/stock-location-repository.js';
import type { StockRepository } from '../../src/inventory/application/stock-repository.js';
import type { GoodsReceiptRepository } from '../../src/inventory/application/goods-receipt-repository.js';
import type { PurchaseOrderRepository } from '../../src/inventory/application/purchase-order-repository.js';
import type { StockTransferRepository } from '../../src/inventory/application/stock-transfer-repository.js';
import type { PurchaseOrder } from '../../src/inventory/domain/purchase-order.js';

const poId = 'b1b1b1b1-1111-4111-8111-111111111111';
const supplierId = '44444444-4444-4444-8444-444444444444';
const itemId = '11111111-1111-4111-8111-111111111111';
const brandId = '22222222-2222-4222-8222-222222222222';
const packId = '33333333-3333-4333-8333-333333333333';
const packId2 = '33333333-3333-4333-8333-333333333334';
const owner: AuthContext = { userId: 'owner-1', role: 'OWNER', branchId: 'branch-1' };
const manager: AuthContext = { userId: 'manager-1', role: 'MANAGER', branchId: 'branch-1' };
const line = { item_id: itemId, brand_id: brandId, pack_variant_id: packId, ordered_quantity: '10', rate: '1500' };
const input = { supplier_id: supplierId, order_date: '2026-09-20', lines: [line] };
const saved: PurchaseOrder = {
  id: poId, po_number: 'PO-000001', branch_id: 'branch-1', supplier_id: supplierId, order_date: '2026-09-20',
  status: 'ISSUED', status_reason: null, revision: 1, created_at: '2026-09-20T00:00:00Z', updated_at: '2026-09-20T00:00:00Z',
  lines: [{ id: 'l1', line_no: 1, item_id: itemId, brand_id: brandId, pack_variant_id: packId, ordered_quantity: '10.000000', rate: '1500.000000',
    received_quantity: '0.000000', pending_quantity: '10.000000', excess_quantity: '0.000000' }],
  receipts: [],
};

const apps: FastifyInstance[] = [];
const unused = {
  repository: { create: vi.fn(), update: vi.fn(), list: vi.fn(), get: vi.fn() } satisfies ItemRepository,
  uomRepository: { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() } satisfies UomRepository,
  brandRepository: { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() } satisfies BrandRepository,
  packVariantRepository: { create: vi.fn(), update: vi.fn(), list: vi.fn() } satisfies PackVariantRepository,
  supplierRepository: { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() } satisfies SupplierRepository,
  purchaseRecordRepository: { create: vi.fn(), list: vi.fn(), getRateComparison: vi.fn() } satisfies PurchaseRecordRepository,
  stockLocationRepository: { create: vi.fn(), update: vi.fn(), list: vi.fn() } satisfies StockLocationRepository,
  stockRepository: { createOpening: vi.fn(), createAdjustment: vi.fn(), listBalances: vi.fn(), listMovements: vi.fn() } satisfies StockRepository,
  goodsReceiptRepository: { create: vi.fn(), list: vi.fn(), get: vi.fn() } satisfies GoodsReceiptRepository,
  stockTransferRepository: { send: vi.fn(), receive: vi.fn(), cancel: vi.fn(), list: vi.fn(), get: vi.fn() } satisfies StockTransferRepository,
};

function setup(auth: AuthContext | null = owner) {
  const orders = {
    create: vi.fn<PurchaseOrderRepository['create']>().mockResolvedValue(saved),
    update: vi.fn<PurchaseOrderRepository['update']>().mockResolvedValue(saved),
    cancel: vi.fn<PurchaseOrderRepository['cancel']>().mockResolvedValue({ ...saved, status: 'CANCELLED', status_reason: 'x' }),
    close: vi.fn<PurchaseOrderRepository['close']>().mockResolvedValue({ ...saved, status: 'CLOSED', status_reason: 'x' }),
    list: vi.fn<PurchaseOrderRepository['list']>().mockResolvedValue([]),
    get: vi.fn<PurchaseOrderRepository['get']>().mockResolvedValue(saved),
  } satisfies PurchaseOrderRepository;
  const app = buildApp({ ...unused, purchaseOrderRepository: orders, authProvider: async () => auth });
  apps.push(app); return { app, orders };
}
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
const URL = '/api/inventory/purchase-orders';
const post = (app: FastifyInstance, payload: unknown) => app.inject({ method: 'POST', url: URL, payload: payload as object });
const patch = (app: FastifyInstance, payload: unknown, id = poId) => app.inject({ method: 'PATCH', url: `${URL}/${id}`, payload: payload as object });
const act = (app: FastifyInstance, action: 'cancel' | 'close', payload: unknown, id = poId) =>
  app.inject({ method: 'POST', url: `${URL}/${id}/${action}`, payload: payload as object });

describe('S-06 Purchase Order create validation', () => {
  it('accepts a valid PO; rate is optional per line (O-04)', async () => {
    const { app, orders } = setup();
    const noRate: Record<string, unknown> = { ...line }; delete noRate.rate;
    const res = await post(app, { ...input, lines: [line, { ...noRate, pack_variant_id: packId2 }] });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual(saved);
    expect(orders.create).toHaveBeenCalledWith({ ...input, lines: [line, { ...noRate, pack_variant_id: packId2 }] }, owner);
  });
  it.each(['supplier_id', 'order_date', 'lines'])('rejects missing header field %s', async field => {
    const { app, orders } = setup(); const payload: Record<string, unknown> = { ...input }; delete payload[field];
    expect((await post(app, payload)).statusCode).toBe(400);
    expect(orders.create).not.toHaveBeenCalled();
  });
  it.each(['item_id', 'brand_id', 'pack_variant_id', 'ordered_quantity'])('rejects a line missing %s', async field => {
    const { app, orders } = setup(); const bad: Record<string, unknown> = { ...line }; delete bad[field];
    expect((await post(app, { ...input, lines: [bad] })).statusCode).toBe(400);
    expect(orders.create).not.toHaveBeenCalled();
  });
  it('rejects an empty PO, more than 100 lines, and the same pack variant twice', async () => {
    const { app, orders } = setup();
    expect((await post(app, { ...input, lines: [] })).statusCode).toBe(400);
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...line, pack_variant_id: `33333333-3333-4333-8333-${String(i).padStart(12, '0')}` }));
    expect((await post(app, { ...input, lines: many(101) })).statusCode).toBe(400);
    const dup = await post(app, { ...input, lines: [line, { ...line, ordered_quantity: '2' }] });
    expect(dup.statusCode).toBe(400);
    expect(JSON.stringify(dup.json())).toContain('more than once');
    expect(orders.create).not.toHaveBeenCalled();
    expect((await post(app, { ...input, lines: many(100) })).statusCode).toBe(201);
  });
  it.each(['0', '-1', 'abc', '', '1e3', '1.1234567', 5])('rejects ordered_quantity %j', async ordered_quantity => {
    const { app, orders } = setup();
    expect((await post(app, { ...input, lines: [{ ...line, ordered_quantity }] })).statusCode).toBe(400);
    expect(orders.create).not.toHaveBeenCalled();
  });
  it.each(['0', '-5', 'x', 100, null])('rejects rate %j', async rate => {
    const { app, orders } = setup();
    expect((await post(app, { ...input, lines: [{ ...line, rate }] })).statusCode).toBe(400);
    expect(orders.create).not.toHaveBeenCalled();
  });
  it.each(['20-09-2026', '2026-02-30', '2025-02-29', '2026-13-01', ''])('rejects order_date %j', async order_date => {
    const { app, orders } = setup();
    expect((await post(app, { ...input, order_date })).statusCode).toBe(400);
    expect(orders.create).not.toHaveBeenCalled();
  });
  it('rejects client-supplied identity/status/computed fields', async () => {
    const { app, orders } = setup();
    for (const extra of [{ id: poId }, { po_number: 'PO-9' }, { branch_id: 'x' }, { status: 'RECEIVED' }, { revision: 2 }, { status_reason: 'x' }]) {
      expect((await post(app, { ...input, ...extra })).statusCode).toBe(400);
    }
    for (const extra of [{ received_quantity: '1' }, { line_no: 1 }, { id: poId }]) {
      expect((await post(app, { ...input, lines: [{ ...line, ...extra }] })).statusCode).toBe(400);
    }
    expect(orders.create).not.toHaveBeenCalled();
  });
  it('maps a missing/cross-branch item to 404 and passes business conflicts through', async () => {
    const { app, orders } = setup();
    orders.create.mockResolvedValueOnce(null);
    const nf = await post(app, input); expect(nf.statusCode).toBe(404); expect(nf.json()).toMatchObject({ error: 'NOT_FOUND' });
    orders.create.mockRejectedValueOnce(new AppError(409, 'SUPPLIER_INACTIVE', 'x'));
    const c = await post(app, input); expect(c.statusCode).toBe(409); expect(c.json()).toMatchObject({ error: 'SUPPLIER_INACTIVE' });
  });
});

describe('S-06 Purchase Order edit, cancel, close', () => {
  it('edits with a nonempty subset; lines replace the whole set', async () => {
    const { app, orders } = setup();
    expect((await patch(app, { order_date: '2026-09-21' })).statusCode).toBe(200);
    expect(orders.update).toHaveBeenLastCalledWith(poId, { order_date: '2026-09-21' }, owner);
    expect((await patch(app, { lines: [{ ...line, ordered_quantity: '12' }] })).statusCode).toBe(200);
    expect(orders.update).toHaveBeenLastCalledWith(poId, { lines: [{ ...line, ordered_quantity: '12' }] }, owner);
  });
  it('rejects an empty/unknown/invalid edit and a malformed id', async () => {
    const { app, orders } = setup();
    expect((await patch(app, {})).statusCode).toBe(400);
    expect((await patch(app, { status: 'CLOSED' })).statusCode).toBe(400);
    expect((await patch(app, { lines: [] })).statusCode).toBe(400);
    expect((await patch(app, { supplier_id: 'nope' })).statusCode).toBe(400);
    expect((await patch(app, { order_date: '2026-02-30' })).statusCode).toBe(400);
    expect((await patch(app, { order_date: '2026-09-21' }, 'nope')).statusCode).toBe(400);
    expect(orders.update).not.toHaveBeenCalled();
  });
  it('maps missing/cross-branch PO to 404 PURCHASE_ORDER_NOT_FOUND and passes 409 PO_NOT_EDITABLE through', async () => {
    const { app, orders } = setup();
    orders.update.mockResolvedValueOnce(null);
    const nf = await patch(app, { order_date: '2026-09-21' });
    expect(nf.statusCode).toBe(404); expect(nf.json()).toMatchObject({ error: 'PURCHASE_ORDER_NOT_FOUND' });
    orders.update.mockRejectedValueOnce(new AppError(409, 'PO_NOT_EDITABLE', 'x'));
    expect((await patch(app, { order_date: '2026-09-21' })).json()).toMatchObject({ error: 'PO_NOT_EDITABLE' });
  });
  it.each(['cancel', 'close'] as const)('%s needs a nonblank reason of at most 500 characters (trimmed)', async action => {
    const { app, orders } = setup();
    for (const bad of [{}, { reason: '' }, { reason: '   ' }, { reason: 'x'.repeat(501) }, { reason: 5 }, { reason: 'ok', extra: 1 }]) {
      expect((await act(app, action, bad)).statusCode).toBe(400);
    }
    expect(orders[action]).not.toHaveBeenCalled();
    const ok = await act(app, action, { reason: '  Supplier cannot deliver the rest ' });
    expect(ok.statusCode).toBe(200);
    expect(orders[action]).toHaveBeenCalledWith(poId, 'Supplier cannot deliver the rest', owner);
    orders[action].mockResolvedValueOnce(null);
    expect((await act(app, action, { reason: 'x' })).json()).toMatchObject({ error: 'PURCHASE_ORDER_NOT_FOUND' });
    orders[action].mockRejectedValueOnce(new AppError(409, 'PO_STATUS_CONFLICT', 'x'));
    expect((await act(app, action, { reason: 'x' })).statusCode).toBe(409);
    expect((await act(app, action, { reason: 'x' }, 'nope')).statusCode).toBe(400);
  });
  it.each(['PUT', 'DELETE'] as const)('%s on a PO is not a route (never deleted)', async method => {
    const { app } = setup();
    expect((await app.inject({ method, url: `${URL}/${poId}`, payload: {} })).statusCode).toBe(404);
  });
});

describe('S-06 Purchase Order reads', () => {
  it('lists with an optional status filter and rejects unknown filters', async () => {
    const { app, orders } = setup();
    expect((await app.inject({ method: 'GET', url: URL })).statusCode).toBe(200);
    expect(orders.list).toHaveBeenLastCalledWith({}, owner);
    expect((await app.inject({ method: 'GET', url: `${URL}?status=PARTIALLY_RECEIVED` })).statusCode).toBe(200);
    expect(orders.list).toHaveBeenLastCalledWith({ status: 'PARTIALLY_RECEIVED' }, owner);
    expect((await app.inject({ method: 'GET', url: `${URL}?status=OPEN` })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `${URL}?branch_id=x` })).statusCode).toBe(400);
  });
  it('reads a PO; missing -> 404; malformed id -> 400', async () => {
    const { app, orders } = setup();
    expect((await app.inject({ method: 'GET', url: `${URL}/${poId}` })).json()).toEqual(saved);
    orders.get.mockResolvedValueOnce(null);
    expect((await app.inject({ method: 'GET', url: `${URL}/${poId}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `${URL}/nope` })).statusCode).toBe(400);
  });
});

describe('S-06 Purchase Order authorization (O-01, O-07: Owner and Manager)', () => {
  it('permits OWNER and MANAGER on every route', async () => {
    for (const auth of [owner, manager]) {
      const { app } = setup(auth);
      expect((await post(app, input)).statusCode).toBe(201);
      expect((await patch(app, { order_date: '2026-09-21' })).statusCode).toBe(200);
      expect((await act(app, 'cancel', { reason: 'x' })).statusCode).toBe(200);
      expect((await act(app, 'close', { reason: 'x' })).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: URL })).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: `${URL}/${poId}` })).statusCode).toBe(200);
    }
  });
  it('denies other roles (403) and missing/blank identity (401) before touching the repository', async () => {
    for (const role of ['STAFF', 'STORE_KEEPER', 'owner']) {
      const { app, orders } = setup({ ...owner, role });
      expect((await post(app, input)).statusCode).toBe(403);
      expect((await patch(app, { order_date: '2026-09-21' })).statusCode).toBe(403);
      expect((await act(app, 'cancel', { reason: 'x' })).statusCode).toBe(403);
      expect((await act(app, 'close', { reason: 'x' })).statusCode).toBe(403);
      expect((await app.inject({ method: 'GET', url: URL })).statusCode).toBe(403);
      expect((await app.inject({ method: 'GET', url: `${URL}/${poId}` })).statusCode).toBe(403);
      for (const fn of Object.values(orders)) expect(fn).not.toHaveBeenCalled();
    }
    expect((await post(setup(null).app, input)).statusCode).toBe(401);
    expect((await act(setup(null).app, 'close', { reason: 'x' })).statusCode).toBe(401);
    expect((await post(setup({ ...owner, branchId: ' ' }).app, input)).statusCode).toBe(401);
  });
});
