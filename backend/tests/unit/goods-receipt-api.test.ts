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
import type { GoodsReceipt } from '../../src/inventory/domain/goods-receipt.js';

const receiptId = 'f1f1f1f1-1111-4111-8111-111111111111';
const supplierId = '44444444-4444-4444-8444-444444444444';
const locationId = 'a1a1a1a1-1111-4111-8111-111111111111';
const itemId = '11111111-1111-4111-8111-111111111111';
const brandId = '22222222-2222-4222-8222-222222222222';
const packId = '33333333-3333-4333-8333-333333333333';
const owner: AuthContext = { userId: 'owner-1', role: 'OWNER', branchId: 'branch-1' };
const manager: AuthContext = { userId: 'manager-1', role: 'MANAGER', branchId: 'branch-1' };
const line = { item_id: itemId, brand_id: brandId, pack_variant_id: packId, pack_quantity: '2.5', rate: '1500' };
const input = { supplier_id: supplierId, location_id: locationId, receipt_date: '2026-09-20', supplier_bill_no: 'INV-778', lines: [line] };
const saved: GoodsReceipt = {
  id: receiptId, supplier_id: supplierId, location_id: locationId, receipt_date: '2026-09-20', supplier_bill_no: 'INV-778', purchase_order_id: null,
  created_at: '2026-09-20T00:00:00Z',
  lines: [{ id: 'l1', line_no: 1, ...line, pack_quantity: '2.500000', rate: '1500.000000', conversion_factor: '16.000000', base_quantity: '40.000000', purchase_record_id: 'p1', stock_movement_id: 'm1', purchase_order_line_id: null }],
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
  purchaseOrderRepository: { create: vi.fn(), update: vi.fn(), cancel: vi.fn(), close: vi.fn(), list: vi.fn(), get: vi.fn() } satisfies PurchaseOrderRepository,
  stockTransferRepository: { send: vi.fn(), receive: vi.fn(), cancel: vi.fn(), list: vi.fn(), get: vi.fn() } satisfies StockTransferRepository,
};

function setup(auth: AuthContext | null = owner) {
  const receipts = {
    create: vi.fn<GoodsReceiptRepository['create']>().mockResolvedValue(saved),
    list: vi.fn<GoodsReceiptRepository['list']>().mockResolvedValue([]),
    get: vi.fn<GoodsReceiptRepository['get']>().mockResolvedValue(saved),
  } satisfies GoodsReceiptRepository;
  const app = buildApp({ ...unused, goodsReceiptRepository: receipts, authProvider: async () => auth });
  apps.push(app); return { app, receipts };
}
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
const post = (app: FastifyInstance, payload: unknown) => app.inject({ method: 'POST', url: '/api/inventory/receipts', payload: payload as object });

