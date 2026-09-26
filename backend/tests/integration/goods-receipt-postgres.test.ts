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
import { PgGoodsReceiptRepository } from '../../src/inventory/persistence/pg-goods-receipt-repository.js';
import { applyRuntimeGrants } from './helpers/runtime-grants.js';
import { runAuthoritativeMigrate } from './helpers/migrate-cli.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('TEST_DATABASE_URL is required for real PostgreSQL integration tests');

describe('S-05 Goods Receiving (real PostgreSQL)', () => {
  const suffix = randomUUID().replaceAll('-', '');
  const schema = `inv_s05_test_${suffix}`;
  const role = `inv_s05_app_${suffix}`;
  const admin = new Pool({ connectionString, options: `-c search_path=${schema}` });
  const runtime = new Pool({ connectionString, options: `-c search_path=${schema} -c role=${role}`, max: 12 });
  const items = new PgItemRepository(runtime);
  const brands = new PgBrandRepository(runtime);
  const packs = new PgPackVariantRepository(runtime);
  const suppliers = new PgSupplierRepository(runtime);
  const purchases = new PgPurchaseRecordRepository(runtime);
  const locations = new PgStockLocationRepository(runtime);
  const stock = new PgStockRepository(runtime);
  const receipts = new PgGoodsReceiptRepository(runtime);
  const owner: AuthContext = { userId: 'owner-a', role: 'OWNER', branchId: 'branch-a' };
  const managerA: AuthContext = { userId: 'manager-a', role: 'MANAGER', branchId: 'branch-a' };
  const managerB: AuthContext = { userId: 'manager-b', role: 'MANAGER', branchId: 'branch-b' };
  const uniq = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;
  let tinId = '', packetId = '';

  function buildTestApp(auth: AuthContext) {
    return buildApp({
      repository: items, uomRepository: new PgUomRepository(runtime), brandRepository: brands, packVariantRepository: packs,
      supplierRepository: suppliers, purchaseRecordRepository: purchases, stockLocationRepository: locations,
      stockRepository: stock, goodsReceiptRepository: receipts, authProvider: async () => auth,
    });
  }
  /** Item (base KG) + brand + pack variant with the given factor, in auth's branch. */
  async function product(factor = '16', auth: AuthContext = owner, packUom = () => tinId) {
    const item = await items.create({ item_name: uniq('Ghee'), primary_item_type: 'RAW_MATERIAL', base_uom: 'kg', brand: 'Generic / No Brand' }, auth);
    const brand = await brands.create({ name: uniq('Brand') }, auth);
    const pack = (await packs.create({ item_id: item.id, brand_id: brand.id, pack_uom_id: packUom(), conversion_factor: factor }, auth))!;
    return { item, brand, pack };
  }
  const supplier = (auth: AuthContext = owner) => suppliers.create({ name: uniq('Supplier'), type: 'CREDIT' }, auth);
  const store = (auth: AuthContext = owner) => locations.create({ name: uniq('Store'), location_type: 'STORE' }, auth);
  const lineOf = (p: Awaited<ReturnType<typeof product>>, pack_quantity = '1', rate = '100') =>
    ({ item_id: p.item.id, brand_id: p.brand.id, pack_variant_id: p.pack.id, pack_quantity, rate });
  async function businessDate(offsetDays: number) {
    const r = await admin.query<{ d: string }>(`SELECT to_char((now() AT TIME ZONE 'Asia/Karachi')::date + $1::int, 'YYYY-MM-DD') AS d`, [offsetDays]);
    return r.rows[0]!.d;
  }
  async function balance(itemId: string, locationId: string, auth: AuthContext = owner) {
    return (await stock.listBalances({ item_id: itemId, location_id: locationId }, auth))[0]?.quantity;
  }
  const count = async (table: string) => Number((await admin.query(`SELECT count(*) FROM ${table}`)).rows[0].count);

  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await runAuthoritativeMigrate(connectionString, schema);
    await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    await applyRuntimeGrants(admin, role, schema);
    tinId = (await admin.query(`SELECT id FROM uom_master WHERE name='TIN'`)).rows[0].id;
    packetId = (await admin.query(`SELECT id FROM uom_master WHERE name='PACKET'`)).rows[0].id;
  });
  afterAll(async () => { await runtime.end(); await admin.end(); });

  it('creates a multi-line receipt through HTTP: purchase records, RECEIPT movements, balances and audits in one go', async () => {
    const ghee = await product('16');
    const salt = await product('0.5', owner, () => packetId);
    const sup = await supplier(); const loc = await store();
    const date = await businessDate(-2);
    const app = buildTestApp(managerA);
    try {
      const res = await app.inject({ method: 'POST', url: '/api/inventory/receipts', payload: {
        supplier_id: sup.id, location_id: loc.id, receipt_date: date, supplier_bill_no: 'BILL-1001',
        lines: [lineOf(ghee, '2.5', '1500'), lineOf(salt, '3', '40')],
      } });
      expect(res.statusCode).toBe(201);
      const receipt = res.json();
      expect(receipt).toMatchObject({ supplier_id: sup.id, location_id: loc.id, receipt_date: date, supplier_bill_no: 'BILL-1001' });
      expect(receipt.lines).toHaveLength(2);
      expect(receipt.lines[0]).toMatchObject({ line_no: 1, pack_quantity: '2.500000', conversion_factor: '16.000000', base_quantity: '40.000000', rate: '1500.000000' });
      expect(receipt.lines[1]).toMatchObject({ line_no: 2, base_quantity: '1.500000' });
      const pr = await admin.query('SELECT * FROM purchase_record WHERE id=$1', [receipt.lines[0].purchase_record_id]);
      expect(pr.rows[0]).toMatchObject({ supplier_id: sup.id, item_id: ghee.item.id, quantity: '2.500000', rate: '1500.000000' });
      expect((await admin.query(`SELECT to_char(purchase_date,'YYYY-MM-DD') d FROM purchase_record WHERE id=$1`, [receipt.lines[0].purchase_record_id])).rows[0].d).toBe(date);
      const mv = await admin.query('SELECT * FROM stock_movement WHERE id=$1', [receipt.lines[0].stock_movement_id]);
      expect(mv.rows[0]).toMatchObject({ movement_type: 'RECEIPT', quantity_delta: '40.000000', reason: null, location_id: loc.id });
      expect(await balance(ghee.item.id, loc.id)).toBe('40.000000');
      expect(await balance(salt.item.id, loc.id)).toBe('1.500000');
      const audit = await admin.query('SELECT * FROM goods_receipt_audit WHERE goods_receipt_id=$1', [receipt.id]);
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]).toMatchObject({ action: 'CREATE', before_data: null, after_data: receipt, actor_role: 'MANAGER', branch_id: 'branch-a' });
      expect((await admin.query('SELECT 1 FROM purchase_record_audit WHERE purchase_record_id = ANY($1)', [receipt.lines.map((l: { purchase_record_id: string }) => l.purchase_record_id)])).rows).toHaveLength(2);
      expect((await admin.query('SELECT 1 FROM stock_movement_audit WHERE stock_movement_id = ANY($1)', [receipt.lines.map((l: { stock_movement_id: string }) => l.stock_movement_id)])).rows).toHaveLength(2);
      // Rate history picks the receipt up (S-03 Rate Comparison).
      const rc = await purchases.getRateComparison({ item_id: ghee.item.id, brand_id: ghee.brand.id, pack_variant_id: ghee.pack.id }, owner);
      expect(rc).toMatchObject({ current_rate: '1500.000000', records_considered: 1 });
      // Reads: detail and list
      expect((await app.inject({ method: 'GET', url: `/api/inventory/receipts/${receipt.id}` })).json()).toEqual(receipt);
      const list = (await app.inject({ method: 'GET', url: '/api/inventory/receipts' })).json();
      expect(list.find((r: { id: string }) => r.id === receipt.id)).toMatchObject({ supplier_name: sup.name, location_name: loc.name, line_count: 2 });
    } finally { await app.close(); }
  });

  it('lets a receipt be the first stock; opening is then refused; corrections use adjustments (O-04, O-07)', async () => {
    const p = await product(); const sup = await supplier(); const loc = await store();
    await receipts.create({ supplier_id: sup.id, location_id: loc.id, receipt_date: await businessDate(0), lines: [lineOf(p, '1')] }, owner);
    await expect(stock.createOpening({ item_id: p.item.id, location_id: loc.id, quantity: '5' }, owner))
      .rejects.toMatchObject({ status: 409, code: 'STOCK_HISTORY_EXISTS' });
    await stock.createAdjustment({ item_id: p.item.id, location_id: loc.id, quantity_delta: '-4', reason: 'Received 1 tin short of the bill' }, owner);
    expect(await balance(p.item.id, loc.id)).toBe('12.000000');
    await expect(stock.createAdjustment({ item_id: p.item.id, location_id: loc.id, quantity_delta: '-12.000001', reason: 'x' }, owner))
      .rejects.toMatchObject({ status: 409, code: 'NEGATIVE_BALANCE' });
    // Database backstop: an OPENING after other entries is rejected even for the schema owner.
    await expect(admin.query(
      `INSERT INTO stock_movement (id, item_id, location_id, movement_type, quantity_delta) VALUES ($1, $2, $3, 'OPENING', 1)`,
      [randomUUID(), p.item.id, loc.id],
    )).rejects.toThrow(/first entry/);
  });

  it('enforces receipt date rules on the Asia/Karachi business date: not future, not before opening', async () => {
    const p = await product(); const sup = await supplier(); const loc = await store();
    await stock.createOpening({ item_id: p.item.id, location_id: loc.id, quantity: '2' }, owner);
    const base = { supplier_id: sup.id, location_id: loc.id, lines: [lineOf(p)] };
    await expect(receipts.create({ ...base, receipt_date: await businessDate(-1) }, owner)).rejects.toMatchObject({ status: 409, code: 'RECEIPT_BEFORE_OPENING' });
    await expect(receipts.create({ ...base, receipt_date: await businessDate(1) }, owner)).rejects.toMatchObject({ status: 400, code: 'INVALID_RECEIPT_DATE' });
    await expect(receipts.create({ ...base, receipt_date: await businessDate(0) }, owner)).resolves.toBeTruthy();
    expect(await balance(p.item.id, loc.id)).toBe('18.000000');
    // Backdating without an opening entry is allowed (owner decision O-03).
    const q = await product(); const loc2 = await store();
    await expect(receipts.create({ supplier_id: sup.id, location_id: loc2.id, receipt_date: '2025-01-15', lines: [lineOf(q)] }, owner)).resolves.toBeTruthy();
  });

  it('rejects bad references and inactive masters, writing nothing', async () => {
    const p = await product(); const other = await product(); const sup = await supplier(); const loc = await store();
    const date = await businessDate(0);
    const before = [await count('goods_receipt'), await count('purchase_record'), await count('stock_movement')];
    await expect(receipts.create({ supplier_id: sup.id, location_id: loc.id, receipt_date: date, lines: [{ ...lineOf(p), pack_variant_id: other.pack.id }] }, owner))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_REFERENCE' });
    await expect(receipts.create({ supplier_id: randomUUID(), location_id: loc.id, receipt_date: date, lines: [lineOf(p)] }, owner))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_REFERENCE' });
    const tiny = await product('0.1');
    await expect(receipts.create({ supplier_id: sup.id, location_id: loc.id, receipt_date: date, lines: [lineOf(tiny, '0.000001')] }, owner))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_QUANTITY' });
    // Atomic: a valid first line is not kept when the second line fails.
    await expect(receipts.create({ supplier_id: sup.id, location_id: loc.id, receipt_date: date, lines: [lineOf(p), { ...lineOf(other), brand_id: p.brand.id }] }, owner))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_REFERENCE' });
    expect([await count('goods_receipt'), await count('purchase_record'), await count('stock_movement')]).toEqual(before);

    const inactiveSup = await supplier(); await suppliers.update(inactiveSup.id, { active: false }, owner);
    await expect(receipts.create({ supplier_id: inactiveSup.id, location_id: loc.id, receipt_date: date, lines: [lineOf(p)] }, owner))
      .rejects.toMatchObject({ status: 409, code: 'SUPPLIER_INACTIVE' });
    const closedLoc = await store(); await locations.update(closedLoc.id, { active: false }, owner);
    await expect(receipts.create({ supplier_id: sup.id, location_id: closedLoc.id, receipt_date: date, lines: [lineOf(p)] }, owner))
      .rejects.toMatchObject({ status: 409, code: 'LOCATION_INACTIVE' });
    const retired = await product(); await packs.update(retired.pack.id, { active: false }, owner);
    await expect(receipts.create({ supplier_id: sup.id, location_id: loc.id, receipt_date: date, lines: [lineOf(retired)] }, owner))
      .rejects.toMatchObject({ status: 409, code: 'PACK_VARIANT_INACTIVE' });
  });

  it('isolates branches on write and read (404 without leaking, nothing written)', async () => {
    const pA = await product('16', owner); const pB = await product('16', managerB);
    const sup = await supplier(); const locA = await store(owner); const locB = await store(managerB);
    const date = await businessDate(0);
    const before = await count('goods_receipt');
    await expect(receipts.create({ supplier_id: sup.id, location_id: locB.id, receipt_date: date, lines: [lineOf(pA)] }, owner)).resolves.toBeNull();
    await expect(receipts.create({ supplier_id: sup.id, location_id: locA.id, receipt_date: date, lines: [lineOf(pB)] }, owner)).resolves.toBeNull();
    expect(await count('goods_receipt')).toBe(before);
    const mine = await receipts.create({ supplier_id: sup.id, location_id: locA.id, receipt_date: date, lines: [lineOf(pA)] }, owner);
    await expect(receipts.get(mine!.id, managerB)).resolves.toBeNull();
    expect((await receipts.list(managerB)).map(r => r.id)).not.toContain(mine!.id);
    expect((await receipts.list(owner)).map(r => r.id)).toContain(mine!.id);
  });

  it('stays consistent under concurrency: parallel receipts add up, opposite line order does not deadlock, opening stays first', async () => {
    const a = await product(); const b = await product(); const sup = await supplier(); const loc = await store();
    const date = await businessDate(0);
    const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) =>
      receipts.create({ supplier_id: sup.id, location_id: loc.id, receipt_date: date, lines: i % 2 ? [lineOf(a), lineOf(b)] : [lineOf(b), lineOf(a)] }, owner)));
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(0);
    expect(await balance(a.item.id, loc.id)).toBe('96.000000');
    expect(await balance(b.item.id, loc.id)).toBe('96.000000');

    const c = await product(); const loc2 = await store();
    const race = await Promise.allSettled([
      stock.createOpening({ item_id: c.item.id, location_id: loc2.id, quantity: '3' }, owner),
      receipts.create({ supplier_id: sup.id, location_id: loc2.id, receipt_date: date, lines: [lineOf(c)] }, owner),
      receipts.create({ supplier_id: sup.id, location_id: loc2.id, receipt_date: date, lines: [lineOf(c)] }, owner),
    ]);
    expect(race.filter(r => r.status === 'fulfilled').length).toBeGreaterThanOrEqual(2);
    const rows = (await admin.query(`SELECT movement_type FROM stock_movement WHERE item_id=$1 AND location_id=$2 ORDER BY created_at, id`, [c.item.id, loc2.id])).rows;
    const openingIndex = rows.findIndex(r => r.movement_type === 'OPENING');
    expect(openingIndex === -1 || openingIndex === 0).toBe(true);
  });

  it('keeps receipts create-only (runtime has no UPDATE/DELETE; triggers block the owner too)', async () => {
    const p = await product(); const sup = await supplier(); const loc = await store();
    const r = (await receipts.create({ supplier_id: sup.id, location_id: loc.id, receipt_date: await businessDate(0), lines: [lineOf(p)] }, owner))!;
    await expect(runtime.query(`UPDATE goods_receipt SET supplier_bill_no='x' WHERE id=$1`, [r.id])).rejects.toThrow(/permission denied/);
    await expect(runtime.query('DELETE FROM goods_receipt_line WHERE goods_receipt_id=$1', [r.id])).rejects.toThrow(/permission denied/);
    await expect(admin.query(`UPDATE goods_receipt SET supplier_bill_no='x' WHERE id=$1`, [r.id])).rejects.toThrow(/immutable/);
    await expect(admin.query(`UPDATE goods_receipt_line SET pack_quantity=99 WHERE goods_receipt_id=$1`, [r.id])).rejects.toThrow(/immutable/);
    await expect(admin.query('DELETE FROM goods_receipt_audit WHERE goods_receipt_id=$1', [r.id])).rejects.toThrow(/immutable/);
    await expect(admin.query('TRUNCATE goods_receipt CASCADE')).rejects.toThrow(/immutable/);
  });
});

