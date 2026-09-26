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
import type { StockLocation } from '../../src/inventory/domain/stock-location.js';
import type { StockMovement } from '../../src/inventory/domain/stock.js';

const locationId = 'a1a1a1a1-1111-4111-8111-111111111111';
const parentId = 'b2b2b2b2-2222-4222-8222-222222222222';
const itemId = 'c3c3c3c3-3333-4333-8333-333333333333';
const owner: AuthContext = { userId: 'owner-1', role: 'OWNER', branchId: 'branch-1' };
const manager: AuthContext = { userId: 'manager-1', role: 'MANAGER', branchId: 'branch-1' };
const location: StockLocation = {
  id: locationId, branch_id: 'branch-1', name: 'Main Store', location_type: 'STORE', parent_id: null,
  active: true, created_at: '2026-09-26T00:00:00Z', updated_at: '2026-09-26T00:00:00Z',
};
const movement: StockMovement = {
  id: 'd4d4d4d4-4444-4444-8444-444444444444', item_id: itemId, location_id: locationId,
  movement_type: 'OPENING', quantity_delta: '10.000000', reason: null, created_at: '2026-09-26T00:00:00Z',
};
const opening = { item_id: itemId, location_id: locationId, quantity: '10' };
const adjustment = { item_id: itemId, location_id: locationId, quantity_delta: '-2.5', reason: 'Counted wrong at opening' };

const apps: FastifyInstance[] = [];
const unusedItemRepository: ItemRepository = { create: vi.fn(), update: vi.fn() };
const unusedUomRepository: UomRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() };
const unusedBrandRepository: BrandRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() };
const unusedPackVariantRepository: PackVariantRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn() };
const unusedSupplierRepository: SupplierRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() };
const unusedPurchaseRecordRepository: PurchaseRecordRepository = { create: vi.fn(), list: vi.fn(), getRateComparison: vi.fn() };

function setup(auth: AuthContext | null = owner) {
  const locations = {
    create: vi.fn<StockLocationRepository['create']>().mockResolvedValue(location),
    update: vi.fn<StockLocationRepository['update']>().mockResolvedValue(location),
    list: vi.fn<StockLocationRepository['list']>().mockResolvedValue([location]),
  } satisfies StockLocationRepository;
  const stock = {
    createOpening: vi.fn<StockRepository['createOpening']>().mockResolvedValue(movement),
    createAdjustment: vi.fn<StockRepository['createAdjustment']>().mockResolvedValue({ ...movement, movement_type: 'ADJUSTMENT', quantity_delta: '-2.500000', reason: adjustment.reason }),
    listBalances: vi.fn<StockRepository['listBalances']>().mockResolvedValue([]),
    listMovements: vi.fn<StockRepository['listMovements']>().mockResolvedValue([movement]),
  } satisfies StockRepository;
  const app = buildApp({
    repository: unusedItemRepository, uomRepository: unusedUomRepository,
    brandRepository: unusedBrandRepository, packVariantRepository: unusedPackVariantRepository,
    supplierRepository: unusedSupplierRepository, purchaseRecordRepository: unusedPurchaseRecordRepository,
    stockLocationRepository: locations, stockRepository: stock, authProvider: async () => auth,
  });
  apps.push(app); return { app, locations, stock };
}
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

