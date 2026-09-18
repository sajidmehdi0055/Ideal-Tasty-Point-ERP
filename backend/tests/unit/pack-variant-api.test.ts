import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import type { AuthContext } from '../../src/auth/context.js';
import type { PackVariantRepository } from '../../src/inventory/application/pack-variant-repository.js';
import type { PackVariant } from '../../src/inventory/domain/pack-variant.js';
import type { ItemRepository } from '../../src/inventory/application/item-repository.js';
import type { UomRepository } from '../../src/inventory/application/uom-repository.js';
import type { BrandRepository } from '../../src/inventory/application/brand-repository.js';

const id = 'e0a8f673-2a55-4c83-8831-a6c4b6358245';
const itemId = '11111111-1111-4111-8111-111111111111';
const brandId = '22222222-2222-4222-8222-222222222222';
const packUomId = '33333333-3333-4333-8333-333333333333';
const input = { item_id: itemId, brand_id: brandId, pack_uom_id: packUomId, conversion_factor: '16' };
const owner: AuthContext = { userId: 'owner-1', role: 'OWNER', branchId: 'branch-2' };
const saved: PackVariant = { id, item_id: itemId, brand_id: brandId, pack_uom_id: packUomId, conversion_factor: '16.000000', active: true, created_at: '2026-09-18T00:00:00Z', updated_at: '2026-09-18T00:00:00Z' };
const apps: FastifyInstance[] = [];
const unusedItemRepository: ItemRepository = { create: vi.fn(), update: vi.fn() };
const unusedUomRepository: UomRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() };
const unusedBrandRepository: BrandRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() };

function setup(auth: AuthContext | null = owner, defaultProvider = false) {
  const repository = {
    create: vi.fn<PackVariantRepository['create']>().mockResolvedValue(saved),
    update: vi.fn<PackVariantRepository['update']>().mockResolvedValue(saved),
    list: vi.fn<PackVariantRepository['list']>().mockResolvedValue([saved]),
  } satisfies PackVariantRepository;
  const app = buildApp({
    repository: unusedItemRepository, uomRepository: unusedUomRepository,
    brandRepository: unusedBrandRepository, packVariantRepository: repository,
    ...(defaultProvider ? {} : { authProvider: async () => auth }),
  });
  apps.push(app); return { app, repository };
}
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
const endpoints = [{ method: 'POST' as const, url: '/api/inventory/pack-variants' }, { method: 'PATCH' as const, url: `/api/inventory/pack-variants/${id}` }];

