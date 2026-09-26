import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { AuthContext } from '../../src/auth/context.js';
import { PgItemRepository } from '../../src/inventory/persistence/pg-item-repository.js';
import { PgUomRepository } from '../../src/inventory/persistence/pg-uom-repository.js';
import { PgBrandRepository } from '../../src/inventory/persistence/pg-brand-repository.js';
import { PgPackVariantRepository } from '../../src/inventory/persistence/pg-pack-variant-repository.js';
import { PgSupplierRepository } from '../../src/inventory/persistence/pg-supplier-repository.js';
import { PgPurchaseRecordRepository } from '../../src/inventory/persistence/pg-purchase-record-repository.js';
import { PgStockLocationRepository } from '../../src/inventory/persistence/pg-stock-location-repository.js';
import { PgStockRepository } from '../../src/inventory/persistence/pg-stock-repository.js';
import type { ItemInput } from '../../src/inventory/domain/item.js';
import type { PurchaseRecordInput } from '../../src/inventory/domain/purchase-record.js';
import { applyRuntimeGrants } from './helpers/runtime-grants.js';
import { runAuthoritativeMigrate } from './helpers/migrate-cli.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('TEST_DATABASE_URL is required for real PostgreSQL integration tests');

describe('S-03 Supplier Master & Purchase Record (real PostgreSQL)', () => {
  const suffix = randomUUID().replaceAll('-', '');
  const schema = `inv_s03_test_${suffix}`;
  const role = `inv_s03_app_${suffix}`;
  const admin = new Pool({ connectionString, options: `-c search_path=${schema}` });
  const runtime = new Pool({ connectionString, options: `-c search_path=${schema} -c role=${role}`, max: 12 });
  const itemRepository = new PgItemRepository(runtime);
  const uomRepository = new PgUomRepository(runtime);
  const brandRepository = new PgBrandRepository(runtime);
  const packVariantRepository = new PgPackVariantRepository(runtime);
  const supplierRepository = new PgSupplierRepository(runtime);
  const purchaseRecordRepository = new PgPurchaseRecordRepository(runtime);
  const stockLocationRepository = new PgStockLocationRepository(runtime);
  const stockRepository = new PgStockRepository(runtime);
  const owner: AuthContext = { userId: 'owner-a', role: 'OWNER', branchId: 'branch-a' };
  const manager: AuthContext = { userId: 'manager-b', role: 'MANAGER', branchId: 'branch-b' };
  const itemInput: ItemInput = { item_name: 'Ghee', primary_item_type: 'RAW_MATERIAL', base_uom: 'kg', brand: 'Generic / No Brand' };

  function buildTestApp(auth: AuthContext) {
    return buildApp({
      repository: itemRepository, uomRepository, brandRepository, packVariantRepository,
      supplierRepository, purchaseRecordRepository, stockLocationRepository, stockRepository, authProvider: async () => auth,
    });
  }

  /** Creates item (branch-a by default) + brand + a TIN pack variant with the given conversion_factor. */
  async function seedItemBrandPackVariant(conversionFactor: string, auth: AuthContext = owner) {
    const item = await itemRepository.create(itemInput, auth);
    const brand = await brandRepository.create({ name: `Rate Test Brand ${randomUUID()}` }, auth);
    const tin = (await admin.query<{ id: string }>(`SELECT id FROM uom_master WHERE name='TIN'`)).rows[0]!;
    const packVariant = await packVariantRepository.create(
      { item_id: item.id, brand_id: brand.id, pack_uom_id: tin.id, conversion_factor: conversionFactor }, auth,
    );
    return { item, brand, packVariant: packVariant!, tinUomId: tin.id };
  }

  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await runAuthoritativeMigrate(connectionString, schema);
    await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    await applyRuntimeGrants(admin, role, schema);
  });

  afterAll(async () => { await runtime.end(); await admin.end(); });

  describe('Supplier Master', () => {
    it('creates and edits a supplier through HTTP with atomic immutable audit snapshots', async () => {
      const app = buildTestApp(owner);
      try {
        const created = await app.inject({ method: 'POST', url: '/api/inventory/suppliers', payload: { name: 'Fresh Produce Co', contact: '0300-1112223', type: 'CREDIT' } });
        expect(created.statusCode).toBe(201);
        const supplier = created.json();
        expect(supplier.active).toBe(true);
        const edited = await app.inject({ method: 'PATCH', url: `/api/inventory/suppliers/${supplier.id}`, payload: { contact: '0300-9998887' } });
        expect(edited.statusCode).toBe(200);
        const audit = await admin.query('SELECT * FROM supplier_audit WHERE supplier_id=$1 ORDER BY occurred_at', [supplier.id]);
        expect(audit.rows).toHaveLength(2);
        expect(audit.rows[0]).toMatchObject({ action: 'CREATE', before_data: null });
        expect(audit.rows[1].before_data).toEqual(supplier);
      } finally { await app.close(); }
    });

    it('rejects duplicate names case-insensitively/trimmed under concurrency, exactly one winner', async () => {
      const variants = ['Al Barkat Traders', 'al barkat traders', ' AL BARKAT TRADERS ', 'Al BaRkAt TrAdErS'];
      const results = await Promise.allSettled(variants.map(name => supplierRepository.create({ name, type: 'CASH' }, owner)));
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(3);
      for (const r of rejected) expect(r.reason).toMatchObject({ status: 409, code: 'DUPLICATE_SUPPLIER_NAME' });
    });

    it('Owner-only deactivate: Owner may change active, Manager may not (but may still edit other fields)', async () => {
      const supplier = await supplierRepository.create({ name: 'Owner Gate Supplier', type: 'CASH' }, owner);
      const app = buildTestApp(manager);
      try {
        const deactivateAttempt = await app.inject({ method: 'PATCH', url: `/api/inventory/suppliers/${supplier.id}`, payload: { active: false } });
        expect(deactivateAttempt.statusCode).toBe(403);
        const stillActive = await admin.query('SELECT active FROM supplier_master WHERE id=$1', [supplier.id]);
        expect(stillActive.rows[0]).toMatchObject({ active: true });

        const contactEdit = await app.inject({ method: 'PATCH', url: `/api/inventory/suppliers/${supplier.id}`, payload: { contact: '0311-1231231' } });
        expect(contactEdit.statusCode).toBe(200);
      } finally { await app.close(); }

      const ownerApp = buildTestApp(owner);
      try {
        const deactivate = await ownerApp.inject({ method: 'PATCH', url: `/api/inventory/suppliers/${supplier.id}`, payload: { active: false } });
        expect(deactivate.statusCode).toBe(200);
        expect(deactivate.json()).toMatchObject({ active: false });
      } finally { await ownerApp.close(); }
    });

    it('enforces supplier type and non-blank name at the database layer', async () => {
      await expect(admin.query(`INSERT INTO supplier_master (id, name, type) VALUES ($1, 'Bad Type Co', 'BANK_TRANSFER')`, [randomUUID()])).rejects.toThrow();
      await expect(admin.query(`INSERT INTO supplier_master (id, name, type) VALUES ($1, '', 'CASH')`, [randomUUID()])).rejects.toThrow();
    });

    it('rejects delete/truncate and identity mutation on supplier_master and supplier_audit', async () => {
      const supplier = await supplierRepository.create({ name: 'Immutable Identity Supplier', type: 'CASH' }, owner);
      await expect(admin.query('DELETE FROM supplier_master WHERE id=$1', [supplier.id])).rejects.toThrow('immutable');
      await expect(admin.query('TRUNCATE supplier_master CASCADE')).rejects.toThrow('immutable');
      await expect(admin.query('UPDATE supplier_master SET id=$1 WHERE id=$2', [randomUUID(), supplier.id])).rejects.toThrow('immutable');
      await expect(admin.query('UPDATE supplier_audit SET actor_id=$1 WHERE supplier_id=$2', ['other', supplier.id])).rejects.toThrow('immutable');
      await expect(admin.query('DELETE FROM supplier_audit WHERE supplier_id=$1', [supplier.id])).rejects.toThrow('immutable');
    });
  });

  describe('Purchase Record', () => {
    it('creates through HTTP, scoped to the authorized branch item, with atomic audit -- never touches stock', async () => {
      const { item, brand, packVariant } = await seedItemBrandPackVariant('16');
      const supplier = await supplierRepository.create({ name: 'HTTP Create Supplier', type: 'CASH' }, owner);
      const app = buildTestApp(owner);
      try {
        const payload: PurchaseRecordInput = {
          supplier_id: supplier.id, item_id: item.id, brand_id: brand.id, pack_variant_id: packVariant.id,
          quantity: '5', rate: '100', purchase_date: '2026-01-15',
        };
        const created = await app.inject({ method: 'POST', url: '/api/inventory/purchases', payload });
        expect(created.statusCode).toBe(201);
        const record = created.json();
        expect(record.quantity).toBe('5.000000');
        expect(record.rate).toBe('100.000000');
        expect(record.purchase_date).toBe('2026-01-15');
        const audit = await admin.query('SELECT * FROM purchase_record_audit WHERE purchase_record_id=$1', [record.id]);
        expect(audit.rows).toHaveLength(1);
        expect(audit.rows[0]).toMatchObject({ action: 'CREATE', before_data: null });
        // S-04 added a stock ledger; a purchase record must still never post a stock movement.
        const movements = await admin.query('SELECT 1 FROM stock_movement WHERE item_id=$1', [item.id]);
        expect(movements.rows).toHaveLength(0);
      } finally { await app.close(); }
    });

    it('denies creation for an item that belongs to a different branch, without leaking existence (BLOCKER-1-style regression guard)', async () => {
      const { item, brand, packVariant } = await seedItemBrandPackVariant('1', owner); // branch-a
      const supplier = await supplierRepository.create({ name: 'Cross Branch Purchase Supplier', type: 'CASH' }, owner);
      const result = await purchaseRecordRepository.create(
        { supplier_id: supplier.id, item_id: item.id, brand_id: brand.id, pack_variant_id: packVariant.id, quantity: '1', rate: '1', purchase_date: '2026-01-01' },
        manager, // branch-b
      );
      expect(result).toBeNull();
    });

    it('rejects a pack_variant that does not belong to the given item_id/brand_id combination', async () => {
      const { item, brand, packVariant } = await seedItemBrandPackVariant('2');
      const otherItem = await itemRepository.create(itemInput, owner);
      const supplier = await supplierRepository.create({ name: 'Mismatch Supplier A', type: 'CASH' }, owner);
      // pack_variant belongs to `item`, but request claims it is for `otherItem`.
      await expect(purchaseRecordRepository.create(
        { supplier_id: supplier.id, item_id: otherItem.id, brand_id: brand.id, pack_variant_id: packVariant.id, quantity: '1', rate: '1', purchase_date: '2026-01-01' },
        owner,
      )).rejects.toMatchObject({ status: 400, code: 'INVALID_REFERENCE' });

      const otherBrand = await brandRepository.create({ name: `Mismatch Brand ${randomUUID()}` }, owner);
      await expect(purchaseRecordRepository.create(
        { supplier_id: supplier.id, item_id: item.id, brand_id: otherBrand.id, pack_variant_id: packVariant.id, quantity: '1', rate: '1', purchase_date: '2026-01-01' },
        owner,
      )).rejects.toMatchObject({ status: 400, code: 'INVALID_REFERENCE' });
    });

    it('rejects a nonexistent pack_variant_id or supplier_id', async () => {
      const { item, brand } = await seedItemBrandPackVariant('3');
      const supplier = await supplierRepository.create({ name: 'Ref Check Supplier', type: 'CASH' }, owner);
      await expect(purchaseRecordRepository.create(
        { supplier_id: supplier.id, item_id: item.id, brand_id: brand.id, pack_variant_id: randomUUID(), quantity: '1', rate: '1', purchase_date: '2026-01-01' },
        owner,
      )).rejects.toMatchObject({ status: 400, code: 'INVALID_REFERENCE' });

      const { packVariant } = await seedItemBrandPackVariant('4');
      await expect(purchaseRecordRepository.create(
        { supplier_id: randomUUID(), item_id: item.id, brand_id: brand.id, pack_variant_id: packVariant.id, quantity: '1', rate: '1', purchase_date: '2026-01-01' },
        owner,
      )).rejects.toMatchObject({ status: 400, code: 'INVALID_REFERENCE' });
    });

    it('rejects quantity <= 0 and rate <= 0 at the database layer', async () => {
      const { item, brand, packVariant } = await seedItemBrandPackVariant('5');
      const supplier = await supplierRepository.create({ name: 'Zero Value Supplier', type: 'CASH' }, owner);
      await expect(admin.query(
        `INSERT INTO purchase_record (id, supplier_id, item_id, brand_id, pack_variant_id, quantity, rate, purchase_date) VALUES ($1,$2,$3,$4,$5,0,10,'2026-01-01')`,
        [randomUUID(), supplier.id, item.id, brand.id, packVariant.id],
      )).rejects.toThrow();
      await expect(admin.query(
        `INSERT INTO purchase_record (id, supplier_id, item_id, brand_id, pack_variant_id, quantity, rate, purchase_date) VALUES ($1,$2,$3,$4,$5,10,0,'2026-01-01')`,
        [randomUUID(), supplier.id, item.id, brand.id, packVariant.id],
      )).rejects.toThrow();
    });

    it('is fully immutable once created: rejects any UPDATE, DELETE and TRUNCATE, even with the schema-owner connection', async () => {
      const { item, brand, packVariant } = await seedItemBrandPackVariant('6');
      const supplier = await supplierRepository.create({ name: 'Immutable Purchase Supplier', type: 'CASH' }, owner);
      const record = await purchaseRecordRepository.create(
        { supplier_id: supplier.id, item_id: item.id, brand_id: brand.id, pack_variant_id: packVariant.id, quantity: '1', rate: '50', purchase_date: '2026-01-01' },
        owner,
      );
      await expect(admin.query('UPDATE purchase_record SET rate=99 WHERE id=$1', [record!.id])).rejects.toThrow('immutable');
      await expect(admin.query('DELETE FROM purchase_record WHERE id=$1', [record!.id])).rejects.toThrow('immutable');
      await expect(admin.query('TRUNCATE purchase_record CASCADE')).rejects.toThrow('immutable');
      await expect(admin.query('UPDATE purchase_record_audit SET actor_id=$1 WHERE purchase_record_id=$2', ['other', record!.id])).rejects.toThrow('immutable');
    });

    it('list is branch-isolated: only ever returns the caller branch\'s purchase records', async () => {
      const { item: itemA, brand: brandA, packVariant: variantA } = await seedItemBrandPackVariant('7', owner);
      const { item: itemB, brand: brandB, packVariant: variantB } = await seedItemBrandPackVariant('8', manager);
      const supplier = await supplierRepository.create({ name: 'List Isolation Supplier', type: 'CASH' }, owner);
      const recordA = await purchaseRecordRepository.create(
        { supplier_id: supplier.id, item_id: itemA.id, brand_id: brandA.id, pack_variant_id: variantA.id, quantity: '1', rate: '11', purchase_date: '2026-01-01' }, owner,
      );
      const recordB = await purchaseRecordRepository.create(
        { supplier_id: supplier.id, item_id: itemB.id, brand_id: brandB.id, pack_variant_id: variantB.id, quantity: '1', rate: '22', purchase_date: '2026-01-01' }, manager,
      );
      expect(recordB).not.toBeNull();

      const forOwner = await purchaseRecordRepository.list(owner);
      const forManager = await purchaseRecordRepository.list(manager);
      expect(forOwner.map(r => r.id)).toContain(recordA!.id);
      expect(forOwner.map(r => r.id)).not.toContain(recordB!.id);
      expect(forManager.map(r => r.id)).toContain(recordB!.id);
      expect(forManager.map(r => r.id)).not.toContain(recordA!.id);

      const app = buildTestApp(owner);
      try {
        const response = await app.inject({ method: 'GET', url: '/api/inventory/purchases' });
        expect(response.statusCode).toBe(200);
        const listedIds = response.json<Array<{ id: string }>>().map(r => r.id);
        expect(listedIds).toContain(recordA!.id);
        expect(listedIds).not.toContain(recordB!.id);
      } finally { await app.close(); }
    });

    it('has no PATCH route registered (create-only, no correction/reversal workflow in this slice)', async () => {
      const { item, brand, packVariant } = await seedItemBrandPackVariant('9');
      const supplier = await supplierRepository.create({ name: 'No Edit Supplier', type: 'CASH' }, owner);
      const record = await purchaseRecordRepository.create(
        { supplier_id: supplier.id, item_id: item.id, brand_id: brand.id, pack_variant_id: packVariant.id, quantity: '1', rate: '1', purchase_date: '2026-01-01' }, owner,
      );
      const app = buildTestApp(owner);
      try {
        const response = await app.inject({ method: 'PATCH', url: `/api/inventory/purchases/${record!.id}`, payload: { rate: '999' } });
        expect(response.statusCode).toBe(404);
      } finally { await app.close(); }
    });

    it('Runtime privilege limits: the runtime role has no UPDATE grant on purchase_record at all', async () => {
      const { item, brand, packVariant } = await seedItemBrandPackVariant('10');
      const supplier = await supplierRepository.create({ name: 'Grant Limit Supplier', type: 'CASH' }, owner);
      const record = await purchaseRecordRepository.create(
        { supplier_id: supplier.id, item_id: item.id, brand_id: brand.id, pack_variant_id: packVariant.id, quantity: '1', rate: '1', purchase_date: '2026-01-01' }, owner,
      );
      await expect(runtime.query('UPDATE purchase_record SET rate=5 WHERE id=$1', [record!.id])).rejects.toThrow('permission denied');
      await expect(runtime.query('DELETE FROM purchase_record WHERE id=$1', [record!.id])).rejects.toThrow('permission denied');
    });

    it('MINOR-2-style proof: the shipped runtime-grants.sql alone is sufficient for a full Supplier + Purchase Record create cycle', async () => {
      const { item, brand, packVariant } = await seedItemBrandPackVariant('11');
      const supplier = await supplierRepository.create({ name: 'Grant Proof Purchase Supplier', type: 'CREDIT' }, owner);
      const record = await purchaseRecordRepository.create(
        { supplier_id: supplier.id, item_id: item.id, brand_id: brand.id, pack_variant_id: packVariant.id, quantity: '2', rate: '75', purchase_date: '2026-01-01' }, owner,
      );
      const list = await purchaseRecordRepository.list(owner);
      expect(list.map(r => r.id)).toContain(record!.id);
    });
  });

  describe('Rate Comparison', () => {
    it('degrades gracefully to nulls when zero purchase records exist for the combination', async () => {
      const { item, brand, packVariant } = await seedItemBrandPackVariant('10');
      const app = buildTestApp(owner);
      try {
        const response = await app.inject({
          method: 'GET', url: `/api/inventory/purchases/rate-comparison?item_id=${item.id}&brand_id=${brand.id}&pack_variant_id=${packVariant.id}`,
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
          records_considered: 0, current_rate: null, previous_rate: null, average_rate_last_3: null,
          current_rate_per_base_uom: null, percentage_change: null, supplier_breakdown: [],
        });
      } finally { await app.close(); }
    });

    it('with exactly one purchase record: current set, previous/percentage null, average equals the single rate', async () => {
      const { item, brand, packVariant } = await seedItemBrandPackVariant('10'); // 10 pack units per Base UOM
      const supplier = await supplierRepository.create({ name: 'Single Record Supplier', type: 'CASH' }, owner);
      await purchaseRecordRepository.create(
        { supplier_id: supplier.id, item_id: item.id, brand_id: brand.id, pack_variant_id: packVariant.id, quantity: '1', rate: '100', purchase_date: '2026-01-01' }, owner,
      );
      const result = await purchaseRecordRepository.getRateComparison({ item_id: item.id, brand_id: brand.id, pack_variant_id: packVariant.id }, owner);
      expect(result).toMatchObject({
        records_considered: 1, current_rate: '100.000000', previous_rate: null,
        average_rate_last_3: '100.000000', current_rate_per_base_uom: '10.000000', percentage_change: null,
      });
      expect(result!.supplier_breakdown).toEqual([
        { supplier_id: supplier.id, supplier_name: 'Single Record Supplier', purchase_count: 1, latest_rate: '100.000000', average_rate: '100.000000' },
      ]);
    });

    it('with two purchase records: percentage change and average of both are computed correctly', async () => {
      const { item, brand, packVariant } = await seedItemBrandPackVariant('4');
      const supplier = await supplierRepository.create({ name: 'Two Record Supplier', type: 'CASH' }, owner);
      await purchaseRecordRepository.create(
        { supplier_id: supplier.id, item_id: item.id, brand_id: brand.id, pack_variant_id: packVariant.id, quantity: '1', rate: '40', purchase_date: '2026-01-01' }, owner,
      );
      await purchaseRecordRepository.create(
        { supplier_id: supplier.id, item_id: item.id, brand_id: brand.id, pack_variant_id: packVariant.id, quantity: '1', rate: '50', purchase_date: '2026-01-10' }, owner,
      );
      const result = await purchaseRecordRepository.getRateComparison({ item_id: item.id, brand_id: brand.id, pack_variant_id: packVariant.id }, owner);
      // Most recent (2026-01-10, rate 50) is current; previous is 2026-01-01, rate 40.
      expect(result).toMatchObject({
        records_considered: 2, current_rate: '50.000000', previous_rate: '40.000000',
        average_rate_last_3: '45.000000', current_rate_per_base_uom: '12.500000', percentage_change: '25.000000',
      });
    });

    it('with four purchase records: only the most recent three feed current/previous/average, correctly ordered by purchase_date', async () => {
      const { item, brand, packVariant } = await seedItemBrandPackVariant('1');
      const supplier = await supplierRepository.create({ name: 'Four Record Supplier', type: 'CASH' }, owner);
      const rates = [
        { rate: '10', purchase_date: '2026-01-01' },
        { rate: '20', purchase_date: '2026-01-02' },
        { rate: '30', purchase_date: '2026-01-03' },
        { rate: '40', purchase_date: '2026-01-04' }, // most recent
      ];
      for (const r of rates) {
        await purchaseRecordRepository.create(
          { supplier_id: supplier.id, item_id: item.id, brand_id: brand.id, pack_variant_id: packVariant.id, quantity: '1', rate: r.rate, purchase_date: r.purchase_date }, owner,
        );
      }
      const result = await purchaseRecordRepository.getRateComparison({ item_id: item.id, brand_id: brand.id, pack_variant_id: packVariant.id }, owner);
      expect(result).toMatchObject({
        records_considered: 3, current_rate: '40.000000', previous_rate: '30.000000',
        average_rate_last_3: '30.000000', // (40 + 30 + 20) / 3
        percentage_change: '33.333333', // (40 - 30) / 30 * 100
      });
    });

    it('groups the full purchase history by supplier for the per-supplier breakdown, independent of the last-3 window', async () => {
      const { item, brand, packVariant } = await seedItemBrandPackVariant('1');
      const supplierX = await supplierRepository.create({ name: 'Breakdown Supplier X', type: 'CASH' }, owner);
      const supplierY = await supplierRepository.create({ name: 'Breakdown Supplier Y', type: 'CREDIT' }, owner);
      await purchaseRecordRepository.create(
        { supplier_id: supplierX.id, item_id: item.id, brand_id: brand.id, pack_variant_id: packVariant.id, quantity: '1', rate: '10', purchase_date: '2026-01-01' }, owner,
      );
      await purchaseRecordRepository.create(
        { supplier_id: supplierX.id, item_id: item.id, brand_id: brand.id, pack_variant_id: packVariant.id, quantity: '1', rate: '20', purchase_date: '2026-01-05' }, owner,
      );
      await purchaseRecordRepository.create(
        { supplier_id: supplierY.id, item_id: item.id, brand_id: brand.id, pack_variant_id: packVariant.id, quantity: '1', rate: '15', purchase_date: '2026-01-03' }, owner,
      );
      const result = await purchaseRecordRepository.getRateComparison({ item_id: item.id, brand_id: brand.id, pack_variant_id: packVariant.id }, owner);
      const breakdown = result!.supplier_breakdown.sort((a, b) => a.supplier_name.localeCompare(b.supplier_name));
      expect(breakdown).toEqual([
        { supplier_id: supplierX.id, supplier_name: 'Breakdown Supplier X', purchase_count: 2, latest_rate: '20.000000', average_rate: '15.000000' },
        { supplier_id: supplierY.id, supplier_name: 'Breakdown Supplier Y', purchase_count: 1, latest_rate: '15.000000', average_rate: '15.000000' },
      ]);
    });

    it('denies a cross-branch item, without leaking existence', async () => {
      const { item, brand, packVariant } = await seedItemBrandPackVariant('1', manager); // branch-b
      const result = await purchaseRecordRepository.getRateComparison({ item_id: item.id, brand_id: brand.id, pack_variant_id: packVariant.id }, owner); // branch-a
      expect(result).toBeNull();
      const app = buildTestApp(owner);
      try {
        const response = await app.inject({
          method: 'GET', url: `/api/inventory/purchases/rate-comparison?item_id=${item.id}&brand_id=${brand.id}&pack_variant_id=${packVariant.id}`,
        });
        expect(response.statusCode).toBe(404);
      } finally { await app.close(); }
    });

    it('rejects a pack_variant/item/brand combination that does not actually match', async () => {
      const { brand, packVariant } = await seedItemBrandPackVariant('1');
      const otherItem = await itemRepository.create(itemInput, owner);
      await expect(purchaseRecordRepository.getRateComparison(
        { item_id: otherItem.id, brand_id: brand.id, pack_variant_id: packVariant.id }, owner,
      )).rejects.toMatchObject({ status: 400, code: 'INVALID_REFERENCE' });
    });
  });
});