describe('S-04 Stock Location validation', () => {
  it('creates a top-level STORE/KITCHEN without parent_id', async () => {
    const { app, locations } = setup();
    for (const location_type of ['STORE', 'KITCHEN']) {
      const response = await app.inject({ method: 'POST', url: '/api/inventory/locations', payload: { name: 'Loc', location_type } });
      expect(response.statusCode).toBe(201);
    }
    expect(locations.create).toHaveBeenCalledWith({ name: 'Loc', location_type: 'STORE' }, owner);
  });
  it('creates a FREEZER with parent_id', async () => {
    const { app, locations } = setup();
    const payload = { name: 'Freezer 1', location_type: 'FREEZER', parent_id: parentId };
    expect((await app.inject({ method: 'POST', url: '/api/inventory/locations', payload })).statusCode).toBe(201);
    expect(locations.create).toHaveBeenCalledWith(payload, owner);
  });
  it.each([
    { name: 'Freezer 1', location_type: 'FREEZER' },
    { name: 'Store 2', location_type: 'STORE', parent_id: parentId },
    { name: ' ', location_type: 'STORE' },
    { name: 'X', location_type: 'WAREHOUSE' },
    { name: 'X', location_type: 'FREEZER', parent_id: 'not-a-uuid' },
    { location_type: 'STORE' },
    { name: 'X', location_type: 'STORE', branch_id: 'branch-9' },
    { name: 'X', location_type: 'STORE', active: false },
  ])('rejects invalid create payload %j', async payload => {
    const { app, locations } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/locations', payload })).statusCode).toBe(400);
    expect(locations.create).not.toHaveBeenCalled();
  });
  it.each([{}, { location_type: 'KITCHEN' }, { parent_id: parentId }, { name: '' }])('rejects invalid/immutable edit %j', async payload => {
    const { app, locations } = setup();
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/locations/${locationId}`, payload })).statusCode).toBe(400);
    expect(locations.update).not.toHaveBeenCalled();
  });
  it('rejects a malformed location id', async () => {
    const { app, locations } = setup();
    expect((await app.inject({ method: 'PATCH', url: '/api/inventory/locations/nope', payload: { name: 'A' } })).statusCode).toBe(400);
    expect(locations.update).not.toHaveBeenCalled();
  });
  it('returns a missing/cross-branch location as 404', async () => {
    const { app, locations } = setup(); locations.update.mockResolvedValue(null);
    const response = await app.inject({ method: 'PATCH', url: `/api/inventory/locations/${locationId}`, payload: { name: 'A' } });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'LOCATION_NOT_FOUND' });
  });
});

describe('S-04 Stock Location Owner-only active rule', () => {
  it('lets Manager rename but not deactivate, even bundled with a rename', async () => {
    const { app, locations } = setup(manager);
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/locations/${locationId}`, payload: { name: 'Renamed' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/locations/${locationId}`, payload: { active: false } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/locations/${locationId}`, payload: { name: 'B', active: false } })).statusCode).toBe(403);
    expect(locations.update).toHaveBeenCalledTimes(1);
  });
  it('lets Owner deactivate', async () => {
    const { app, locations } = setup(owner);
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/locations/${locationId}`, payload: { active: false } })).statusCode).toBe(200);
    expect(locations.update).toHaveBeenCalledWith(locationId, { active: false }, owner);
  });
});

describe('S-04 Opening stock and adjustment validation', () => {
  it('accepts a valid opening entry', async () => {
    const { app, stock } = setup();
    const response = await app.inject({ method: 'POST', url: '/api/inventory/stock/opening', payload: opening });
    expect(response.statusCode).toBe(201);
    expect(stock.createOpening).toHaveBeenCalledWith(opening, owner);
  });
  it.each(['0', '-1', 'abc', '', '1e3', '10.1234567', 10])('rejects opening quantity %j', async quantity => {
    const { app, stock } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/stock/opening', payload: { ...opening, quantity } })).statusCode).toBe(400);
    expect(stock.createOpening).not.toHaveBeenCalled();
  });
  it.each(['item_id', 'location_id', 'quantity'])('rejects opening without %s', async field => {
    const { app, stock } = setup(); const payload: Record<string, unknown> = { ...opening }; delete payload[field];
    expect((await app.inject({ method: 'POST', url: '/api/inventory/stock/opening', payload })).statusCode).toBe(400);
    expect(stock.createOpening).not.toHaveBeenCalled();
  });
  it('rejects extra fields on opening (no reason, no movement_type override)', async () => {
    const { app, stock } = setup();
    for (const extra of [{ reason: 'x' }, { movement_type: 'ADJUSTMENT' }, { id: 'x' }]) {
      expect((await app.inject({ method: 'POST', url: '/api/inventory/stock/opening', payload: { ...opening, ...extra } })).statusCode).toBe(400);
    }
    expect(stock.createOpening).not.toHaveBeenCalled();
  });
  it('accepts positive and negative adjustments with a reason', async () => {
    const { app, stock } = setup();
    for (const quantity_delta of ['-2.5', '3']) {
      expect((await app.inject({ method: 'POST', url: '/api/inventory/stock/adjustments', payload: { ...adjustment, quantity_delta } })).statusCode).toBe(201);
    }
    expect(stock.createAdjustment).toHaveBeenCalledTimes(2);
  });
  it.each([
    { ...adjustment, reason: undefined },
    { ...adjustment, reason: '   ' },
    { ...adjustment, reason: 'x'.repeat(501) },
    { ...adjustment, quantity_delta: '0' },
    { ...adjustment, quantity_delta: '-0.000' },
    { ...adjustment, quantity_delta: '--1' },
    { ...adjustment, quantity_delta: -1 },
  ])('rejects invalid adjustment %j', async payload => {
    const { app, stock } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/stock/adjustments', payload })).statusCode).toBe(400);
    expect(stock.createAdjustment).not.toHaveBeenCalled();
  });
  it('maps missing/cross-branch item or location to 404 and passes business conflicts through', async () => {
    const { app, stock } = setup();
    stock.createOpening.mockResolvedValueOnce(null);
    expect((await app.inject({ method: 'POST', url: '/api/inventory/stock/opening', payload: opening })).statusCode).toBe(404);
    stock.createAdjustment.mockResolvedValueOnce(null);
    expect((await app.inject({ method: 'POST', url: '/api/inventory/stock/adjustments', payload: adjustment })).statusCode).toBe(404);
    stock.createAdjustment.mockRejectedValueOnce(new AppError(409, 'NEGATIVE_BALANCE', 'x'));
    const conflict = await app.inject({ method: 'POST', url: '/api/inventory/stock/adjustments', payload: adjustment });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ error: 'NEGATIVE_BALANCE' });
  });
  it('validates balance/movement query filters', async () => {
    const { app, stock } = setup();
    expect((await app.inject({ method: 'GET', url: `/api/inventory/stock/balances?location_id=${locationId}` })).statusCode).toBe(200);
    expect(stock.listBalances).toHaveBeenCalledWith({ location_id: locationId }, owner);
    expect((await app.inject({ method: 'GET', url: '/api/inventory/stock/balances?location_id=bad' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/inventory/stock/movements?branch_id=x' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `/api/inventory/stock/movements?item_id=${itemId}` })).statusCode).toBe(200);
  });
});

describe('S-04 Stock movements are append-only at the API', () => {
  it.each(['PATCH', 'PUT', 'DELETE'] as const)('%s on a movement is not a route', async method => {
    const { app } = setup();
    expect((await app.inject({ method, url: `/api/inventory/stock/movements/${movement.id}`, payload: {} })).statusCode).toBe(404);
  });
  it('DELETE on a location is not a route', async () => {
    const { app } = setup();
    expect((await app.inject({ method: 'DELETE', url: `/api/inventory/locations/${locationId}` })).statusCode).toBe(404);
  });
});

describe('S-04 authorization', () => {
  const writes = [
    { method: 'POST' as const, url: '/api/inventory/locations', payload: { name: 'X', location_type: 'STORE' } },
    { method: 'PATCH' as const, url: `/api/inventory/locations/${locationId}`, payload: { name: 'X' } },
    { method: 'POST' as const, url: '/api/inventory/stock/opening', payload: opening },
    { method: 'POST' as const, url: '/api/inventory/stock/adjustments', payload: adjustment },
  ];
  const reads = ['/api/inventory/locations', '/api/inventory/stock/balances', '/api/inventory/stock/movements'];
  for (const request of writes) {
    it(`${request.method} ${request.url} permits OWNER/MANAGER and denies others`, async () => {
      expect((await setup(owner).app.inject(request)).statusCode).toBeLessThan(300);
      expect((await setup(manager).app.inject(request)).statusCode).toBeLessThan(300);
      for (const role of ['STAFF', 'STORE_KEEPER', 'owner']) {
        const { app, locations, stock } = setup({ ...owner, role });
        expect((await app.inject(request)).statusCode).toBe(403);
        expect(locations.create).not.toHaveBeenCalled(); expect(locations.update).not.toHaveBeenCalled();
        expect(stock.createOpening).not.toHaveBeenCalled(); expect(stock.createAdjustment).not.toHaveBeenCalled();
      }
      expect((await setup(null).app.inject(request)).statusCode).toBe(401);
      expect((await setup({ ...owner, branchId: ' ' }).app.inject(request)).statusCode).toBe(401);
    });
  }
  it.each(reads)('GET %s requires Owner/Manager', async url => {
    expect((await setup(owner).app.inject({ method: 'GET', url })).statusCode).toBe(200);
    expect((await setup({ ...owner, role: 'STAFF' }).app.inject({ method: 'GET', url })).statusCode).toBe(403);
    expect((await setup(null).app.inject({ method: 'GET', url })).statusCode).toBe(401);
  });
});