describe('S-02 Pack Variant mandatory fields and FK identity', () => {
  it.each(['item_id', 'brand_id', 'pack_uom_id', 'conversion_factor'])('rejects missing create field %s', async field => {
    const { app, repository } = setup(); const payload: Record<string, unknown> = { ...input }; delete payload[field];
    expect((await app.inject({ method: 'POST', url: '/api/inventory/pack-variants', payload })).statusCode).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it.each(['not-a-uuid', '', 123])('rejects malformed item_id %j', async value => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/pack-variants', payload: { ...input, item_id: value } })).statusCode).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', '16.0000001', '16.a', 'abc', '1e5', ''])('rejects invalid conversion_factor %j', async value => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/pack-variants', payload: { ...input, conversion_factor: value } })).statusCode).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it.each(['16', '16.5', '0.000001', '999999999999'])('accepts valid conversion_factor %s', async conversion_factor => {
    const { app } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/pack-variants', payload: { ...input, conversion_factor } })).statusCode).toBe(201);
  });
  it.each(['item_id', 'brand_id', 'pack_uom_id', 'id', 'created_at'])('rejects PATCH attempting to change immutable field %s', async field => {
    const { app, repository } = setup();
    const response = await app.inject({ method: 'PATCH', url: `/api/inventory/pack-variants/${id}`, payload: { [field]: itemId, active: true } });
    expect(response.statusCode).toBe(400);
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('allows PATCH of conversion_factor and active only', async () => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/pack-variants/${id}`, payload: { conversion_factor: '5', active: false } })).statusCode).toBe(200);
    expect(repository.update).toHaveBeenCalledWith(id, { conversion_factor: '5', active: false }, owner);
  });
  it('rejects empty edit and malformed identifier', async () => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/pack-variants/${id}`, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/api/inventory/pack-variants/not-uuid', payload: { active: false } })).statusCode).toBe(400);
    expect(repository.update).not.toHaveBeenCalled();
  });
});

describe('S-02 Pack Variant not-found / cross-branch denial', () => {
  it('returns 404 when repository.create signals the referenced item is not accessible', async () => {
    const { app, repository } = setup(); repository.create.mockResolvedValue(null);
    expect((await app.inject({ method: 'POST', url: '/api/inventory/pack-variants', payload: input })).statusCode).toBe(404);
  });
  it('returns 404 when repository.update signals not found / wrong branch', async () => {
    const { app, repository } = setup(); repository.update.mockResolvedValue(null);
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/pack-variants/${id}`, payload: { active: false } })).statusCode).toBe(404);
  });
});

describe('S-02 Pack Variant authorization', () => {
  for (const endpoint of endpoints) {
    it.each(['OWNER', 'MANAGER'])(`${endpoint.method} permits %s`, async role => {
      const { app } = setup({ ...owner, role });
      expect((await app.inject({ ...endpoint, payload: endpoint.method === 'POST' ? input : { active: false } })).statusCode).toBe(endpoint.method === 'POST' ? 201 : 200);
    });
    it.each(['STAFF', 'STORE_KEEPER', 'owner', 'UNKNOWN'])(`${endpoint.method} denies %s`, async role => {
      const { app, repository } = setup({ ...owner, role });
      expect((await app.inject({ ...endpoint, payload: endpoint.method === 'POST' ? input : { active: false } })).statusCode).toBe(403);
      expect(repository.create).not.toHaveBeenCalled(); expect(repository.update).not.toHaveBeenCalled();
    });
    it(`${endpoint.method} rejects spoofed identity by default`, async () => {
      const { app, repository } = setup(null, true);
      expect((await app.inject({ ...endpoint, payload: endpoint.method === 'POST' ? input : { active: false }, headers: { 'x-auth-context': JSON.stringify(owner) } })).statusCode).toBe(401);
      expect(repository.create).not.toHaveBeenCalled(); expect(repository.update).not.toHaveBeenCalled();
    });
  }
  it('GET /api/inventory/pack-variants requires Owner/Manager', async () => {
    const { app: allowed } = setup(owner);
    expect((await allowed.inject({ method: 'GET', url: '/api/inventory/pack-variants' })).statusCode).toBe(200);
    const { app: denied } = setup({ ...owner, role: 'STAFF' });
    expect((await denied.inject({ method: 'GET', url: '/api/inventory/pack-variants' })).statusCode).toBe(403);
  });
});

describe('S-02 Pack Variant list is branch-scoped (BLOCKER 1)', () => {
  it('passes the caller\'s validated AuthContext to repository.list, not just a role check', async () => {
    const manager: AuthContext = { userId: 'manager-9', role: 'MANAGER', branchId: 'branch-9' };
    const { app, repository } = setup(manager);
    expect((await app.inject({ method: 'GET', url: '/api/inventory/pack-variants' })).statusCode).toBe(200);
    expect(repository.list).toHaveBeenCalledWith(manager);
    expect(repository.list).toHaveBeenCalledTimes(1);
  });

  it('two callers from different branches trigger two independently-scoped repository.list calls', async () => {
    const branchA: AuthContext = { userId: 'user-a', role: 'OWNER', branchId: 'branch-a' };
    const branchB: AuthContext = { userId: 'user-b', role: 'OWNER', branchId: 'branch-b' };
    const { app: appA, repository: repoA } = setup(branchA);
    const { app: appB, repository: repoB } = setup(branchB);
    await appA.inject({ method: 'GET', url: '/api/inventory/pack-variants' });
    await appB.inject({ method: 'GET', url: '/api/inventory/pack-variants' });
    expect(repoA.list).toHaveBeenCalledWith(branchA);
    expect(repoB.list).toHaveBeenCalledWith(branchB);
  });

  it('service.list forwards auth even when called directly, bypassing HTTP', async () => {
    const { repository } = setup();
    const { PackVariantService } = await import('../../src/inventory/application/pack-variant-service.js');
    const service = new PackVariantService(repository);
    const branchC: AuthContext = { userId: 'user-c', role: 'MANAGER', branchId: 'branch-c' };
    await service.list(branchC);
    expect(repository.list).toHaveBeenCalledWith(branchC);
  });
});
