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
import type { StockTransfer } from '../../src/inventory/domain/stock-transfer.js';

const transferId = 'e1e1e1e1-1111-4111-8111-111111111111';
const fromId = 'a1a1a1a1-1111-4111-8111-111111111111';
const toId = 'a2a2a2a2-2222-4222-8222-222222222222';
const itemId = 'c3c3c3c3-3333-4333-8333-333333333333';
const itemId2 = 'c3c3c3c3-3333-4333-8333-333333333334';
const lineId = 'f1f1f1f1-1111-4111-8111-111111111111';
const owner: AuthContext = { userId: 'owner-1', role: 'OWNER', branchId: 'branch-1' };
const manager: AuthContext = { userId: 'manager-1', role: 'MANAGER', branchId: 'branch-1' };
const input = { from_location_id: fromId, to_location_id: toId, lines: [{ item_id: itemId, quantity: '10' }] };
const saved: StockTransfer = {
  id: transferId, transfer_number: 'TRF-000001', branch_id: 'branch-1', from_location_id: fromId, to_location_id: toId,
  status: 'SENT', status_reason: null, created_at: '2026-09-27T00:00:00Z', updated_at: '2026-09-27T00:00:00Z',
  lines: [{ id: lineId, line_no: 1, item_id: itemId, sent_quantity: '10.000000', out_movement_id: 'd4d4d4d4-4444-4444-8444-444444444444',
    received_quantity: null, variance_quantity: null, variance_reason: null, in_movement_id: null, return_movement_id: null }],
};

const apps: FastifyInstance[] = [];
const unused = {
  repository: { create: vi.fn(), update: vi.fn() } satisfies ItemRepository,
  uomRepository: { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() } satisfies UomRepository,
  brandRepository: { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() } satisfies BrandRepository,
  packVariantRepository: { create: vi.fn(), update: vi.fn(), list: vi.fn() } satisfies PackVariantRepository,
  supplierRepository: { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() } satisfies SupplierRepository,
  purchaseRecordRepository: { create: vi.fn(), list: vi.fn(), getRateComparison: vi.fn() } satisfies PurchaseRecordRepository,
  stockLocationRepository: { create: vi.fn(), update: vi.fn(), list: vi.fn() } satisfies StockLocationRepository,
  stockRepository: { createOpening: vi.fn(), createAdjustment: vi.fn(), listBalances: vi.fn(), listMovements: vi.fn() } satisfies StockRepository,
  goodsReceiptRepository: { create: vi.fn(), list: vi.fn(), get: vi.fn() } satisfies GoodsReceiptRepository,
  purchaseOrderRepository: { create: vi.fn(), update: vi.fn(), cancel: vi.fn(), close: vi.fn(), list: vi.fn(), get: vi.fn() } satisfies PurchaseOrderRepository,
};

function setup(auth: AuthContext | null = owner) {
  const transfers = {
    send: vi.fn<StockTransferRepository['send']>().mockResolvedValue(saved),
    receive: vi.fn<StockTransferRepository['receive']>().mockResolvedValue({ ...saved, status: 'RECEIVED' }),
    cancel: vi.fn<StockTransferRepository['cancel']>().mockResolvedValue({ ...saved, status: 'CANCELLED', status_reason: 'x' }),
    list: vi.fn<StockTransferRepository['list']>().mockResolvedValue([]),
    get: vi.fn<StockTransferRepository['get']>().mockResolvedValue(saved),
  } satisfies StockTransferRepository;
  const app = buildApp({ ...unused, stockTransferRepository: transfers, authProvider: async () => auth });
  apps.push(app); return { app, transfers };
}
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
const URL = '/api/inventory/transfers';
const post = (app: FastifyInstance, payload: unknown) => app.inject({ method: 'POST', url: URL, payload: payload as object });
const act = (app: FastifyInstance, action: 'receive' | 'cancel', payload: unknown, id = transferId) =>
  app.inject({ method: 'POST', url: `${URL}/${id}/${action}`, payload: payload as object });
const receiveBody = (lines: unknown[]) => ({ lines });

