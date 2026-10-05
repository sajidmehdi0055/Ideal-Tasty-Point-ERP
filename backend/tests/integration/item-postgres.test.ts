import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { AuthContext } from '../../src/auth/context.js';
import type { Item, ItemInput } from '../../src/inventory/domain/item.js';
import { PgItemRepository } from '../../src/inventory/persistence/pg-item-repository.js';
import { PgUomRepository } from '../../src/inventory/persistence/pg-uom-repository.js';
import { PgBrandRepository } from '../../src/inventory/persistence/pg-brand-repository.js';
import { PgPackVariantRepository } from '../../src/inventory/persistence/pg-pack-variant-repository.js';
import { PgSupplierRepository } from '../../src/inventory/persistence/pg-supplier-repository.js';
import { PgPurchaseRecordRepository } from '../../src/inventory/persistence/pg-purchase-record-repository.js';
import { PgStockLocationRepository } from '../../src/inventory/persistence/pg-stock-location-repository.js';
import { PgStockRepository } from '../../src/inventory/persistence/pg-stock-repository.js';
import { PgGoodsReceiptRepository } from '../../src/inventory/persistence/pg-goods-receipt-repository.js';
import { PgPurchaseOrderRepository } from '../../src/inventory/persistence/pg-purchase-order-repository.js';
import { PgStockTransferRepository } from '../../src/inventory/persistence/pg-stock-transfer-repository.js';
import { applyRuntimeGrants } from './helpers/runtime-grants.js';
import { runAuthoritativeMigrate } from './helpers/migrate-cli.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('TEST_DATABASE_URL is required for real PostgreSQL integration tests');
const suffix = randomUUID().replaceAll('-', '');
const schema = `inv_s01_test_${suffix}`;
const role = `inv_s01_app_${suffix}`;
const admin = new Pool({ connectionString, options: `-c search_path=${schema}` });
const runtime = new Pool({ connectionString, options: `-c search_path=${schema} -c role=${role}`, max: 12 });
const repository = new PgItemRepository(runtime);
const uomRepository = new PgUomRepository(runtime);
const brandRepository = new PgBrandRepository(runtime);
const packVariantRepository = new PgPackVariantRepository(runtime);
const supplierRepository = new PgSupplierRepository(runtime);
const purchaseRecordRepository = new PgPurchaseRecordRepository(runtime);
const stockLocationRepository = new PgStockLocationRepository(runtime);
const stockRepository = new PgStockRepository(runtime);
const owner: AuthContext = { userId: 'owner-a', role: 'OWNER', branchId: 'branch-a' };
const manager: AuthContext = { userId: 'manager-b', role: 'MANAGER', branchId: 'branch-b' };
const input: ItemInput = { item_name: 'Rice', primary_item_type: 'RAW_MATERIAL', base_uom: 'kg', brand: 'Generic / No Brand' };
const KG_UOM_ID = 'a0000000-0000-4000-8000-000000000001';

beforeAll(async () => {
  // Unique NEW schema/NOLOGIN role only. Never truncate or drop pre-existing data.
  await admin.query(`CREATE SCHEMA ${schema}`);
  // Applies via the real node-pg-migrate CLI binary, the same authoritative
  // command `npm run migrate` runs (see tests/integration/helpers/migrate-cli.ts).
  await runAuthoritativeMigrate(connectionString, schema);
  await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
  // Single authoritative grant source (MINOR 2): executes the actual shipped
  // scripts/runtime-grants.sql rather than a hand-duplicated grant list, so
  // tests and deployment cannot silently drift apart.
  await applyRuntimeGrants(admin, role, schema);
});

afterAll(async () => { await runtime.end(); await admin.end(); });

function buildTestApp(auth: AuthContext) {
  return buildApp({
    repository, uomRepository, brandRepository, packVariantRepository,
    supplierRepository, purchaseRecordRepository, stockLocationRepository, stockRepository, goodsReceiptRepository: new PgGoodsReceiptRepository(runtime), purchaseOrderRepository: new PgPurchaseOrderRepository(runtime), stockTransferRepository: new PgStockTransferRepository(runtime), authProvider: async () => auth,
  });
}

