import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import type { AuthContext } from '../../src/auth/context.js';
import type { SupplierRepository } from '../../src/inventory/application/supplier-repository.js';
import type { Supplier } from '../../src/inventory/domain/supplier.js';
import type { ItemRepository } from '../../src/inventory/application/item-repository.js';
import type { UomRepository } from '../../src/inventory/application/uom-repository.js';
import type { BrandRepository } from '../../src/inventory/application/brand-repository.js';
import type { PackVariantRepository } from '../../src/inventory/application/pack-variant-repository.js';
import type { PurchaseRecordRepository } from '../../src/inventory/application/purchase-record-repository.js';
import type { StockLocationRepository } from '../../src/inventory/application/stock-location-repository.js';
import type { StockRepository } from '../../src/inventory/application/stock-repository.js';
const unusedStockLocationRepository: StockLocationRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn() };
const unusedStockRepository: StockRepository = { createOpening: vi.fn(), createAdjustment: vi.fn(), listBalances: vi.fn(), listMovements: vi.fn() };

const id = 'e0a8f673-2a55-4c83-8831-a6c4b6358245';
const input = { name: 'Supplier A', contact: '0300-1234567', type: 'CASH' as const };
const owner: AuthContext = { userId: 'owner-1', role: 'OWNER', branchId: 'branch-2' };
const saved: Supplier = { ...input, id, active: true, created_at: '2026-09-25T00:00:00Z', updated_at: '2026-09-25T00:00:00Z' };
const apps: FastifyInstance[] = [];
const unusedItemRepository: ItemRepository = { create: vi.fn(), update: vi.fn() };
const unusedUomRepository: UomRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() };
const unusedBrandRepository: BrandRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() };
const unusedPackVariantRepository: PackVariantRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn() };
const unusedPurchaseRecordRepository: PurchaseRecordRepository = { create: vi.fn(), list: vi.fn(), getRateComparison: vi.fn() };

function setup(auth: AuthContext | null = owner, defaultProvider = false) {
  const repository = {
    create: vi.fn<SupplierRepository['create']>().mockResolvedValue(saved),
    update: vi.fn<SupplierRepository['update']>().mockResolvedValue(saved),
    list: vi.fn<SupplierRepository['list']>().mockResolvedValue([saved]),
    findActiveByName: vi.fn<SupplierRepository['findActiveByName']>().mockResolvedValue(null),
  } satisfies SupplierRepository;
  const app = buildApp({
    repository: unusedItemRepository, uomRepository: unusedUomRepository,
    brandRepository: unusedBrandRepository, packVariantRepository: unusedPackVariantRepository,
    supplierRepository: repository, purchaseRecordRepository: unusedPurchaseRecordRepository, stockLocationRepository: unusedStockLocationRepository, stockRepository: unusedStockRepository,
    ...(defaultProvider ? {} : { authProvider: async () => auth }),
  });
  apps.push(app); return { app, repository };
}
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
const endpoints = [{ method: 'POST' as const, url: '/api/inventory/suppliers' }, { method: 'PATCH' as const, url: `/api/inventory/suppliers/${id}` }];

describe('S-03 Supplier Master mandatory fields', () => {
  it.each(['', '   ', null])('rejects invalid name: %j', async value => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/suppliers', payload: { ...input, name: value } })).statusCode).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it.each(['CASH', 'CREDIT'])('accepts valid type %s', async type => {
    const { app } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/suppliers', payload: { ...input, type } })).statusCode).toBe(201);
  });
  it('rejects an invalid type', async () => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/suppliers', payload: { ...input, type: 'BANK_TRANSFER' } })).statusCode).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('accepts creation without contact (optional)', async () => {
    const { app, repository } = setup();
    const withoutContact = { name: input.name, type: input.type };
    expect((await app.inject({ method: 'POST', url: '/api/inventory/suppliers', payload: withoutContact })).statusCode).toBe(201);
    expect(repository.create).toHaveBeenCalledWith(withoutContact, owner);
  });
  it.each(['id', 'created_at', 'active', 'unexpected'])('rejects override %s on create', async field => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/suppliers', payload: { ...input, [field]: 'override' } })).statusCode).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('rejects empty edit and malformed identifier', async () => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/suppliers/${id}`, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/api/inventory/suppliers/not-uuid', payload: { contact: 'x' } })).statusCode).toBe(400);
    expect(repository.update).not.toHaveBeenCalled();
  });
});