describe('S-07 Stock Transfer send validation', () => {
  it('sends a valid transfer for Owner and Manager (O-02)', async () => {
    for (const auth of [owner, manager]) {
      const { app, transfers } = setup(auth);
      const res = await post(app, input);
      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual(saved);
      expect(transfers.send).toHaveBeenCalledWith(input, auth);
    }
  });
  it.each(['from_location_id', 'to_location_id', 'lines'])('rejects missing field %s', async field => {
    const { app, transfers } = setup(); const payload: Record<string, unknown> = { ...input }; delete payload[field];
    expect((await post(app, payload)).statusCode).toBe(400);
    expect(transfers.send).not.toHaveBeenCalled();
  });
  it('rejects the same source and destination', async () => {
    const { app, transfers } = setup();
    const res = await post(app, { ...input, to_location_id: fromId });
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json())).toContain('different');
    expect(transfers.send).not.toHaveBeenCalled();
  });
  it('rejects an empty transfer, more than 100 lines, and the same item twice', async () => {
    const { app, transfers } = setup();
    expect((await post(app, { ...input, lines: [] })).statusCode).toBe(400);
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ item_id: `c3c3c3c3-3333-4333-8333-${String(i).padStart(12, '0')}`, quantity: '1' }));
    expect((await post(app, { ...input, lines: many(101) })).statusCode).toBe(400);
    const dup = await post(app, { ...input, lines: [{ item_id: itemId, quantity: '1' }, { item_id: itemId, quantity: '2' }] });
    expect(dup.statusCode).toBe(400);
    expect(JSON.stringify(dup.json())).toContain('more than once');
    expect(transfers.send).not.toHaveBeenCalled();
    expect((await post(app, { ...input, lines: many(100) })).statusCode).toBe(201);
  });
  it.each(['0', '0.000000', '-1', 'abc', '', '1e3', '1.1234567', '1234567890123', 5, null])('rejects quantity %j', async quantity => {
    const { app, transfers } = setup();
    expect((await post(app, { ...input, lines: [{ item_id: itemId, quantity }] })).statusCode).toBe(400);
    expect(transfers.send).not.toHaveBeenCalled();
  });
  it('rejects non-uuid references and client-supplied identity/status/brand/pack fields (O-04 Base UOM only)', async () => {
    const { app, transfers } = setup();
    expect((await post(app, { ...input, from_location_id: 'store-1' })).statusCode).toBe(400);
    expect((await post(app, { ...input, lines: [{ item_id: 'x', quantity: '1' }] })).statusCode).toBe(400);
    for (const extra of [{ id: transferId }, { transfer_number: 'TRF-9' }, { branch_id: 'x' }, { status: 'RECEIVED' }, { created_at: 'x' }]) {
      expect((await post(app, { ...input, ...extra })).statusCode).toBe(400);
    }
    for (const extra of [{ brand_id: itemId }, { pack_variant_id: itemId }, { received_quantity: '1' }, { line_no: 1 }]) {
      expect((await post(app, { ...input, lines: [{ item_id: itemId, quantity: '1', ...extra }] })).statusCode).toBe(400);
    }
    expect(transfers.send).not.toHaveBeenCalled();
  });
  it('accepts up to 6 decimals and 12 integer digits', async () => {
    const { app, transfers } = setup();
    expect((await post(app, { ...input, lines: [{ item_id: itemId, quantity: '999999999999.123456' }, { item_id: itemId2, quantity: '0.000001' }] })).statusCode).toBe(201);
    expect(transfers.send).toHaveBeenCalledTimes(1);
  });
  it('maps a missing/other-branch reference to 404 NOT_FOUND and passes repository errors through', async () => {
    const { app, transfers } = setup();
    transfers.send.mockResolvedValueOnce(null);
    const missing = await post(app, input);
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'NOT_FOUND', message: 'Referenced location or item not found' });
    transfers.send.mockRejectedValueOnce(new AppError(409, 'INSUFFICIENT_STOCK', 'lines[0]: only 2 available at the source location'));
    const short = await post(app, input);
    expect(short.statusCode).toBe(409);
    expect(short.json().error).toBe('INSUFFICIENT_STOCK');
    transfers.send.mockRejectedValueOnce(new Error('relation stock_transfer: connection password=secret'));
    const crash = await post(app, input);
    expect(crash.statusCode).toBe(500);
    expect(crash.body).not.toContain('secret');
  });
});