describe('S-05 Goods Receipt create validation', () => {
  it('accepts a valid multi-line receipt and trims the optional bill number', async () => {
    const { app, receipts } = setup();
    const response = await post(app, { ...input, supplier_bill_no: '  INV-778 ', lines: [line, { ...line, pack_quantity: '1' }] });
    expect(response.statusCode).toBe(201);
    expect(receipts.create).toHaveBeenCalledWith({ ...input, lines: [line, { ...line, pack_quantity: '1' }] }, owner);
  });
  it('accepts a receipt without supplier_bill_no', async () => {
    const { app, receipts } = setup(); const rest: Record<string, unknown> = { ...input }; delete rest.supplier_bill_no;
    expect((await post(app, rest)).statusCode).toBe(201);
    expect(receipts.create).toHaveBeenCalledWith(rest, owner);
  });
  it.each(['supplier_id', 'location_id', 'receipt_date', 'lines'])('rejects missing header field %s', async field => {
    const { app, receipts } = setup(); const payload: Record<string, unknown> = { ...input }; delete payload[field];
    expect((await post(app, payload)).statusCode).toBe(400);
    expect(receipts.create).not.toHaveBeenCalled();
  });
  it.each(['item_id', 'brand_id', 'pack_variant_id', 'pack_quantity', 'rate'])('rejects a line missing %s', async field => {
    const { app, receipts } = setup(); const bad: Record<string, unknown> = { ...line }; delete bad[field];
    expect((await post(app, { ...input, lines: [bad] })).statusCode).toBe(400);
    expect(receipts.create).not.toHaveBeenCalled();
  });
  it('rejects an empty receipt and more than 100 lines', async () => {
    const { app, receipts } = setup();
    expect((await post(app, { ...input, lines: [] })).statusCode).toBe(400);
    expect((await post(app, { ...input, lines: Array.from({ length: 101 }, () => line) })).statusCode).toBe(400);
    expect((await post(app, { ...input, lines: Array.from({ length: 100 }, () => line) })).statusCode).toBe(201);
    expect(receipts.create).toHaveBeenCalledTimes(1);
  });
  it.each(['0', '-1', 'abc', '', '1e3', '1.1234567', 5])('rejects pack_quantity %j', async pack_quantity => {
    const { app, receipts } = setup();
    expect((await post(app, { ...input, lines: [{ ...line, pack_quantity }] })).statusCode).toBe(400);
    expect(receipts.create).not.toHaveBeenCalled();
  });
  it.each(['0', '-5', 'x', 100])('rejects rate %j', async rate => {
    const { app, receipts } = setup();
    expect((await post(app, { ...input, lines: [{ ...line, rate }] })).statusCode).toBe(400);
    expect(receipts.create).not.toHaveBeenCalled();
  });
  it.each(['20-09-2026', '2026-02-30', '2025-02-29', '2026-13-01', ''])('rejects receipt_date %j', async receipt_date => {
    const { app, receipts } = setup();
    expect((await post(app, { ...input, receipt_date })).statusCode).toBe(400);
    expect(receipts.create).not.toHaveBeenCalled();
  });
  it('rejects blank or overlong supplier_bill_no', async () => {
    const { app, receipts } = setup();
    expect((await post(app, { ...input, supplier_bill_no: '   ' })).statusCode).toBe(400);
    expect((await post(app, { ...input, supplier_bill_no: 'x'.repeat(101) })).statusCode).toBe(400);
    expect(receipts.create).not.toHaveBeenCalled();
  });
  it('rejects client-supplied computed/identity fields on header and lines', async () => {
    const { app, receipts } = setup();
    for (const extra of [{ id: 'x' }, { created_at: 'x' }, { branch_id: 'x' }]) expect((await post(app, { ...input, ...extra })).statusCode).toBe(400);
    for (const extra of [{ base_quantity: '1' }, { conversion_factor: '1' }, { purchase_record_id: receiptId }, { movement_type: 'OPENING' }]) {
      expect((await post(app, { ...input, lines: [{ ...line, ...extra }] })).statusCode).toBe(400);
    }
    expect(receipts.create).not.toHaveBeenCalled();
  });
});

