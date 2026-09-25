import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import type { AuthContext } from '../../src/auth/context.js';
import type { BrandRepository } from '../../src/inventory/application/brand-repository.js';
import type { Brand } from '../../src/inventory/domain/brand.js';
import type { ItemRepository } from '../../src/inventory/application/item-repository.js';
import type { UomRepository } from '../../src/inventory/application/uom-repository.js';
import type { PackVariantRepository } from '../../src/inventory/application/pack-variant-repository.js';
import type { SupplierRepository } from '../../src/inventory/application/supplier-repository.js';
import type { PurchaseRecordRepository } from '../../src/inventory/application/purchase-record-repository.js';

const id = 'e0a8f673-2a55-4c83-8831-a6c4b6358245';
const input = { name: 'Brand A' };
const owner: AuthContext = { userId: 'owner-1', role: 'OWNER', branchId: 'branch-2' };
const saved: Brand = { ...input, id, active: true, created_at: '2026-09-18T00:00:00Z', updated_at: '2026-09-18T00:00:00Z' };
const apps: FastifyInstance[] = [];
const unusedItemRepository: ItemRepository = { create: vi.fn(), update: vi.fn() };
const unusedUomRepository: UomRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() };
const unusedPackVariantRepository: PackVariantRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn() };
const unusedSupplierRepository: SupplierRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() };
const unusedPurchaseRecordRepository: PurchaseRecordRepository = { create: vi.fn(), list: vi.fn(), getRateComparison: vi.fn() };

function setup(auth: AuthContext | null = owner, defaultProvider = false) {
  const repository = {
    create: vi.fn<BrandRepository['create']>().mockResolvedValue(saved),
    update: vi.fn<BrandRepository['update']>().mockResolvedValue(saved),
    list: vi.fn<BrandRepository['list']>().mockResolvedValue([saved]),
    findActiveByName: vi.fn<BrandRepository['findActiveByName']>().mockResolvedValue(null),
  } satisfies BrandRepository;
  const app = buildApp({
    repository: unusedItemRepository, uomRepository: unusedUomRepository,
    brandRepository: repository, packVariantRepository: unusedPackVariantRepository,
    supplierRepository: unusedSupplierRepository, purchaseRecordRepository: unusedPurchaseRecordRepository,
    ...(defaultProvider ? {} : { authProvider: async () => auth }),
  });
  apps.push(app); return { app, repository };
}
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
const endpoints = [{ method: 'POST' as const, url: '/api/inventory/brands' }, { method: 'PATCH' as const, url: `/api/inventory/brands/${id}` }];

describe('S-02 Brand Master mandatory fields', () => {
  it.each(['', '   ', null])('rejects invalid name: %j', async value => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/brands', payload: { name: value } })).statusCode).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it.each(['id', 'created_at', 'unexpected'])('rejects override %s on create', async field => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/brands', payload: { ...input, [field]: 'override' } })).statusCode).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('accepts creation with international brand names', async () => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/brands', payload: { name: 'برانڈ اے' } })).statusCode).toBe(201);
    expect(repository.create).toHaveBeenCalledWith({ name: 'برانڈ اے' }, owner);
  });
  it('allows partial edit of only active', async () => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/brands/${id}`, payload: { active: false } })).statusCode).toBe(200);
    expect(repository.update).toHaveBeenCalledWith(id, { active: false }, owner);
  });
  it('rejects empty edit and malformed identifier', async () => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/brands/${id}`, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/api/inventory/brands/not-uuid', payload: { active: false } })).statusCode).toBe(400);
    expect(repository.update).not.toHaveBeenCalled();
  });
});

describe('S-02 Brand Master duplicate-name protection', () => {
  it('rejects create when an active brand with the same name (case-insensitive/trimmed) exists', async () => {
    const { app, repository } = setup();
    repository.findActiveByName.mockResolvedValue(saved);
    const response = await app.inject({ method: 'POST', url: '/api/inventory/brands', payload: { name: '  brand a  ' } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'DUPLICATE_BRAND_NAME' });
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('rejects rename to a name already used by a different brand', async () => {
    const { app, repository } = setup();
    repository.findActiveByName.mockResolvedValue({ ...saved, id: 'different-id' });
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/brands/${id}`, payload: { name: 'Brand B' } })).statusCode).toBe(409);
    expect(repository.update).not.toHaveBeenCalled();
  });
});

describe('S-02 Brand Master authorization', () => {
  for (const endpoint of endpoints) {
    it.each(['OWNER', 'MANAGER'])(`${endpoint.method} permits %s`, async role => {
      const { app } = setup({ ...owner, role });
      expect((await app.inject({ ...endpoint, payload: input })).statusCode).toBe(endpoint.method === 'POST' ? 201 : 200);
    });
    it.each(['STAFF', 'STORE_KEEPER', 'owner', 'UNKNOWN'])(`${endpoint.method} denies %s`, async role => {
      const { app, repository } = setup({ ...owner, role });
      expect((await app.inject({ ...endpoint, payload: input })).statusCode).toBe(403);
      expect(repository.create).not.toHaveBeenCalled(); expect(repository.update).not.toHaveBeenCalled();
    });
    it(`${endpoint.method} rejects blank/missing context`, async () => {
      const { app: blank, repository: blankRepo } = setup({ ...owner, userId: ' ' });
      expect((await blank.inject({ ...endpoint, payload: input })).statusCode).toBe(401);
      expect(blankRepo.create).not.toHaveBeenCalled(); expect(blankRepo.update).not.toHaveBeenCalled();
      const { app: missing, repository: missingRepo } = setup(null);
      expect((await missing.inject({ ...endpoint, payload: input })).statusCode).toBe(401);
      expect(missingRepo.create).not.toHaveBeenCalled(); expect(missingRepo.update).not.toHaveBeenCalled();
    });
  }
  it('GET /api/inventory/brands requires Owner/Manager', async () => {
    const { app: allowed } = setup(owner);
    expect((await allowed.inject({ method: 'GET', url: '/api/inventory/brands' })).statusCode).toBe(200);
    const { app: denied } = setup({ ...owner, role: 'STAFF' });
    expect((await denied.inject({ method: 'GET', url: '/api/inventory/brands' })).statusCode).toBe(403);
  });
});

describe('S-02 Brand Master errors', () => {
  it('returns missing brand as 404', async () => {
    const { app, repository } = setup(); repository.update.mockResolvedValue(null);
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/brands/${id}`, payload: { active: false } })).statusCode).toBe(404);
  });
});