describe('S-07 Stock Transfer receive / cancel validation', () => {
  it('passes a receive with a short line, 0 received and a trimmed reason (O-03)', async () => {
    const { app, transfers } = setup(manager);
    const body = receiveBody([{ line_id: lineId, received_quantity: '0', variance_reason: '  Broken  ' }]);
    const res = await act(app, 'receive', body);
    expect(res.statusCode).toBe(200);
    expect(transfers.receive).toHaveBeenCalledWith(transferId, { lines: [{ line_id: lineId, received_quantity: '0', variance_reason: 'Broken' }] }, manager);
  });
  it.each([
    ['empty lines', receiveBody([])],
    ['no lines', {}],
    ['negative', receiveBody([{ line_id: lineId, received_quantity: '-1' }])],
    ['number', receiveBody([{ line_id: lineId, received_quantity: 1 }])],
    ['7 decimals', receiveBody([{ line_id: lineId, received_quantity: '1.1234567' }])],
    ['bad line id', receiveBody([{ line_id: 'l1', received_quantity: '1' }])],
    ['duplicate line', receiveBody([{ line_id: lineId, received_quantity: '1' }, { line_id: lineId, received_quantity: '1' }])],
    ['blank reason', receiveBody([{ line_id: lineId, received_quantity: '1', variance_reason: '   ' }])],
    ['long reason', receiveBody([{ line_id: lineId, received_quantity: '1', variance_reason: 'x'.repeat(501) }])],
    ['NUL reason', receiveBody([{ line_id: lineId, received_quantity: '1', variance_reason: 'a\u0000b' }])],
    ['extra field', receiveBody([{ line_id: lineId, received_quantity: '1', item_id: itemId }])],
    ['extra header field', { ...receiveBody([{ line_id: lineId, received_quantity: '1' }]), status: 'RECEIVED' }],
  ])('rejects receive with %s', async (_label, body) => {
    const { app, transfers } = setup();
    expect((await act(app, 'receive', body)).statusCode).toBe(400);
    expect(transfers.receive).not.toHaveBeenCalled();
  });
  it('requires a trimmed reason of at most 500 characters to cancel (O-05)', async () => {
    const { app, transfers } = setup();
    for (const body of [{}, { reason: '' }, { reason: '   ' }, { reason: 'x'.repeat(501) }, { reason: 'ok', extra: 1 }]) {
      expect((await act(app, 'cancel', body)).statusCode).toBe(400);
    }
    expect(transfers.cancel).not.toHaveBeenCalled();
    const res = await act(app, 'cancel', { reason: '  Wrong kitchen ' });
    expect(res.statusCode).toBe(200);
    expect(transfers.cancel).toHaveBeenCalledWith(transferId, 'Wrong kitchen', owner);
  });
  it('maps missing/other-branch transfers to 404 TRANSFER_NOT_FOUND and status conflicts to 409', async () => {
    const { app, transfers } = setup();
    transfers.receive.mockResolvedValueOnce(null);
    transfers.cancel.mockResolvedValueOnce(null);
    transfers.get.mockResolvedValueOnce(null);
    for (const res of [
      await act(app, 'receive', receiveBody([{ line_id: lineId, received_quantity: '10' }])),
      await act(app, 'cancel', { reason: 'x' }),
      await app.inject({ method: 'GET', url: `${URL}/${transferId}` }),
    ]) {
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('TRANSFER_NOT_FOUND');
    }
    transfers.receive.mockRejectedValueOnce(new AppError(409, 'TRANSFER_STATUS_CONFLICT', 'Transfer TRF-000001 is CANCELLED and cannot be received'));
    const conflict = await act(app, 'receive', receiveBody([{ line_id: lineId, received_quantity: '10' }]));
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error).toBe('TRANSFER_STATUS_CONFLICT');
  });
  it('rejects a non-uuid transfer id on every route', async () => {
    const { app, transfers } = setup();
    expect((await act(app, 'receive', receiveBody([{ line_id: lineId, received_quantity: '1' }]), 'abc')).statusCode).toBe(400);
    expect((await act(app, 'cancel', { reason: 'x' }, 'abc')).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `${URL}/abc` })).statusCode).toBe(400);
    expect(transfers.receive).not.toHaveBeenCalled();
    expect(transfers.cancel).not.toHaveBeenCalled();
    expect(transfers.get).not.toHaveBeenCalled();
  });
});

