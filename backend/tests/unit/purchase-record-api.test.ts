import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import type { AuthContext } from '../../src/auth/context.js';
import { AppError } from '../../src/errors.js';
import type { PurchaseRecordRepository } from '../../src/inventory/application/purchase-record-repository.js';
import type { PurchaseRecord, RateComparisonResult } from '../../src/inventory/domain/purchase-record.js';
import type { ItemRepository } from '../../src/inventory/application/item-repository.js';
import type { UomRepository } from '../../src/inventory/application/uom-repository.js';
import type { BrandRepository } from '../../src/inventory/application/brand-repository.js';
import type { PackVariantRepository } from '../../src/inventory/application/pack-variant-repository.js';
import type { SupplierRepository } from '../../src/inventory/application/supplier-repository.js';

const id = 'e0a8f673-2a55-4c83-8831-a6c4b6358245';
const supplierId = '44444444-4444-4444-8444-444444444444';
const itemId = '11111111-1111-4111-8111-111111111111';
const brandId = '22222222-2222-4222-8222-222222222222';
const packVariantId = '33333333-3333-4333-8333-333333333333';
const input = { supplier_id: supplierId, item_id: itemId, brand_id: brandId, pack_variant_id: packVariantId, quantity: '10', rate: '12.5', purchase_date: '2026-09-20' };
const owner: AuthContext = { userId: 'owner-1', role: 'OWNER', branchId: 'branch-2' };
const saved: PurchaseRecord = { id, ...input, quantity: '10.000000', rate: '12.500000', created_at: '2026-09-20T00:00:00Z' };
const apps: FastifyInstance[] = [];
const unusedItemRepository: ItemRepository = { create: vi.fn(), update: vi.fn() };
const unusedUomRepository: UomRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() };
const unusedBrandRepository: BrandRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() };
const unusedPackVariantRepository: PackVariantRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn() };
const unusedSupplierRepository: SupplierRepository = { create: vi.fn(), update: vi.fn(), list: vi.fn(), findActiveByName: vi.fn() };

function setup(auth: AuthContext | null = owner, defaultProvider = false) {
  const repository = {
    create: vi.fn<PurchaseRecordRepository['create']>().mockResolvedValue(saved),
    list: vi.fn<PurchaseRecordRepository['list']>().mockResolvedValue([saved]),
    getRateComparison: vi.fn<PurchaseRecordRepository['getRateComparison']>(),
  } satisfies PurchaseRecordRepository;
  const app = buildApp({
    repository: unusedItemRepository, uomRepository: unusedUomRepository,
    brandRepository: unusedBrandRepository, packVariantRepository: unusedPackVariantRepository,
    supplierRepository: unusedSupplierRepository, purchaseRecordRepository: repository,
    ...(defaultProvider ? {} : { authProvider: async () => auth }),
  });
  apps.push(app); return { app, repository };
}
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