describe('S-05 Goods Receipt errors and reads', () => {
  it('maps a missing/cross-branch location or item to 404 and passes business conflicts through', async () => {
    const { app, receipts } = setup();
    receipts.create.mockResolvedValueOnce(null);
    const nf = await post(app, input); expect(nf.statusCode).toBe(404); expect(nf.json()).toMatchObject({ error: 'NOT_FOUND' });
    receipts.create.mockRejectedValueOnce(new AppError(409, 'RECEIPT_BEFORE_OPENING', 'x'));
    const conflict = await post(app, input); expect(conflict.statusCode).toBe(409); expect(conflict.json()).toMatchObject({ error: 'RECEIPT_BEFORE_OPENING' });
  });
  it('lists and reads a receipt; missing -> 404; malformed id -> 400', async () => {
    const { app, receipts } = setup();
    expect((await app.inject({ method: 'GET', url: '/api/inventory/receipts' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/inventory/receipts/${receiptId}` })).json()).toEqual(saved);
    receipts.get.mockResolvedValueOnce(null);
    expect((await app.inject({ method: 'GET', url: `/api/inventory/receipts/${receiptId}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/inventory/receipts/nope' })).statusCode).toBe(400);
  });
  it.each(['PATCH', 'PUT', 'DELETE'] as const)('%s on a receipt is not a route (create-only)', async method => {
    const { app } = setup();
    expect((await app.inject({ method, url: `/api/inventory/receipts/${receiptId}`, payload: {} })).statusCode).toBe(404);
  });
});

describe('S-05 Goods Receipt authorization', () => {
  it('permits OWNER and MANAGER, denies other roles and missing/blank identity', async () => {
    expect((await post(setup(owner).app, input)).statusCode).toBe(201);
    expect((await post(setup(manager).app, input)).statusCode).toBe(201);
    for (const role of ['STAFF', 'STORE_KEEPER', 'owner']) {
      const { app, receipts } = setup({ ...owner, role });
      expect((await post(app, input)).statusCode).toBe(403);
      expect((await app.inject({ method: 'GET', url: '/api/inventory/receipts' })).statusCode).toBe(403);
      expect(receipts.create).not.toHaveBeenCalled();
    }
    expect((await post(setup(null).app, input)).statusCode).toBe(401);
    expect((await post(setup({ ...owner, userId: ' ' }).app, input)).statusCode).toBe(401);
  });
});

describe('S-06 Goods Receipt against a Purchase Order (optional link, ADR-0010 O-02/A-03)', () => {
  const poId = 'b1b1b1b1-1111-4111-8111-111111111111';
  const poLine1 = 'c1c1c1c1-1111-4111-8111-111111111111';
  const poLine2 = 'c1c1c1c1-1111-4111-8111-111111111112';
  it('passes purchase_order_id and per-line purchase_order_line_id through', async () => {
    const { app, receipts } = setup();
    const payload = { ...input, purchase_order_id: poId, lines: [{ ...line, purchase_order_line_id: poLine1 }] };
    expect((await post(app, payload)).statusCode).toBe(201);
    expect(receipts.create).toHaveBeenCalledWith(payload, owner);
  });
  it('requires a PO line on every line of a PO receipt, forbids it on a direct receipt, and forbids repeats', async () => {
    const { app, receipts } = setup();
    expect((await post(app, { ...input, purchase_order_id: poId })).statusCode).toBe(400);
    expect((await post(app, { ...input, purchase_order_id: poId, lines: [{ ...line, purchase_order_line_id: poLine1 }, line] })).statusCode).toBe(400);
    expect((await post(app, { ...input, lines: [{ ...line, purchase_order_line_id: poLine1 }] })).statusCode).toBe(400);
    expect((await post(app, { ...input, purchase_order_id: poId,
      lines: [{ ...line, purchase_order_line_id: poLine1 }, { ...line, purchase_order_line_id: poLine1 }] })).statusCode).toBe(400);
    expect((await post(app, { ...input, purchase_order_id: 'nope', lines: [{ ...line, purchase_order_line_id: poLine1 }] })).statusCode).toBe(400);
    expect((await post(app, { ...input, purchase_order_id: null })).statusCode).toBe(400);
    expect(receipts.create).not.toHaveBeenCalled();
    expect((await post(app, { ...input, purchase_order_id: poId,
      lines: [{ ...line, purchase_order_line_id: poLine1 }, { ...line, purchase_order_line_id: poLine2 }] })).statusCode).toBe(201);
  });
  it.each([
    [404, 'PURCHASE_ORDER_NOT_FOUND'], [409, 'PO_NOT_OPEN'], [400, 'PO_SUPPLIER_MISMATCH'], [400, 'PO_LINE_MISMATCH'], [409, 'RECEIPT_BEFORE_ORDER'],
  ])('passes %i %s through', async (status, code) => {
    const { app, receipts } = setup();
    receipts.create.mockRejectedValueOnce(new AppError(status, code, 'x'));
    const res = await post(app, { ...input, purchase_order_id: poId, lines: [{ ...line, purchase_order_line_id: poLine1 }] });
    expect(res.statusCode).toBe(status); expect(res.json()).toMatchObject({ error: code });
  });
});

describe('receipt retry key contract', () => {
  it('passes a validated key with parsed input and rejects malformed keys before persistence', async () => {
    const { app, receipts } = setup();
    const res = await app.inject({ method: 'POST', url: '/api/inventory/receipts', headers: { 'idempotency-key': 'delivery_123' }, payload: input });
    expect(res.statusCode).toBe(201);
    expect(receipts.create).toHaveBeenCalledWith(input, owner, 'delivery_123');
    receipts.create.mockClear();
    for (const key of ['', 'a'.repeat(129), 'two keys', 'a,b']) {
      const invalid = await app.inject({ method: 'POST', url: '/api/inventory/receipts', headers: { 'idempotency-key': key }, payload: input });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json().error).toBe('INVALID_IDEMPOTENCY_KEY');
    }
    expect(receipts.create).not.toHaveBeenCalled();
  });
  it('returns the persistence conflict without turning it into a success', async () => {
    const { app, receipts } = setup();
    receipts.create.mockRejectedValueOnce(new AppError(409, 'IDEMPOTENCY_CONFLICT', 'different payload'));
    const res = await app.inject({ method: 'POST', url: '/api/inventory/receipts', headers: { 'idempotency-key': 'delivery' }, payload: input });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('IDEMPOTENCY_CONFLICT');
  });
});
