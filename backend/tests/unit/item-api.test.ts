import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import type { AuthContext } from '../../src/auth/context.js';
import { ItemService } from '../../src/inventory/application/item-service.js';
import type { ItemRepository } from '../../src/inventory/application/item-repository.js';
import type { UomRepository } from '../../src/inventory/application/uom-repository.js';
import type { BrandRepository } from '../../src/inventory/application/brand-repository.js';
import type { PackVariantRepository } from '../../src/inventory/application/pack-variant-repository.js';
import type { SupplierRepository } from '../../src/inventory/application/supplier-repository.js';
import type { PurchaseRecordRepository } from '../../src/inventory/application/purchase-record-repository.js';
import { ITEM_LIST_DEFAULT_LIMIT, ITEM_LIST_MAX_LIMIT, ITEM_SEARCH_MAX_LENGTH, PRIMARY_ITEM_TYPES, type Item, type ItemInput } from '../../src/inventory/domain/item.js';
import { ITEM_LIST_TRUNCATED_HEADER } from '../../src/inventory/api/item-routes.js';
import type { StockLocationRepository } from '../../src/inventory/application/stock-location-repository.js';
import type { StockRepository } from '../../src/inventory/application/stock-repository.js';
import type { GoodsReceiptRepository } from '../../src/inventory/application/goods-receipt-repository.js';
import type { PurchaseOrderRepository } from '../../src/inventory/application/purchase-order-repository.js';
import type { StockTransferRepository } from '../../src/inventory/application/stock-transfer-repository.js';
const unusedGoodsReceiptRepository: GoodsReceiptRepository = { create: vi.fn(), list: vi.fn(), get: vi.fn() };
const unusedPurchaseOrderRepository: PurchaseOrderRepository = { create: vi.fn(), update: vi.fn(), cancel: vi.fn(), close: vi.fn(), list: vi.fn(), get: vi.fn() };
const unusedStockTransferRepository: StockTransferRepository = { send: vi.fn(), receive: vi.fn(), cancel: vi.fn(), list: vi.fn(), get: vi.fn() };
const unusedStockLocationRepository: StockLocationRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn() };
const unusedStockRepository: StockRepository = { createOpening: vi.fn(), createAdjustment: vi.fn(), listBalances: vi.fn(), listMovements: vi.fn() };
const id = 'e0a8f673-2a55-4c83-8831-a6c4b6358245';
const input: ItemInput = { item_name: 'Flour', primary_item_type: 'RAW_MATERIAL', base_uom: 'kg', brand: 'Generic / No Brand' };
const owner: AuthContext = { userId: 'owner-1', role: 'OWNER', branchId: 'branch-2' };
const saved: Item = { ...input, id, item_code: 'ITM-000001', branch_id: owner.branchId, active: true, created_at: '2026-09-17T00:00:00Z', updated_at: '2026-09-17T00:00:00Z' };
const apps: FastifyInstance[] = [];
// S-02 unrelated to item behavior: buildApp now also wires UOM/Brand/Pack Variant,
// but item-repository's own contract (base_uom stays a plain string) is unchanged,
// so these three are unused stand-ins purely to satisfy buildApp's options shape.
const unusedUomRepository: UomRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() };
const unusedBrandRepository: BrandRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() };
const unusedPackVariantRepository: PackVariantRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn() };
const unusedSupplierRepository: SupplierRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() };
const unusedPurchaseRecordRepository: PurchaseRecordRepository = { create: vi.fn(), list: vi.fn(), getRateComparison: vi.fn() };
function setup(auth: AuthContext | null = owner, defaultProvider = false) {
  const repository = {
    create: vi.fn<ItemRepository['create']>().mockResolvedValue(saved), update: vi.fn<ItemRepository['update']>().mockResolvedValue(saved),
    list: vi.fn<ItemRepository['list']>().mockResolvedValue({ items: [saved], truncated: false }), get: vi.fn<ItemRepository['get']>().mockResolvedValue(saved),
  } satisfies ItemRepository;
  const app = buildApp({
    repository, uomRepository: unusedUomRepository, brandRepository: unusedBrandRepository,
    packVariantRepository: unusedPackVariantRepository, supplierRepository: unusedSupplierRepository,
    purchaseRecordRepository: unusedPurchaseRecordRepository, stockLocationRepository: unusedStockLocationRepository, stockRepository: unusedStockRepository, goodsReceiptRepository: unusedGoodsReceiptRepository, purchaseOrderRepository: unusedPurchaseOrderRepository, stockTransferRepository: unusedStockTransferRepository,
    ...(defaultProvider ? {} : { authProvider: async () => auth }),
  });
  apps.push(app); return { app, repository };
}
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
const endpoints = [{ method: 'POST' as const, url: '/api/inventory/items' }, { method: 'PATCH' as const, url: `/api/inventory/items/${id}` }];
describe('S-01 ADR-0002/0003 mandatory fields and single type', () => {
  it.each(Object.keys(input))('rejects missing create field %s', async field => {
    const { app, repository } = setup(); const payload: Record<string, unknown> = { ...input }; delete payload[field];
    expect((await app.inject({ method: 'POST', url: '/api/inventory/items', payload })).statusCode).toBe(400); expect(repository.create).not.toHaveBeenCalled();
  });
  for (const endpoint of endpoints) {
    for (const field of Object.keys(input)) {
      it.each(['', '   ', null])(`${endpoint.method} invalid ${field}: %j`, async value => {
        const { app, repository } = setup(); expect((await app.inject({ ...endpoint, payload: { ...input, [field]: value } })).statusCode).toBe(400);
        expect(repository.create).not.toHaveBeenCalled(); expect(repository.update).not.toHaveBeenCalled();
      });
    }
    it.each(['OTHER', ['RAW_MATERIAL', 'WIP_SEMI_FINISHED'], ['RAW_MATERIAL']])(`${endpoint.method} invalid/multiple types %j`, async value => {
      const { app } = setup(); expect((await app.inject({ ...endpoint, payload: { ...input, primary_item_type: value } })).statusCode).toBe(400);
    });
    it.each(['item_code', 'id', 'branch_id', 'active', 'unexpected'])(`${endpoint.method} rejects override %s`, async field => {
      const { app, repository } = setup(); expect((await app.inject({ ...endpoint, payload: { ...input, [field]: 'override' } })).statusCode).toBe(400);
      expect(repository.create).not.toHaveBeenCalled(); expect(repository.update).not.toHaveBeenCalled();
    });
    it.each(PRIMARY_ITEM_TYPES)(`${endpoint.method} accepts type %s`, async primary_item_type => {
      const { app } = setup(); expect((await app.inject({ ...endpoint, payload: { ...input, primary_item_type } })).statusCode).toBe(endpoint.method === 'POST' ? 201 : 200);
    });
  }
  it('allows partial editing without clearing omitted fields', async () => {
    const { app, repository } = setup(); expect((await app.inject({ method: 'PATCH', url: `/api/inventory/items/${id}`, payload: { item_name: 'Fine Flour' } })).statusCode).toBe(200);
    expect(repository.update).toHaveBeenCalledWith(id, { item_name: 'Fine Flour' }, owner);
  });
  it('rejects empty edit and malformed identifier', async () => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/items/${id}`, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/api/inventory/items/not-uuid', payload: { brand: 'A' } })).statusCode).toBe(400); expect(repository.update).not.toHaveBeenCalled();
  });
  it('accepts explicit generic and brand values with international names', async () => {
    const { app, repository } = setup();
    for (const brand of ['Generic / No Brand', 'Brand A']) {
      expect((await app.inject({ method: 'POST', url: '/api/inventory/items', payload: { ...input, item_name: 'آٹا Flour', brand } })).statusCode).toBe(201);
      expect(repository.create).toHaveBeenLastCalledWith({ ...input, item_name: 'آٹا Flour', brand }, owner);
    }
  });
  it('rejects embedded NUL before persistence', async () => {
    const { app, repository } = setup(); expect((await app.inject({ method: 'POST', url: '/api/inventory/items', payload: { ...input, item_name: 'bad\u0000name' } })).statusCode).toBe(400); expect(repository.create).not.toHaveBeenCalled();
  });
});
describe('S-01 INV-11 and ADR-0006 authorization', () => {
  for (const endpoint of endpoints) {
    it.each(['OWNER', 'MANAGER'])(`${endpoint.method} permits %s with trusted branch`, async role => {
      const auth = { ...owner, role, branchId: 'different-branch' }; const { app, repository } = setup(auth);
      expect((await app.inject({ ...endpoint, payload: input, headers: { 'x-branch-id': 'attacker-branch' } })).statusCode).toBe(endpoint.method === 'POST' ? 201 : 200);
      if (endpoint.method === 'POST') expect(repository.create).toHaveBeenCalledWith(input, auth); else expect(repository.update).toHaveBeenCalledWith(id, input, auth);
    });
    it.each(['STAFF', 'STORE_KEEPER', 'owner', 'SUPER_ADMIN', 'UNKNOWN'])(`${endpoint.method} denies %s`, async role => {
      const { app, repository } = setup({ ...owner, role }); expect((await app.inject({ ...endpoint, payload: input })).statusCode).toBe(403);
      expect(repository.create).not.toHaveBeenCalled(); expect(repository.update).not.toHaveBeenCalled();
    });
    it(`${endpoint.method} rejects spoofed identity by default`, async () => {
      const { app, repository } = setup(null, true);
      expect((await app.inject({ ...endpoint, payload: input, headers: { 'x-auth-context': JSON.stringify(owner), authorization: 'Bearer fake', 'x-user-role': 'OWNER' } })).statusCode).toBe(401);
      expect(repository.create).not.toHaveBeenCalled(); expect(repository.update).not.toHaveBeenCalled();
    });
    it.each(['userId', 'branchId'])(`${endpoint.method} rejects blank context %s`, async field => {
      const { app, repository } = setup({ ...owner, [field]: ' ' }); expect((await app.inject({ ...endpoint, payload: input })).statusCode).toBe(401);
      expect(repository.create).not.toHaveBeenCalled(); expect(repository.update).not.toHaveBeenCalled();
    });
  }
  it('defends service calls bypassing HTTP', async () => {
    const { repository } = setup(); const service = new ItemService(repository);
    await expect(service.create(input, { ...owner, role: 'STAFF' })).rejects.toMatchObject({ status: 403 });
    await expect(service.update(id, input, null)).rejects.toMatchObject({ status: 401 });
    await expect(service.create({}, owner)).rejects.toThrow(); await expect(service.update(id, { item_code: 'ITM-999999' }, owner)).rejects.toThrow();
    expect(repository.create).not.toHaveBeenCalled(); expect(repository.update).not.toHaveBeenCalled();
  });
});
describe('S-01 errors and response', () => {
  it('returns missing/inaccessible item as 404', async () => {
    const { app, repository } = setup(); repository.update.mockResolvedValue(null);
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/items/${id}`, payload: { item_name: 'New' } })).statusCode).toBe(404);
  });
  for (const endpoint of endpoints) {
    it(`${endpoint.method} reports failure without secrets or fake success`, async () => {
      const { app, repository } = setup(); repository.create.mockRejectedValue(new Error('secret connection string')); repository.update.mockRejectedValue(new Error('secret connection string'));
      const response = await app.inject({ ...endpoint, payload: input }); expect(response.statusCode).toBe(500); expect(response.body).not.toContain('secret'); expect(response.json()).toMatchObject({ error: 'INTERNAL_ERROR' });
    });
  }
  it('returns repository-generated ID/code unchanged', async () => {
    const { app, repository } = setup(); expect((await app.inject({ method: 'POST', url: '/api/inventory/items', payload: input })).json()).toEqual(saved); expect(repository.create).toHaveBeenCalledWith(input, owner);
    // PostgreSQL integration tests prove sequence uniqueness/concurrency, audit immutability and atomicity.
  });
  it('reports malformed JSON as client error', async () => {
    const { app } = setup(); expect((await app.inject({ method: 'POST', url: '/api/inventory/items', payload: '{bad', headers: { 'content-type': 'application/json' } })).statusCode).toBe(400);
  });
});
describe('INV-ITEM-LIST-001 item list and get-by-id', () => {
  const reads = [{ method: 'GET' as const, url: '/api/inventory/items' }, { method: 'GET' as const, url: `/api/inventory/items/${id}` }];
  const noRepositoryCall = (repository: ReturnType<typeof setup>['repository']) => {
    expect(repository.list).not.toHaveBeenCalled(); expect(repository.get).not.toHaveBeenCalled();
  };
  for (const read of reads) {
    it.each(['OWNER', 'MANAGER'])(`${read.url} permits %s and passes the trusted AuthContext`, async role => {
      const auth = { ...owner, role, branchId: 'trusted-branch' }; const { app, repository } = setup(auth);
      expect((await app.inject({ ...read, headers: { 'x-branch-id': 'attacker-branch' } })).statusCode).toBe(200);
      if (read.url === '/api/inventory/items') expect(repository.list).toHaveBeenCalledWith({ limit: ITEM_LIST_DEFAULT_LIMIT }, auth);
      else expect(repository.get).toHaveBeenCalledWith(id, auth);
    });
    it.each(['STAFF', 'STORE_KEEPER', 'owner', 'UNKNOWN'])(`${read.url} denies %s with 403`, async role => {
      const { app, repository } = setup({ ...owner, role }); expect((await app.inject(read)).statusCode).toBe(403); noRepositoryCall(repository);
    });
    it(`${read.url} rejects missing/spoofed identity with 401`, async () => {
      const { app, repository } = setup(null, true);
      expect((await app.inject({ ...read, headers: { 'x-auth-context': JSON.stringify(owner), 'x-user-role': 'OWNER' } })).statusCode).toBe(401);
      noRepositoryCall(repository);
    });
    it.each(['userId', 'branchId'])(`${read.url} rejects blank context %s with 401`, async field => {
      const { app, repository } = setup({ ...owner, [field]: ' ' }); expect((await app.inject(read)).statusCode).toBe(401); noRepositoryCall(repository);
    });
  }
  it('returns a plain JSON array of Item without the truncation header when not capped', async () => {
    const { app } = setup(); const response = await app.inject({ method: 'GET', url: '/api/inventory/items' });
    expect(response.json()).toEqual([saved]); expect(response.headers[ITEM_LIST_TRUNCATED_HEADER]).toBeUndefined();
  });
  it('keeps the array shape and sets the truncation header when the list is capped', async () => {
    const { app, repository } = setup(); repository.list.mockResolvedValue({ items: [saved], truncated: true });
    const response = await app.inject({ method: 'GET', url: '/api/inventory/items?limit=1' });
    expect(response.statusCode).toBe(200); expect(response.json()).toEqual([saved]); expect(response.headers[ITEM_LIST_TRUNCATED_HEADER]).toBe('true');
  });
  it.each([
    ['search=%20Flour%20', { search: 'Flour', limit: ITEM_LIST_DEFAULT_LIMIT }],
    ['search=%20%20', { limit: ITEM_LIST_DEFAULT_LIMIT }],
    ['search=50%25_off', { search: '50%_off', limit: ITEM_LIST_DEFAULT_LIMIT }],
    ['active=true', { active: true, limit: ITEM_LIST_DEFAULT_LIMIT }],
    ['active=false', { active: false, limit: ITEM_LIST_DEFAULT_LIMIT }],
    ['limit=1', { limit: 1 }],
    [`limit=${ITEM_LIST_MAX_LIMIT}`, { limit: ITEM_LIST_MAX_LIMIT }],
    ['search=itm-000&active=true&limit=25', { search: 'itm-000', active: true, limit: 25 }],
  ])('parses query %s', async (qs, expected) => {
    const { app, repository } = setup(); expect((await app.inject({ method: 'GET', url: `/api/inventory/items?${qs}` })).statusCode).toBe(200);
    expect(repository.list).toHaveBeenCalledWith(expected, owner);
  });
  it.each([
    'unknown=1', 'branch_id=other', 'active=yes', 'active=TRUE', 'active=1', 'limit=0', `limit=${ITEM_LIST_MAX_LIMIT + 1}`,
    'limit=-1', 'limit=1.5', 'limit=abc', 'limit=', 'limit=1e2', 'search=a&search=b', 'active=true&active=false',
    'search=bad%00name', `search=${'x'.repeat(ITEM_SEARCH_MAX_LENGTH + 1)}`,
  ])('rejects invalid query %s with 400', async qs => {
    const { app, repository } = setup(); const response = await app.inject({ method: 'GET', url: `/api/inventory/items?${qs}` });
    expect(response.statusCode).toBe(400); expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR' }); noRepositoryCall(repository);
  });
  it('accepts a search of exactly the maximum length', async () => {
    const { app } = setup(); expect((await app.inject({ method: 'GET', url: `/api/inventory/items?search=${'x'.repeat(ITEM_SEARCH_MAX_LENGTH)}` })).statusCode).toBe(200);
  });
  it('get-by-id returns the item, 404 ITEM_NOT_FOUND when absent/other branch, 400 for malformed id', async () => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'GET', url: `/api/inventory/items/${id}` })).json()).toEqual(saved);
    repository.get.mockResolvedValue(null);
    const missing = await app.inject({ method: 'GET', url: `/api/inventory/items/${id}` });
    expect(missing.statusCode).toBe(404); expect(missing.json()).toMatchObject({ error: 'ITEM_NOT_FOUND' });
    repository.get.mockClear();
    expect((await app.inject({ method: 'GET', url: '/api/inventory/items/not-uuid' })).statusCode).toBe(400); expect(repository.get).not.toHaveBeenCalled();
  });
  it('reports read failures as 500 without secrets', async () => {
    const { app, repository } = setup(); repository.list.mockRejectedValue(new Error('secret connection string')); repository.get.mockRejectedValue(new Error('secret connection string'));
    for (const url of ['/api/inventory/items', `/api/inventory/items/${id}`]) {
      const response = await app.inject({ method: 'GET', url }); expect(response.statusCode).toBe(500); expect(response.body).not.toContain('secret');
    }
  });
  it('defends list/get service calls bypassing HTTP', async () => {
    const { repository } = setup(); const service = new ItemService(repository);
    await expect(service.list({}, { ...owner, role: 'STAFF' })).rejects.toMatchObject({ status: 403 });
    await expect(service.list({}, null)).rejects.toMatchObject({ status: 401 });
    await expect(service.get(id, null)).rejects.toMatchObject({ status: 401 });
    await expect(service.list({ limit: 'x' }, owner)).rejects.toThrow();
    noRepositoryCall(repository);
    await expect(service.list(undefined, owner)).resolves.toEqual({ items: [saved], truncated: false });
    expect(repository.list).toHaveBeenCalledWith({ limit: ITEM_LIST_DEFAULT_LIMIT }, owner);
  });
});
