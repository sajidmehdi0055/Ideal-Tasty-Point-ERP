import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import type { AuthContext } from '../../src/auth/context.js';
import type { UomRepository } from '../../src/inventory/application/uom-repository.js';
import { UOM_UNIT_TYPES, type Uom } from '../../src/inventory/domain/uom.js';
import type { ItemRepository } from '../../src/inventory/application/item-repository.js';
import type { BrandRepository } from '../../src/inventory/application/brand-repository.js';
import type { PackVariantRepository } from '../../src/inventory/application/pack-variant-repository.js';

const id = 'e0a8f673-2a55-4c83-8831-a6c4b6358245';
const input = { name: 'KG', unit_type: 'WEIGHT' as const };
const owner: AuthContext = { userId: 'owner-1', role: 'OWNER', branchId: 'branch-2' };
const saved: Uom = { ...input, id, active: true, created_at: '2026-09-18T00:00:00Z', updated_at: '2026-09-18T00:00:00Z' };
const apps: FastifyInstance[] = [];
const unusedItemRepository: ItemRepository = { create: vi.fn(), update: vi.fn() };
const unusedBrandRepository: BrandRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() };
const unusedPackVariantRepository: PackVariantRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn() };

function setup(auth: AuthContext | null = owner, defaultProvider = false) {
  const repository = {
    create: vi.fn<UomRepository['create']>().mockResolvedValue(saved),
    update: vi.fn<UomRepository['update']>().mockResolvedValue(saved),
    list: vi.fn<UomRepository['list']>().mockResolvedValue([saved]),
    findActiveByName: vi.fn<UomRepository['findActiveByName']>().mockResolvedValue(null),
  } satisfies UomRepository;
  const app = buildApp({
    repository: unusedItemRepository, uomRepository: repository,
    brandRepository: unusedBrandRepository, packVariantRepository: unusedPackVariantRepository,
    ...(defaultProvider ? {} : { authProvider: async () => auth }),
  });
  apps.push(app); return { app, repository };
}
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });
const endpoints = [{ method: 'POST' as const, url: '/api/inventory/uoms' }, { method: 'PATCH' as const, url: `/api/inventory/uoms/${id}` }];

describe('S-02 UOM Master mandatory fields and unit_type', () => {
  it.each(['name', 'unit_type'])('rejects missing create field %s', async field => {
    const { app, repository } = setup(); const payload: Record<string, unknown> = { ...input }; delete payload[field];
    expect((await app.inject({ method: 'POST', url: '/api/inventory/uoms', payload })).statusCode).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it.each(['', '   ', null])('rejects invalid name: %j', async value => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/uoms', payload: { ...input, name: value } })).statusCode).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it.each(['OTHER', 'weight', ['WEIGHT']])('rejects invalid unit_type %j', async value => {
    const { app } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/uoms', payload: { ...input, unit_type: value } })).statusCode).toBe(400);
  });
  it.each(UOM_UNIT_TYPES)('accepts unit_type %s', async unit_type => {
    const { app } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/uoms', payload: { ...input, unit_type } })).statusCode).toBe(201);
  });
  it.each(['id', 'created_at', 'unexpected'])('rejects override %s on create', async field => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/uoms', payload: { ...input, [field]: 'override' } })).statusCode).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('allows partial edit of only active', async () => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/uoms/${id}`, payload: { active: false } })).statusCode).toBe(200);
    expect(repository.update).toHaveBeenCalledWith(id, { active: false }, owner);
  });
  it('rejects empty edit and malformed identifier', async () => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/uoms/${id}`, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: '/api/inventory/uoms/not-uuid', payload: { active: false } })).statusCode).toBe(400);
    expect(repository.update).not.toHaveBeenCalled();
  });
});

describe('S-02 UOM Master duplicate-name protection', () => {
  it('rejects create when an active UOM with the same name (case-insensitive/trimmed) exists', async () => {
    const { app, repository } = setup();
    repository.findActiveByName.mockResolvedValue(saved);
    const response = await app.inject({ method: 'POST', url: '/api/inventory/uoms', payload: { name: '  kg  ', unit_type: 'WEIGHT' } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'DUPLICATE_UOM_NAME' });
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('rejects rename to a name already used by a different UOM', async () => {
    const { app, repository } = setup();
    repository.findActiveByName.mockResolvedValue({ ...saved, id: 'different-id' });
    const response = await app.inject({ method: 'PATCH', url: `/api/inventory/uoms/${id}`, payload: { name: 'GRAM' } });
    expect(response.statusCode).toBe(409);
    expect(repository.update).not.toHaveBeenCalled();
  });
  it('allows rename that only changes case/whitespace of its own existing name', async () => {
    const { app, repository } = setup();
    repository.findActiveByName.mockResolvedValue(saved);
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/uoms/${id}`, payload: { name: ' kg ' } })).statusCode).toBe(200);
  });
});

describe('S-02 UOM Master authorization', () => {
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
    it(`${endpoint.method} rejects spoofed identity by default`, async () => {
      const { app, repository } = setup(null, true);
      expect((await app.inject({ ...endpoint, payload: input, headers: { 'x-auth-context': JSON.stringify(owner) } })).statusCode).toBe(401);
      expect(repository.create).not.toHaveBeenCalled(); expect(repository.update).not.toHaveBeenCalled();
    });
  }
  it('GET /api/inventory/uoms requires Owner/Manager', async () => {
    const { app: allowed } = setup(owner);
    expect((await allowed.inject({ method: 'GET', url: '/api/inventory/uoms' })).statusCode).toBe(200);
    const { app: denied } = setup({ ...owner, role: 'STAFF' });
    expect((await denied.inject({ method: 'GET', url: '/api/inventory/uoms' })).statusCode).toBe(403);
  });
});

describe('S-02 UOM Master errors', () => {
  it('returns missing UOM as 404', async () => {
    const { app, repository } = setup(); repository.update.mockResolvedValue(null);
    expect((await app.inject({ method: 'PATCH', url: `/api/inventory/uoms/${id}`, payload: { active: false } })).statusCode).toBe(404);
  });
});