describe('S-07 Stock Transfer reads and authorization', () => {
  it('lists with an optional status filter and rejects unknown filters', async () => {
    const { app, transfers } = setup();
    expect((await app.inject({ method: 'GET', url: URL })).statusCode).toBe(200);
    expect(transfers.list).toHaveBeenLastCalledWith({}, owner);
    expect((await app.inject({ method: 'GET', url: `${URL}?status=SENT` })).statusCode).toBe(200);
    expect(transfers.list).toHaveBeenLastCalledWith({ status: 'SENT' }, owner);
    expect((await app.inject({ method: 'GET', url: `${URL}?status=OPEN` })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `${URL}?branch_id=branch-2` })).statusCode).toBe(400);
    expect(transfers.list).toHaveBeenCalledTimes(2);
  });
  it('returns the transfer detail', async () => {
    const { app, transfers } = setup();
    const res = await app.inject({ method: 'GET', url: `${URL}/${transferId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(saved);
    expect(transfers.get).toHaveBeenCalledWith(transferId, owner);
  });
  it('requires authentication (401) and Owner/Manager (403) on every route; no PATCH/DELETE route exists', async () => {
    for (const [auth, code] of [[null, 401], [{ userId: 'c1', role: 'CASHIER', branchId: 'branch-1' }, 403], [{ userId: ' ', role: 'OWNER', branchId: 'branch-1' }, 401]] as const) {
      const { app, transfers } = setup(auth as AuthContext | null);
      for (const res of [
        await post(app, input),
        await app.inject({ method: 'GET', url: URL }),
        await app.inject({ method: 'GET', url: `${URL}/${transferId}` }),
        await act(app, 'receive', receiveBody([{ line_id: lineId, received_quantity: '1' }])),
        await act(app, 'cancel', { reason: 'x' }),
      ]) expect(res.statusCode).toBe(code);
      expect(transfers.send).not.toHaveBeenCalled();
      expect(transfers.list).not.toHaveBeenCalled();
      expect(transfers.receive).not.toHaveBeenCalled();
      expect(transfers.cancel).not.toHaveBeenCalled();
    }
    const { app } = setup();
    expect((await app.inject({ method: 'PATCH', url: `${URL}/${transferId}`, payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `${URL}/${transferId}` })).statusCode).toBe(404);
  });
});

describe('S-07 Stock Transfer id normalisation (QA NOTE-2)', () => {
  it('lowercases uppercase UUIDs before they reach the repository', async () => {
    const { app, transfers } = setup();
    const res = await post(app, { from_location_id: fromId.toUpperCase(), to_location_id: toId.toUpperCase(), lines: [{ item_id: itemId.toUpperCase(), quantity: '1' }] });
    expect(res.statusCode).toBe(201);
    expect(transfers.send).toHaveBeenCalledWith({ from_location_id: fromId, to_location_id: toId, lines: [{ item_id: itemId, quantity: '1' }] }, owner);
    await act(app, 'receive', receiveBody([{ line_id: lineId.toUpperCase(), received_quantity: '1', variance_reason: 'x' }]), transferId.toUpperCase());
    expect(transfers.receive).toHaveBeenCalledWith(transferId, { lines: [{ line_id: lineId, received_quantity: '1', variance_reason: 'x' }] }, owner);
  });
});