describe('S-03 Supplier Master duplicate-name protection', () => {
  it('rejects create when an active supplier with the same name (case-insensitive/trimmed) exists', async () => {
    const { app, repository } = setup();
    repository.findActiveByName.mockResolvedValue(saved);
    const response = await app.inject({ method: 'POST', url: '/api/inventory/suppliers', payload: { ...input, name: '  supplier a  ' } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'DUPLICATE_SUPPLIER_NAME' });
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('rejects rename to a name already used by a different supplier', async () => {
    const { app, repository } = setup();
    repository.findActiveByName.mockResolvedValue({ ...saved, id: 'different-id' });
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/suppliers/${id}`, payload: { name: 'Supplier B' } })).statusCode).toBe(409);
    expect(repository.update).not.toHaveBeenCalled();
  });
});

describe('S-03 Supplier Master Owner-only deactivate rule', () => {
  it('allows OWNER to change active', async () => {
    const { app, repository } = setup({ ...owner, role: 'OWNER' });
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/suppliers/${id}`, payload: { active: false } })).statusCode).toBe(200);
    expect(repository.update).toHaveBeenCalledWith(id, { active: false }, expect.objectContaining({ role: 'OWNER' }));
  });
  it('denies MANAGER changing active, even though Manager may edit other fields', async () => {
    const { app, repository } = setup({ ...owner, role: 'MANAGER' });
    const activeResponse = await app.inject({ method: 'PATCH', url: `/api/inventory/suppliers/${id}`, payload: { active: false } });
    expect(activeResponse.statusCode).toBe(403);
    expect(activeResponse.json()).toMatchObject({ error: 'FORBIDDEN' });
    expect(repository.update).not.toHaveBeenCalled();

    const otherFieldResponse = await app.inject({ method: 'PATCH', url: `/api/inventory/suppliers/${id}`, payload: { contact: '0333-9999999' } });
    expect(otherFieldResponse.statusCode).toBe(200);
  });
  it('denies MANAGER changing active even bundled with another field in the same request', async () => {
    const { app, repository } = setup({ ...owner, role: 'MANAGER' });
    const response = await app.inject({ method: 'PATCH', url: `/api/inventory/suppliers/${id}`, payload: { contact: 'x', active: true } });
    expect(response.statusCode).toBe(403);
    expect(repository.update).not.toHaveBeenCalled();
  });
});

describe('S-03 Supplier Master authorization', () => {
  for (const endpoint of endpoints) {
    it.each(['OWNER', 'MANAGER'])(`${endpoint.method} permits %s (non-active fields)`, async role => {
      const { app } = setup({ ...owner, role });
      const payload = endpoint.method === 'POST' ? input : { contact: 'updated' };
      expect((await app.inject({ ...endpoint, payload })).statusCode).toBe(endpoint.method === 'POST' ? 201 : 200);
    });
    it.each(['STAFF', 'STORE_KEEPER', 'owner', 'UNKNOWN'])(`${endpoint.method} denies %s`, async role => {
      const { app, repository } = setup({ ...owner, role });
      const payload = endpoint.method === 'POST' ? input : { contact: 'updated' };
      expect((await app.inject({ ...endpoint, payload })).statusCode).toBe(403);
      expect(repository.create).not.toHaveBeenCalled(); expect(repository.update).not.toHaveBeenCalled();
    });
    it(`${endpoint.method} rejects blank/missing context`, async () => {
      const payload = endpoint.method === 'POST' ? input : { contact: 'updated' };
      const { app: blank, repository: blankRepo } = setup({ ...owner, userId: ' ' });
      expect((await blank.inject({ ...endpoint, payload })).statusCode).toBe(401);
      expect(blankRepo.create).not.toHaveBeenCalled(); expect(blankRepo.update).not.toHaveBeenCalled();
      const { app: missing, repository: missingRepo } = setup(null);
      expect((await missing.inject({ ...endpoint, payload })).statusCode).toBe(401);
      expect(missingRepo.create).not.toHaveBeenCalled(); expect(missingRepo.update).not.toHaveBeenCalled();
    });
  }
  it('GET /api/inventory/suppliers requires Owner/Manager', async () => {
    const { app: allowed } = setup(owner);
    expect((await allowed.inject({ method: 'GET', url: '/api/inventory/suppliers' })).statusCode).toBe(200);
    const { app: denied } = setup({ ...owner, role: 'STAFF' });
    expect((await denied.inject({ method: 'GET', url: '/api/inventory/suppliers' })).statusCode).toBe(403);
  });
});

describe('S-03 Supplier Master errors', () => {
  it('returns missing supplier as 404', async () => {
    const { app, repository } = setup(); repository.update.mockResolvedValue(null);
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/suppliers/${id}`, payload: { contact: 'x' } })).statusCode).toBe(404);
  });
});