describe('S-03 Purchase Record mandatory fields and validation', () => {
  it.each(['supplier_id', 'item_id', 'brand_id', 'pack_variant_id', 'quantity', 'rate', 'purchase_date'])('rejects missing create field %s', async field => {
    const { app, repository } = setup(); const payload: Record<string, unknown> = { ...input }; delete payload[field];
    expect((await app.inject({ method: 'POST', url: '/api/inventory/purchases', payload })).statusCode).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', '10.0000001', 'abc', '', '1e5'])('rejects invalid quantity %j', async value => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/purchases', payload: { ...input, quantity: value } })).statusCode).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it.each(['0', '-5', 'abc', ''])('rejects invalid rate %j', async value => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/purchases', payload: { ...input, rate: value } })).statusCode).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('rejects a future purchase_date', async () => {
    const { app, repository } = setup();
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const response = await app.inject({ method: 'POST', url: '/api/inventory/purchases', payload: { ...input, purchase_date: future } });
    expect(response.statusCode).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('accepts a backdated (past) purchase_date', async () => {
    const { app } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/purchases', payload: { ...input, purchase_date: '2020-01-01' } })).statusCode).toBe(201);
  });
  it('rejects malformed purchase_date', async () => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/purchases', payload: { ...input, purchase_date: '20-09-2026' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/inventory/purchases', payload: { ...input, purchase_date: '2026-02-30' } })).statusCode).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });
  // Leap-year rule: divisible by 4, except centuries, unless divisible by 400.
  // Only past dates are usable here (future dates are rejected separately).
  it.each(['2000-02-29', '1600-02-29', '2024-02-29'])('accepts Feb 29 in a leap year %s (incl. centuries divisible by 400)', async value => {
    const { app, repository } = setup();
    const response = await app.inject({ method: 'POST', url: '/api/inventory/purchases', payload: { ...input, purchase_date: value } });
    expect(response.statusCode).toBe(201);
    expect(repository.create).toHaveBeenCalledWith({ ...input, purchase_date: value }, owner);
  });
  it.each(['1900-02-29', '1800-02-29', '1700-02-29', '2023-02-29'])('rejects Feb 29 in a non-leap year %s (incl. centuries not divisible by 400)', async value => {
    const { app, repository } = setup();
    const response = await app.inject({ method: 'POST', url: '/api/inventory/purchases', payload: { ...input, purchase_date: value } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR', issues: [{ path: ['purchase_date'], message: 'purchase_date must be a valid calendar date' }] });
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('rejects unknown/overridden fields, including id/created_at', async () => {
    const { app, repository } = setup();
    expect((await app.inject({ method: 'POST', url: '/api/inventory/purchases', payload: { ...input, id: 'override' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/inventory/purchases', payload: { ...input, created_at: 'override' } })).statusCode).toBe(400);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('accepts a valid create', async () => {
    const { app, repository } = setup();
    const response = await app.inject({ method: 'POST', url: '/api/inventory/purchases', payload: input });
    expect(response.statusCode).toBe(201);
    expect(repository.create).toHaveBeenCalledWith(input, owner);
  });
});

describe('S-03 Purchase Record has no edit endpoint', () => {
  it('PATCH is not a registered route (purchase records are immutable once created)', async () => {
    const { app } = setup();
    const response = await app.inject({ method: 'PATCH', url: `/api/inventory/purchases/${id}`, payload: { rate: '99' } });
    expect(response.statusCode).toBe(404);
  });
});

describe('S-03 Purchase Record not-found / invalid-reference handling', () => {
  it('returns 404 when repository.create signals the referenced item is not accessible (cross-branch or missing)', async () => {
    const { app, repository } = setup(); repository.create.mockResolvedValue(null);
    expect((await app.inject({ method: 'POST', url: '/api/inventory/purchases', payload: input })).statusCode).toBe(404);
  });
  it('returns 400 INVALID_REFERENCE when repository.create rejects a pack_variant/item/brand mismatch', async () => {
    const { app, repository } = setup();
    repository.create.mockRejectedValue(new AppError(400, 'INVALID_REFERENCE', 'mismatch'));
    const response = await app.inject({ method: 'POST', url: '/api/inventory/purchases', payload: input });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'INVALID_REFERENCE' });
  });
});

describe('S-03 Purchase Record authorization', () => {
  it.each(['OWNER', 'MANAGER'])('POST permits %s', async role => {
    const { app } = setup({ ...owner, role });
    expect((await app.inject({ method: 'POST', url: '/api/inventory/purchases', payload: input })).statusCode).toBe(201);
  });
  it.each(['STAFF', 'STORE_KEEPER', 'owner', 'UNKNOWN'])('POST denies %s', async role => {
    const { app, repository } = setup({ ...owner, role });
    expect((await app.inject({ method: 'POST', url: '/api/inventory/purchases', payload: input })).statusCode).toBe(403);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('POST rejects blank/missing context', async () => {
    const { app: blank, repository: blankRepo } = setup({ ...owner, userId: ' ' });
    expect((await blank.inject({ method: 'POST', url: '/api/inventory/purchases', payload: input })).statusCode).toBe(401);
    expect(blankRepo.create).not.toHaveBeenCalled();
    const { app: missing, repository: missingRepo } = setup(null);
    expect((await missing.inject({ method: 'POST', url: '/api/inventory/purchases', payload: input })).statusCode).toBe(401);
    expect(missingRepo.create).not.toHaveBeenCalled();
  });
  it('GET /api/inventory/purchases requires Owner/Manager and forwards branch-scoped auth', async () => {
    const manager: AuthContext = { userId: 'manager-9', role: 'MANAGER', branchId: 'branch-9' };
    const { app: allowed, repository } = setup(manager);
    expect((await allowed.inject({ method: 'GET', url: '/api/inventory/purchases' })).statusCode).toBe(200);
    expect(repository.list).toHaveBeenCalledWith(manager);
    const { app: denied } = setup({ ...owner, role: 'STAFF' });
    expect((await denied.inject({ method: 'GET', url: '/api/inventory/purchases' })).statusCode).toBe(403);
  });
});

describe('S-03 Rate Comparison', () => {
  const query = `item_id=${itemId}&brand_id=${brandId}&pack_variant_id=${packVariantId}`;
  it('requires Owner/Manager', async () => {
    const { app } = setup({ ...owner, role: 'STAFF' });
    expect((await app.inject({ method: 'GET', url: `/api/inventory/purchases/rate-comparison?${query}` })).statusCode).toBe(403);
  });
  it('rejects missing/malformed query parameters', async () => {
    const { app } = setup();
    expect((await app.inject({ method: 'GET', url: `/api/inventory/purchases/rate-comparison?item_id=${itemId}&brand_id=${brandId}` })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `/api/inventory/purchases/rate-comparison?item_id=not-a-uuid&brand_id=${brandId}&pack_variant_id=${packVariantId}` })).statusCode).toBe(400);
  });
  it('returns 404 when the referenced item is not accessible (cross-branch or missing)', async () => {
    const { app, repository } = setup(); repository.getRateComparison.mockResolvedValue(null);
    expect((await app.inject({ method: 'GET', url: `/api/inventory/purchases/rate-comparison?${query}` })).statusCode).toBe(404);
  });
  it('degrades gracefully to nulls when zero purchase records exist yet', async () => {
    const empty: RateComparisonResult = {
      item_id: itemId, brand_id: brandId, pack_variant_id: packVariantId, records_considered: 0,
      current_rate: null, previous_rate: null, average_rate_last_3: null, current_rate_per_base_uom: null,
      percentage_change: null, supplier_breakdown: [],
    };
    const { app, repository } = setup(); repository.getRateComparison.mockResolvedValue(empty);
    const response = await app.inject({ method: 'GET', url: `/api/inventory/purchases/rate-comparison?${query}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(empty);
  });
  it('returns computed stats when repository provides them, forwarding the parsed query and auth', async () => {
    const populated: RateComparisonResult = {
      item_id: itemId, brand_id: brandId, pack_variant_id: packVariantId, records_considered: 3,
      current_rate: '13.000000', previous_rate: '12.000000', average_rate_last_3: '12.333333',
      current_rate_per_base_uom: '0.812500', percentage_change: '8.333333',
      supplier_breakdown: [{ supplier_id: supplierId, supplier_name: 'Supplier A', purchase_count: 2, latest_rate: '13.000000', average_rate: '12.500000' }],
    };
    const { app, repository } = setup(); repository.getRateComparison.mockResolvedValue(populated);
    const response = await app.inject({ method: 'GET', url: `/api/inventory/purchases/rate-comparison?${query}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(populated);
    expect(repository.getRateComparison).toHaveBeenCalledWith(
      { item_id: itemId, brand_id: brandId, pack_variant_id: packVariantId }, owner,
    );
  });
});