describe('S-01 real PostgreSQL migration and persistence', () => {
  it('applies all migrations via the real authoritative command, and re-running is a no-op', async () => {
    const appliedNames = (await admin.query('SELECT name FROM pgmigrations ORDER BY name')).rows.map(r => r.name);
    expect(appliedNames).toEqual([
      '202609170001_inventory_s01',
      '202609180001_inventory_s02_uom_brand',
      '202609180002_inventory_s02_item_base_uom_pack_variant',
      '202609250001_inventory_s03_purchasing_supplier',
      '202609260001_inventory_s04_locations_opening_stock',
      '202609270001_inventory_s05_goods_receiving',
      '202609270002_inventory_s06_purchase_order',
      '202609270003_inventory_s07_stock_transfer',
      '202609270004_ai_s01_audit_log',
    ]);
    // Re-running the same authoritative command against an up-to-date schema
    // must be a genuine no-op: same migrations recorded, nothing duplicated.
    await runAuthoritativeMigrate(connectionString, schema);
    const afterRerun = (await admin.query('SELECT name FROM pgmigrations ORDER BY name')).rows.map(r => r.name);
    expect(afterRerun).toEqual(appliedNames);
  });

  it('creates and edits through HTTP with atomic immutable audit snapshots', async () => {
    const app = buildTestApp(owner);
    try {
      const created = await app.inject({ method: 'POST', url: '/api/inventory/items', payload: input });
      expect(created.statusCode).toBe(201);
      const item = created.json<Item>();
      expect(item).toMatchObject({ ...input, base_uom: 'KG', branch_id: owner.branchId, active: true });
      expect(item.item_code).toMatch(/^ITM-\d{6,}$/);
      const edited = await app.inject({ method: 'PATCH', url: `/api/inventory/items/${item.id}`, payload: { brand: 'Approved Brand' } });
      expect(edited.statusCode).toBe(200);
      const audit = await admin.query('SELECT * FROM inventory_audit WHERE item_id=$1 ORDER BY occurred_at', [item.id]);
      expect(audit.rows).toHaveLength(2);
      expect(audit.rows[0]).toMatchObject({ action: 'CREATE', before_data: null, actor_id: owner.userId, actor_role: 'OWNER', branch_id: owner.branchId });
      expect(audit.rows[0].after_data).toEqual(item);
      expect(audit.rows[1].before_data).toEqual(item);
      expect(audit.rows[1].after_data).toEqual(edited.json());
    } finally { await app.close(); }
  });

  it('creates concurrently across branches with globally unique sequential codes', async () => {
    const items = await Promise.all(Array.from({ length: 24 }, (_, i) => repository.create(input, i % 2 ? owner : manager)));
    expect(new Set(items.map(item => item.item_code)).size).toBe(24);
    expect(new Set(items.map(item => item.id)).size).toBe(24);
    for (const item of items) expect(item.item_code).toMatch(/^ITM-\d{6,}$/);
    expect(new Set(items.map(item => item.branch_id))).toEqual(new Set(['branch-a', 'branch-b']));
  });

  it('locks concurrent updates without losing separately changed fields or audit history', async () => {
    const item = await repository.create(input, owner);
    await Promise.all([repository.update(item.id, { item_name: 'Changed rice' }, owner), repository.update(item.id, { brand: 'Changed brand' }, owner)]);
    const result = await admin.query('SELECT * FROM item_master WHERE id=$1', [item.id]);
    expect(result.rows[0]).toMatchObject({ item_name: 'Changed rice', brand: 'Changed brand' });
    const audit = await admin.query('SELECT * FROM inventory_audit WHERE item_id=$1 ORDER BY occurred_at', [item.id]);
    expect(audit.rows).toHaveLength(3);
    expect(audit.rows[2].before_data).toEqual(audit.rows[1].after_data);
  });

  it('does not update another branch or append an audit for the rejected lookup', async () => {
    const item = await repository.create(input, owner);
    expect(await repository.update(item.id, { item_name: 'Cross branch' }, manager)).toBeNull();
    const audit = await admin.query('SELECT count(*)::int AS n FROM inventory_audit WHERE item_id=$1', [item.id]);
    expect(audit.rows[0].n).toBe(1);
  });

  it('rejects an unresolvable base_uom without persisting an item', async () => {
    await expect(repository.create({ ...input, base_uom: 'Not A Real Unit' }, owner)).rejects.toMatchObject({ status: 400, code: 'INVALID_BASE_UOM' });
    await expect(repository.update((await repository.create(input, owner)).id, { base_uom: 'Not A Real Unit' }, owner))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_BASE_UOM' });
  });

  it('rejects manual code insertion and identity/branch/code edits in PostgreSQL', async () => {
    const item = await repository.create(input, owner);
    await expect(admin.query(`INSERT INTO item_master (id,item_code,branch_id,item_name,primary_item_type,base_uom_id,brand)
      VALUES ($1,'ITM-999999','branch-a','Rice','RAW_MATERIAL',$2,'Generic / No Brand')`, [randomUUID(), KG_UOM_ID])).rejects.toThrow('system generated');
    for (const [column, value] of [['item_code', 'ITM-999999'], ['branch_id', 'other'], ['id', randomUUID()]]) {
      await expect(admin.query(`UPDATE item_master SET ${column}=$1 WHERE id=$2`, [value, item.id])).rejects.toThrow('immutable');
    }
    const constraint = await admin.query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid='item_master'::regclass AND contype='u'`);
    expect(constraint.rows.some(row => row.definition === 'UNIQUE (item_code)')).toBe(true);
  });

  it('enforces required values and exactly one approved primary type in the database', async () => {
    for (const [name, type, brand, branch] of [
      ['', 'RAW_MATERIAL', 'Generic / No Brand', 'branch-a'],
      ['Rice', 'INVALID', 'Generic / No Brand', 'branch-a'],
      ['Rice', 'RAW_MATERIAL,WIP_SEMI_FINISHED', 'Generic / No Brand', 'branch-a'],
      ['Rice', 'RAW_MATERIAL', '', 'branch-a'],
      ['Rice', 'RAW_MATERIAL', 'Generic / No Brand', ''],
      [null, 'RAW_MATERIAL', 'Generic / No Brand', 'branch-a'],
    ]) {
      await expect(admin.query(`INSERT INTO item_master (id,item_name,primary_item_type,base_uom_id,brand,branch_id)
        VALUES ($1,$2,$3,$4,$5,$6)`, [randomUUID(), name, type, KG_UOM_ID, brand, branch])).rejects.toThrow();
    }
  });

  it('enforces base_uom_id NOT NULL and FK integrity in the database', async () => {
    await expect(admin.query(`INSERT INTO item_master (id,item_name,primary_item_type,base_uom_id,brand,branch_id)
      VALUES ($1,'Rice','RAW_MATERIAL',NULL,'Generic / No Brand','branch-a')`, [randomUUID()])).rejects.toThrow();
    await expect(admin.query(`INSERT INTO item_master (id,item_name,primary_item_type,base_uom_id,brand,branch_id)
      VALUES ($1,'Rice','RAW_MATERIAL',$2,'Generic / No Brand','branch-a')`, [randomUUID(), randomUUID()])).rejects.toThrow();
  });

  it('rejects audit update, delete and truncate even with the schema-owner connection', async () => {
    const item = await repository.create(input, owner);
    await expect(admin.query('UPDATE inventory_audit SET actor_id=$1 WHERE item_id=$2', ['other', item.id])).rejects.toThrow('immutable');
    await expect(admin.query('DELETE FROM inventory_audit WHERE item_id=$1', [item.id])).rejects.toThrow('immutable');
    await expect(admin.query('TRUNCATE inventory_audit')).rejects.toThrow('immutable');
    await expect(admin.query('DELETE FROM item_master WHERE id=$1', [item.id])).rejects.toThrow('immutable');
    await expect(admin.query('TRUNCATE item_master CASCADE')).rejects.toThrow('immutable');
  });

  it('limits runtime privileges including sequence reset and schema alteration', async () => {
    await expect(runtime.query("SELECT setval('item_code_seq', 1, false)")).rejects.toThrow('permission denied');
    await expect(runtime.query('ALTER TABLE item_master DISABLE TRIGGER ALL')).rejects.toThrow();
    await expect(runtime.query('TRUNCATE inventory_audit')).rejects.toThrow('permission denied');
    await expect(runtime.query('DELETE FROM item_master')).rejects.toThrow('permission denied');
  });

  it('rolls back create and edit if audit insertion fails, without recycling the consumed code', async () => {
    const item = await repository.create(input, owner);
    const original = await admin.query('SELECT * FROM item_master WHERE id=$1', [item.id]);
    const count = await admin.query('SELECT count(*)::int AS n FROM item_master');
    await admin.query(`REVOKE INSERT ON inventory_audit FROM ${role}`);
    try {
      await expect(repository.create(input, owner)).rejects.toThrow('permission denied');
      await expect(repository.update(item.id, { item_name: 'Must roll back' }, owner)).rejects.toThrow('permission denied');
    } finally { await admin.query(`GRANT INSERT ON inventory_audit TO ${role}`); }
    expect((await admin.query('SELECT * FROM item_master WHERE id=$1', [item.id])).rows).toEqual(original.rows);
    expect((await admin.query('SELECT count(*)::int AS n FROM item_master')).rows).toEqual(count.rows);
    const next = await repository.create(input, owner);
    expect(BigInt(next.item_code.slice(4))).toBeGreaterThan(BigInt(item.item_code.slice(4)) + 1n);
  });

  it('grows beyond six digits without truncation in this isolated test sequence', async () => {
    await admin.query("SELECT setval('item_code_seq', 999999, true)");
    const item = await repository.create(input, manager);
    expect(item.item_code).toBe('ITM-1000000');
  });
});

describe('INV-ITEM-LIST-001 item list/search and get-by-id (real PostgreSQL)', () => {
  // Own branches so items created by the other tests in this schema never show up here.
  const listOwner: AuthContext = { userId: 'owner-list', role: 'OWNER', branchId: `list-a-${suffix}` };
  const listManager: AuthContext = { userId: 'manager-list', role: 'MANAGER', branchId: `list-b-${suffix}` };
  const create = (item_name: string, auth: AuthContext) => repository.create({ ...input, item_name }, auth);
  async function getList(auth: AuthContext, query = '') {
    const app = buildTestApp(auth);
    try {
      const response = await app.inject({ method: 'GET', url: `/api/inventory/items${query}` });
      expect(response.statusCode).toBe(200);
      return { items: response.json<Item[]>(), truncated: response.headers['x-result-truncated'] };
    } finally { await app.close(); }
  }
  const names = (items: Item[]) => items.map(item => item.item_name);

  let flour: Item, flourTwin: Item, sugar: Item, percent: Item, underscore: Item, backslash: Item, inactive: Item, otherBranch: Item;
  beforeAll(async () => {
    flour = await create('flour', listOwner);
    flourTwin = await create('flour', listOwner);
    sugar = await create('sugar', listOwner);
    percent = await create('ghee 50% off', listOwner);
    underscore = await create('oil_tin', listOwner);
    backslash = await create('rice\\basmati', listOwner);
    inactive = await create('salt', listOwner);
    await admin.query('UPDATE item_master SET active = false WHERE id = $1', [inactive.id]);
    inactive = { ...inactive, active: false };
    otherBranch = await create('flour', listManager);
  });

  it('lists only the caller branch, ordered by item_name then item_code, in the Item shape', async () => {
    const { items, truncated } = await getList(listOwner);
    expect(truncated).toBeUndefined();
    expect(items.every(item => item.branch_id === listOwner.branchId)).toBe(true);
    expect(items.map(item => item.id)).not.toContain(otherBranch.id);
    expect(names(items)).toEqual(['flour', 'flour', 'ghee 50% off', 'oil_tin', 'rice\\basmati', 'salt', 'sugar']);
    const [first, second] = [flour, flourTwin].sort((a, b) => a.item_code.localeCompare(b.item_code));
    expect(items.slice(0, 2).map(item => item.id)).toEqual([first?.id, second?.id]);
    const listedFlour = items.find(item => item.id === flour.id);
    expect(listedFlour).toEqual(flour);
    expect(Object.keys(listedFlour ?? {}).sort()).toEqual(
      ['active', 'base_uom', 'branch_id', 'brand', 'created_at', 'id', 'item_code', 'item_name', 'primary_item_type', 'updated_at']);
    const other = await getList(listManager);
    expect(other.items.map(item => item.id)).toEqual([otherBranch.id]);
  });

  it('searches case-insensitively by name and by item code', async () => {
    expect(names((await getList(listOwner, '?search=FLOUR')).items)).toEqual(['flour', 'flour']);
    expect(names((await getList(listOwner, '?search=uGa')).items)).toEqual(['sugar']);
    expect((await getList(listOwner, `?search=${sugar.item_code.toLowerCase()}`)).items.map(item => item.id)).toEqual([sugar.id]);
    // Code search is still branch-scoped: another branch's code finds nothing.
    expect((await getList(listOwner, `?search=${otherBranch.item_code}`)).items).toEqual([]);
  });

  it('treats %, _ and backslash in the search term literally', async () => {
    expect((await getList(listOwner, '?search=%25')).items.map(item => item.id)).toEqual([percent.id]);
    expect((await getList(listOwner, '?search=_')).items.map(item => item.id)).toEqual([underscore.id]);
    expect((await getList(listOwner, '?search=s_lt')).items).toEqual([]); // would match "salt" if _ were a wildcard
    expect((await getList(listOwner, '?search=%5C')).items.map(item => item.id)).toEqual([backslash.id]);
    expect((await getList(listOwner, '?search=f%25r')).items).toEqual([]); // would match "flour" if % were a wildcard
  });

  it('filters by active', async () => {
    expect((await getList(listOwner, '?active=false')).items).toEqual([inactive]);
    const active = (await getList(listOwner, '?active=true')).items;
    expect(active).toHaveLength(6);
    expect(active.every(item => item.active)).toBe(true);
  });

  it('caps the list at limit and signals truncation only when more items matched', async () => {
    const capped = await getList(listOwner, '?limit=2');
    expect(names(capped.items)).toEqual(['flour', 'flour']);
    expect(capped.truncated).toBe('true');
    const exact = await getList(listOwner, '?limit=7');
    expect(exact.items).toHaveLength(7);
    expect(exact.truncated).toBeUndefined();
    const combined = await getList(listOwner, '?search=flour&active=true&limit=1');
    expect(combined.items).toHaveLength(1);
    expect(combined.truncated).toBe('true');
  });

  it('gets one item by id within the branch and returns 404 ITEM_NOT_FOUND otherwise', async () => {
    const ownerApp = buildTestApp(listOwner);
    try {
      const found = await ownerApp.inject({ method: 'GET', url: `/api/inventory/items/${inactive.id}` });
      expect(found.statusCode).toBe(200);
      expect(found.json()).toEqual(inactive);
      for (const missingId of [otherBranch.id, randomUUID()]) {
        const missing = await ownerApp.inject({ method: 'GET', url: `/api/inventory/items/${missingId}` });
        expect(missing.statusCode).toBe(404);
        expect(missing.json()).toMatchObject({ error: 'ITEM_NOT_FOUND' });
      }
    } finally { await ownerApp.close(); }
    expect(await repository.get(flour.id, listManager)).toBeNull();
    expect(await repository.get(otherBranch.id, listManager)).toEqual(otherBranch);
  });
});
