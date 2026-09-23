import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import type { AuthContext } from '../../src/auth/context.js';
import { ItemService } from '../../src/inventory/application/item-service.js';
import type { ItemRepository } from '../../src/inventory/application/item-repository.js';
import type { UomRepository } from '../../src/inventory/application/uom-repository.js';
import type { BrandRepository } from '../../src/inventory/application/brand-repository.js';
import type { PackVariantRepository } from '../../src/inventory/application/pack-variant-repository.js';
import { PRIMARY_ITEM_TYPES, type Item, type ItemInput } from '../../src/inventory/domain/item.js';
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
function setup(auth: AuthContext | null = owner, defaultProvider = false) {
  const repository = { create: vi.fn<ItemRepository['create']>().mockResolvedValue(saved), update: vi.fn<ItemRepository['update']>().mockResolvedValue(saved) } satisfies ItemRepository;
  const app = buildApp({
    repository, uomRepository: unusedUomRepository, brandRepository: unusedBrandRepository,
    packVariantRepository: unusedPackVariantRepository, ...(defaultProvider ? {} : { authProvider: async () => auth }),
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
