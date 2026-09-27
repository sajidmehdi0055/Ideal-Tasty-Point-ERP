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
import { PgPurchaseOrderRepository } from '../../src/inventory/persistence/pg-purchase-order-repository.js';
import { PgStockTransferRepository } from '../../src/inventory/persistence/pg-stock-transfer-repository.js';
import type { PurchaseOrderLineInput } from '../../src/inventory/domain/purchase-order.js';
import { applyRuntimeGrants } from './helpers/runtime-grants.js';
import { runAuthoritativeMigrate } from './helpers/migrate-cli.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('TEST_DATABASE_URL is required for real PostgreSQL integration tests');

describe('S-06 Purchase Order (real PostgreSQL)', () => {
  const suffix = randomUUID().replaceAll('-', '');
  const schema = `inv_s06_test_${suffix}`;
  const role = `inv_s06_app_${suffix}`;
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
  const pos = new PgPurchaseOrderRepository(runtime);
  const owner: AuthContext = { userId: 'owner-a', role: 'OWNER', branchId: 'branch-a' };
  const managerA: AuthContext = { userId: 'manager-a', role: 'MANAGER', branchId: 'branch-a' };
  const managerB: AuthContext = { userId: 'manager-b', role: 'MANAGER', branchId: 'branch-b' };
  const uniq = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;
  let tinId = '';

  function buildTestApp(auth: AuthContext) {
    return buildApp({
      repository: items, uomRepository: new PgUomRepository(runtime), brandRepository: brands, packVariantRepository: packs,
      supplierRepository: suppliers, purchaseRecordRepository: purchases, stockLocationRepository: locations,
      stockRepository: stock, goodsReceiptRepository: receipts, purchaseOrderRepository: pos, stockTransferRepository: new PgStockTransferRepository(runtime), authProvider: async () => auth,
    });
  }
  type Product = Awaited<ReturnType<typeof product>>;
  /** Item (base KG) + brand + TIN pack variant with the given factor, in auth's branch. */
  async function product(factor = '16', auth: AuthContext = owner) {
    const item = await items.create({ item_name: uniq('Ghee'), primary_item_type: 'RAW_MATERIAL', base_uom: 'kg', brand: 'Generic / No Brand' }, auth);
    const brand = await brands.create({ name: uniq('Brand') }, auth);
    const pack = (await packs.create({ item_id: item.id, brand_id: brand.id, pack_uom_id: tinId, conversion_factor: factor }, auth))!;
    return { item, brand, pack };
  }
  const supplier = (auth: AuthContext = owner) => suppliers.create({ name: uniq('Supplier'), type: 'CREDIT' }, auth);
  const store = (auth: AuthContext = owner) => locations.create({ name: uniq('Store'), location_type: 'STORE' }, auth);
  const poLine = (p: Product, ordered_quantity = '10', rate?: string): PurchaseOrderLineInput =>
    ({ item_id: p.item.id, brand_id: p.brand.id, pack_variant_id: p.pack.id, ordered_quantity, ...(rate ? { rate } : {}) });
  const rLine = (p: Product, purchase_order_line_id?: string, pack_quantity = '1', rate = '100') =>
    ({ item_id: p.item.id, brand_id: p.brand.id, pack_variant_id: p.pack.id, pack_quantity, rate, ...(purchase_order_line_id ? { purchase_order_line_id } : {}) });
  async function businessDate(offsetDays: number) {
    const r = await admin.query<{ d: string }>(`SELECT to_char((now() AT TIME ZONE 'Asia/Karachi')::date + $1::int, 'YYYY-MM-DD') AS d`, [offsetDays]);
    return r.rows[0]!.d;
  }
  async function balance(itemId: string, locationId: string) {
    return (await stock.listBalances({ item_id: itemId, location_id: locationId }, owner))[0]?.quantity;
  }
  const count = async (table: string, where = 'true', params: unknown[] = []) =>
    Number((await admin.query(`SELECT count(*) FROM ${table} WHERE ${where}`, params)).rows[0].count);
  /** A fresh ISSUED PO for the given lines. */
  async function issuedPo(lines: PurchaseOrderLineInput[], sup?: { id: string }, auth: AuthContext = owner, order_date?: string) {
    const s = sup ?? await supplier();
    const po = await pos.create({ supplier_id: s.id, order_date: order_date ?? await businessDate(0), lines }, auth);
    return { po: po!, sup: s };
  }

  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await runAuthoritativeMigrate(connectionString, schema);
    await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    await applyRuntimeGrants(admin, role, schema);
    tinId = (await admin.query(`SELECT id FROM uom_master WHERE name='TIN'`)).rows[0].id;
  });
  afterAll(async () => { await runtime.end(); await admin.end(); });

  it('creates an ISSUED PO through HTTP with optional rates; no stock or purchase record; audited; list and detail (O-01, O-04)', async () => {
    const ghee = await product('16'); const salt = await product('0.5');
    const sup = await supplier(); const date = await businessDate(-1);
    const before = [await count('purchase_record'), await count('stock_movement')];
    const app = buildTestApp(managerA);
    try {
      const res = await app.inject({ method: 'POST', url: '/api/inventory/purchase-orders', payload: {
        supplier_id: sup.id, order_date: date, lines: [poLine(ghee, '10', '1500'), poLine(salt, '2.5')],
      } });
      expect(res.statusCode).toBe(201);
      const po = res.json();
      expect(po.po_number).toMatch(/^PO-\d{6,}$/);
      expect(po).toMatchObject({ branch_id: 'branch-a', supplier_id: sup.id, order_date: date, status: 'ISSUED', status_reason: null, revision: 1, receipts: [] });
      expect(po.lines).toHaveLength(2);
      expect(po.lines[0]).toMatchObject({ line_no: 1, item_id: ghee.item.id, pack_variant_id: ghee.pack.id, ordered_quantity: '10.000000', rate: '1500.000000',
        received_quantity: '0.000000', pending_quantity: '10.000000', excess_quantity: '0.000000' });
      expect(po.lines[1]).toMatchObject({ line_no: 2, ordered_quantity: '2.500000', rate: null, pending_quantity: '2.500000' });
      expect([await count('purchase_record'), await count('stock_movement')]).toEqual(before);
      const audit = await admin.query('SELECT * FROM purchase_order_audit WHERE purchase_order_id=$1', [po.id]);
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0]).toMatchObject({ action: 'CREATE', before_data: null, after_data: po, actor_id: 'manager-a', actor_role: 'MANAGER', branch_id: 'branch-a', goods_receipt_id: null });
      expect((await app.inject({ method: 'GET', url: `/api/inventory/purchase-orders/${po.id}` })).json()).toEqual(po);
      const list = (await app.inject({ method: 'GET', url: '/api/inventory/purchase-orders' })).json();
      expect(list.find((r: { id: string }) => r.id === po.id)).toMatchObject({ po_number: po.po_number, supplier_name: sup.name, status: 'ISSUED', line_count: 2, receipt_count: 0 });
      expect((await app.inject({ method: 'GET', url: '/api/inventory/purchase-orders?status=ISSUED' })).json().map((r: { id: string }) => r.id)).toContain(po.id);
      expect((await app.inject({ method: 'GET', url: '/api/inventory/purchase-orders?status=RECEIVED' })).json().map((r: { id: string }) => r.id)).not.toContain(po.id);
      const next = (await app.inject({ method: 'POST', url: '/api/inventory/purchase-orders', payload: { supplier_id: sup.id, order_date: date, lines: [poLine(ghee)] } })).json();
      expect(Number(next.po_number.slice(3))).toBeGreaterThan(Number(po.po_number.slice(3)));
    } finally { await app.close(); }
  });

  it('rejects bad references, inactive masters and a future order date, writing nothing (A-01, A-02)', async () => {
    const p = await product(); const other = await product(); const sup = await supplier();
    const date = await businessDate(0);
    const before = [await count('purchase_order'), await count('purchase_order_line'), await count('purchase_order_audit')];
    await expect(pos.create({ supplier_id: sup.id, order_date: await businessDate(1), lines: [poLine(p)] }, owner)).rejects.toMatchObject({ status: 400, code: 'INVALID_ORDER_DATE' });
    await expect(pos.create({ supplier_id: randomUUID(), order_date: date, lines: [poLine(p)] }, owner)).rejects.toMatchObject({ status: 400, code: 'INVALID_REFERENCE' });
    await expect(pos.create({ supplier_id: sup.id, order_date: date, lines: [{ ...poLine(p), pack_variant_id: other.pack.id }] }, owner)).rejects.toMatchObject({ status: 400, code: 'INVALID_REFERENCE' });
    // Atomic: a valid first line is not kept when the second line fails.
    await expect(pos.create({ supplier_id: sup.id, order_date: date, lines: [poLine(p), { ...poLine(other), brand_id: p.brand.id }] }, owner)).rejects.toMatchObject({ code: 'INVALID_REFERENCE' });
    const inactiveSup = await supplier(); await suppliers.update(inactiveSup.id, { active: false }, owner);
    await expect(pos.create({ supplier_id: inactiveSup.id, order_date: date, lines: [poLine(p)] }, owner)).rejects.toMatchObject({ status: 409, code: 'SUPPLIER_INACTIVE' });
    const retired = await product(); await packs.update(retired.pack.id, { active: false }, owner);
    await expect(pos.create({ supplier_id: sup.id, order_date: date, lines: [poLine(retired)] }, owner)).rejects.toMatchObject({ status: 409, code: 'PACK_VARIANT_INACTIVE' });
    const archived = await product(); await admin.query('UPDATE item_master SET active=false WHERE id=$1', [archived.item.id]);
    await expect(pos.create({ supplier_id: sup.id, order_date: date, lines: [poLine(archived)] }, owner)).rejects.toMatchObject({ status: 409, code: 'ITEM_INACTIVE' });
    expect([await count('purchase_order'), await count('purchase_order_line'), await count('purchase_order_audit')]).toEqual(before);
    // Backdating is allowed (A-01).
    await expect(pos.create({ supplier_id: sup.id, order_date: '2025-01-15', lines: [poLine(p)] }, owner)).resolves.toMatchObject({ order_date: '2025-01-15' });
  });

  it('edits only before the first receipt: a new revision replaces the lines, the old revision is kept, every edit audited (O-05)', async () => {
    const a = await product(); const b = await product(); const sup2 = await supplier(); const loc = await store();
    const { po, sup } = await issuedPo([poLine(a, '10', '1500')], undefined, owner, await businessDate(-3));
    const oldLineId = po.lines[0]!.id;
    const app = buildTestApp(managerA);
    let edited;
    try {
      const res = await app.inject({ method: 'PATCH', url: `/api/inventory/purchase-orders/${po.id}`, payload: {
        supplier_id: sup2.id, order_date: await businessDate(-2), lines: [poLine(a, '12', '1450'), poLine(b, '5')],
      } });
      expect(res.statusCode).toBe(200);
      edited = res.json();
    } finally { await app.close(); }
    expect(edited).toMatchObject({ id: po.id, po_number: po.po_number, supplier_id: sup2.id, order_date: await businessDate(-2), revision: 2, status: 'ISSUED' });
    expect(edited.lines.map((l: { ordered_quantity: string }) => l.ordered_quantity)).toEqual(['12.000000', '5.000000']);
    expect(edited.lines[0].id).not.toBe(oldLineId);
    expect(await count('purchase_order_line', 'purchase_order_id=$1 AND revision=1', [po.id])).toBe(1);
    expect(await count('purchase_order_line', 'purchase_order_id=$1 AND revision=2', [po.id])).toBe(2);
    const audit = (await admin.query(`SELECT * FROM purchase_order_audit WHERE purchase_order_id=$1 AND action='UPDATE'`, [po.id])).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0].before_data).toEqual(po);
    expect(audit[0].after_data).toEqual(edited);
    expect(audit[0]).toMatchObject({ actor_role: 'MANAGER' });
    // Header-only edit keeps the revision.
    expect(await pos.update(po.id, { order_date: await businessDate(-1) }, owner)).toMatchObject({ revision: 2, order_date: await businessDate(-1) });
    // Invalid edits change nothing.
    await expect(pos.update(po.id, { order_date: await businessDate(1) }, owner)).rejects.toMatchObject({ status: 400, code: 'INVALID_ORDER_DATE' });
    const off = await supplier(); await suppliers.update(off.id, { active: false }, owner);
    await expect(pos.update(po.id, { supplier_id: off.id }, owner)).rejects.toMatchObject({ status: 409, code: 'SUPPLIER_INACTIVE' });
    await expect(pos.update(po.id, { lines: [{ ...poLine(a), pack_variant_id: b.pack.id }] }, owner)).rejects.toMatchObject({ status: 400, code: 'INVALID_REFERENCE' });
    const foreign = await product('16', managerB);
    await expect(pos.update(po.id, { lines: [poLine(foreign)] }, owner)).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
    expect(await pos.get(po.id, owner)).toMatchObject({ revision: 2, supplier_id: sup2.id });
    // A line of the replaced revision can no longer be received against.
    const date = await businessDate(0);
    await expect(receipts.create({ supplier_id: sup2.id, location_id: loc.id, receipt_date: date, purchase_order_id: po.id, lines: [rLine(a, oldLineId)] }, owner))
      .rejects.toMatchObject({ status: 400, code: 'PO_LINE_MISMATCH' });
    // After the first receipt the PO can no longer be edited.
    await receipts.create({ supplier_id: sup2.id, location_id: loc.id, receipt_date: date, purchase_order_id: po.id, lines: [rLine(a, edited.lines[0].id, '1')] }, owner);
    await expect(pos.update(po.id, { order_date: date }, owner)).rejects.toMatchObject({ status: 409, code: 'PO_NOT_EDITABLE' });
    expect(sup.id).not.toBe(sup2.id);
  });

  it('receives in parts and with excess; status moves ISSUED -> PARTIALLY_RECEIVED -> RECEIVED automatically (O-03, O-04, O-06)', async () => {
    const a = await product('16'); const b = await product('0.5'); const loc = await store();
    const { po, sup } = await issuedPo([poLine(a, '10', '1500'), poLine(b, '4')]);
    const [la, lb] = po.lines;
    const date = await businessDate(0);
    const app = buildTestApp(managerA);
    try {
      const res = await app.inject({ method: 'POST', url: '/api/inventory/receipts', payload: {
        supplier_id: sup.id, location_id: loc.id, receipt_date: date, supplier_bill_no: 'B-1', purchase_order_id: po.id,
        lines: [rLine(a, la!.id, '6', '1520')],
      } });
      expect(res.statusCode).toBe(201);
      const r1 = res.json();
      expect(r1).toMatchObject({ purchase_order_id: po.id });
      expect(r1.lines[0]).toMatchObject({ purchase_order_line_id: la!.id, pack_quantity: '6.000000', base_quantity: '96.000000', rate: '1520.000000' });
      // The receipt still creates the purchase record at the bill rate and the stock movement (S-05 behaviour).
      expect((await admin.query('SELECT rate FROM purchase_record WHERE id=$1', [r1.lines[0].purchase_record_id])).rows[0].rate).toBe('1520.000000');
      expect(await balance(a.item.id, loc.id)).toBe('96.000000');
      const afterFirst = (await app.inject({ method: 'GET', url: `/api/inventory/purchase-orders/${po.id}` })).json();
      expect(afterFirst.status).toBe('PARTIALLY_RECEIVED');
      expect(afterFirst.lines[0]).toMatchObject({ received_quantity: '6.000000', pending_quantity: '4.000000', excess_quantity: '0.000000' });
      expect(afterFirst.lines[1]).toMatchObject({ received_quantity: '0.000000', pending_quantity: '4.000000' });
      expect(afterFirst.receipts).toEqual([expect.objectContaining({ id: r1.id, receipt_date: date, supplier_bill_no: 'B-1' })]);

      const r2 = (await receipts.create({ supplier_id: sup.id, location_id: loc.id, receipt_date: date, purchase_order_id: po.id,
        lines: [rLine(a, la!.id, '5', '1500'), rLine(b, lb!.id, '4', '40')] }, owner))!;
      const done = (await pos.get(po.id, owner))!;
      expect(done.status).toBe('RECEIVED');
      expect(done.lines[0]).toMatchObject({ received_quantity: '11.000000', pending_quantity: '0.000000', excess_quantity: '1.000000' });
      expect(done.lines[1]).toMatchObject({ received_quantity: '4.000000', pending_quantity: '0.000000', excess_quantity: '0.000000' });
      expect(done.receipts.map(r => r.id)).toEqual([r1.id, r2.id]);

      // A RECEIVED PO takes no more receipts (A-05); nothing is written.
      const before = [await count('goods_receipt'), await count('purchase_record'), await count('stock_movement')];
      await expect(receipts.create({ supplier_id: sup.id, location_id: loc.id, receipt_date: date, purchase_order_id: po.id, lines: [rLine(a, la!.id)] }, owner))
        .rejects.toMatchObject({ status: 409, code: 'PO_NOT_OPEN' });
      expect([await count('goods_receipt'), await count('purchase_record'), await count('stock_movement')]).toEqual(before);

      const audit = (await admin.query('SELECT * FROM purchase_order_audit WHERE purchase_order_id=$1 ORDER BY occurred_at, id', [po.id])).rows;
      expect(audit.map(r => r.action)).toEqual(['CREATE', 'RECEIPT', 'RECEIPT']);
      expect(audit[1]).toMatchObject({ goods_receipt_id: r1.id, actor_role: 'MANAGER' });
      expect(audit[1].before_data).toMatchObject({ status: 'ISSUED', lines: [{ received_quantity: '0.000000' }, { received_quantity: '0.000000' }], receipts: [] });
      expect(audit[1].after_data).toEqual(afterFirst);
      expect(audit[2]).toMatchObject({ goods_receipt_id: r2.id });
      expect(audit[2].after_data).toEqual(done);

      // Direct receiving without a PO still works (O-02); the receipt list shows the PO number only for PO receipts.
      const direct = (await receipts.create({ supplier_id: sup.id, location_id: loc.id, receipt_date: date, lines: [rLine(a)] }, owner))!;
      expect(direct.purchase_order_id).toBeNull();
      expect(direct.lines[0]!.purchase_order_line_id).toBeNull();
      const list = await receipts.list(owner);
      expect(list.find(r => r.id === r1.id)).toMatchObject({ purchase_order_id: po.id, po_number: po.po_number });
      expect(list.find(r => r.id === direct.id)).toMatchObject({ purchase_order_id: null, po_number: null });
      expect((await pos.get(po.id, owner))!.lines[0]!.received_quantity).toBe('11.000000');
    } finally { await app.close(); }
  });

  it('validates the PO link on receipts and writes nothing when it fails (A-01, A-03, A-04)', async () => {
    const a = await product(); const b = await product(); const loc = await store();
    const { po, sup } = await issuedPo([poLine(a), poLine(b)], undefined, owner, await businessDate(-1));
    const { po: otherPo } = await issuedPo([poLine(a)], sup);
    const la = po.lines[0]!.id;
    const date = await businessDate(0);
    const base = { supplier_id: sup.id, location_id: loc.id, receipt_date: date, purchase_order_id: po.id };
    const before = [await count('goods_receipt'), await count('purchase_record'), await count('stock_movement'), await count('purchase_order_audit')];
    const otherSup = await supplier();
    await expect(receipts.create({ ...base, supplier_id: otherSup.id, lines: [rLine(a, la)] }, owner)).rejects.toMatchObject({ status: 400, code: 'PO_SUPPLIER_MISMATCH' });
    await expect(receipts.create({ ...base, lines: [rLine(a, otherPo.lines[0]!.id)] }, owner)).rejects.toMatchObject({ status: 400, code: 'PO_LINE_MISMATCH' });
    await expect(receipts.create({ ...base, lines: [rLine(b, la)] }, owner)).rejects.toMatchObject({ status: 400, code: 'PO_LINE_MISMATCH' });
    await expect(receipts.create({ ...base, receipt_date: await businessDate(-2), lines: [rLine(a, la)] }, owner)).rejects.toMatchObject({ status: 409, code: 'RECEIPT_BEFORE_ORDER' });
    await expect(receipts.create({ ...base, receipt_date: await businessDate(1), lines: [rLine(a, la)] }, owner)).rejects.toMatchObject({ status: 400, code: 'INVALID_RECEIPT_DATE' });
    await expect(receipts.create({ ...base, purchase_order_id: randomUUID(), lines: [rLine(a, la)] }, owner)).rejects.toMatchObject({ status: 404, code: 'PURCHASE_ORDER_NOT_FOUND' });
    // Atomic: the valid first line is not kept when the second one fails.
    await expect(receipts.create({ ...base, lines: [rLine(a, la), rLine(b, otherPo.lines[0]!.id)] }, owner)).rejects.toMatchObject({ code: 'PO_LINE_MISMATCH' });
    expect([await count('goods_receipt'), await count('purchase_record'), await count('stock_movement'), await count('purchase_order_audit')]).toEqual(before);
    expect((await pos.get(po.id, owner))!.status).toBe('ISSUED');
  });

  it('cancels only without receipts and closes only after receipts, with a reason; Manager may do both; final states stay final (O-06, O-07)', async () => {
    const a = await product(); const loc = await store(); const date = await businessDate(0);
    const { po: p1, sup } = await issuedPo([poLine(a)]);
    await expect(pos.close(p1.id, 'no receipts yet', managerA)).rejects.toMatchObject({ status: 409, code: 'PO_STATUS_CONFLICT' });
    const app = buildTestApp(managerA);
    let cancelled;
    try {
      const res = await app.inject({ method: 'POST', url: `/api/inventory/purchase-orders/${p1.id}/cancel`, payload: { reason: ' Supplier out of stock ' } });
      expect(res.statusCode).toBe(200);
      cancelled = res.json();
      expect(cancelled).toMatchObject({ status: 'CANCELLED', status_reason: 'Supplier out of stock' });
      expect((await app.inject({ method: 'GET', url: '/api/inventory/purchase-orders?status=CANCELLED' })).json().map((r: { id: string }) => r.id)).toContain(p1.id);
    } finally { await app.close(); }
    await expect(receipts.create({ supplier_id: sup.id, location_id: loc.id, receipt_date: date, purchase_order_id: p1.id, lines: [rLine(a, p1.lines[0]!.id)] }, owner))
      .rejects.toMatchObject({ status: 409, code: 'PO_NOT_OPEN' });
    await expect(pos.update(p1.id, { order_date: date }, owner)).rejects.toMatchObject({ status: 409, code: 'PO_NOT_EDITABLE' });
    await expect(pos.cancel(p1.id, 'again', owner)).rejects.toMatchObject({ status: 409, code: 'PO_STATUS_CONFLICT' });
    const cancelAudit = (await admin.query(`SELECT * FROM purchase_order_audit WHERE purchase_order_id=$1 AND action='CANCEL'`, [p1.id])).rows;
    expect(cancelAudit).toHaveLength(1);
    expect(cancelAudit[0]).toMatchObject({ actor_role: 'MANAGER', before_data: { status: 'ISSUED' }, after_data: cancelled });

    const { po: p2 } = await issuedPo([poLine(a, '10')], sup);
    await receipts.create({ supplier_id: sup.id, location_id: loc.id, receipt_date: date, purchase_order_id: p2.id, lines: [rLine(a, p2.lines[0]!.id, '3')] }, owner);
    await expect(pos.cancel(p2.id, 'too late', owner)).rejects.toMatchObject({ status: 409, code: 'PO_STATUS_CONFLICT' });
    const closed = (await pos.close(p2.id, 'Supplier will not send the remaining 7', managerA))!;
    expect(closed).toMatchObject({ status: 'CLOSED', status_reason: 'Supplier will not send the remaining 7' });
    expect(closed.lines[0]).toMatchObject({ received_quantity: '3.000000', pending_quantity: '7.000000' });
    await expect(receipts.create({ supplier_id: sup.id, location_id: loc.id, receipt_date: date, purchase_order_id: p2.id, lines: [rLine(a, p2.lines[0]!.id)] }, owner))
      .rejects.toMatchObject({ status: 409, code: 'PO_NOT_OPEN' });
    await expect(pos.close(p2.id, 'again', owner)).rejects.toMatchObject({ status: 409, code: 'PO_STATUS_CONFLICT' });
    const closeAudit = (await admin.query(`SELECT * FROM purchase_order_audit WHERE purchase_order_id=$1 AND action='CLOSE'`, [p2.id])).rows;
    expect(closeAudit[0]).toMatchObject({ actor_role: 'MANAGER', before_data: { status: 'PARTIALLY_RECEIVED' }, after_data: closed });
    expect((await pos.list({ status: 'CLOSED' }, owner)).map(r => r.id)).toContain(p2.id);
  });

  it('isolates branches: another branch cannot read, list, edit, cancel, close or receive against a PO (404, nothing written)', async () => {
    const pA = await product('16', owner); const pB = await product('16', managerB);
    const { po, sup } = await issuedPo([poLine(pA)]);
    const locB = await store(managerB);
    await expect(pos.get(po.id, managerB)).resolves.toBeNull();
    expect((await pos.list({}, managerB)).map(r => r.id)).not.toContain(po.id);
    await expect(pos.update(po.id, { order_date: await businessDate(0) }, managerB)).resolves.toBeNull();
    await expect(pos.cancel(po.id, 'x', managerB)).resolves.toBeNull();
    await expect(pos.close(po.id, 'x', managerB)).resolves.toBeNull();
    const app = buildTestApp(managerB);
    try {
      for (const req of [
        { method: 'GET' as const, url: `/api/inventory/purchase-orders/${po.id}` },
        { method: 'PATCH' as const, url: `/api/inventory/purchase-orders/${po.id}`, payload: { order_date: await businessDate(0) } },
        { method: 'POST' as const, url: `/api/inventory/purchase-orders/${po.id}/cancel`, payload: { reason: 'x' } },
      ]) {
        const res = await app.inject(req);
        expect(res.statusCode).toBe(404);
        expect(res.json()).toMatchObject({ error: 'PURCHASE_ORDER_NOT_FOUND' });
      }
    } finally { await app.close(); }
    await expect(receipts.create({ supplier_id: sup.id, location_id: locB.id, receipt_date: await businessDate(0), purchase_order_id: po.id,
      lines: [rLine(pB, po.lines[0]!.id)] }, managerB)).rejects.toMatchObject({ status: 404, code: 'PURCHASE_ORDER_NOT_FOUND' });
    // Branch A cannot put branch B's item on its PO.
    await expect(pos.create({ supplier_id: sup.id, order_date: await businessDate(0), lines: [poLine(pB)] }, owner)).resolves.toBeNull();
    expect(await pos.get(po.id, owner)).toMatchObject({ status: 'ISSUED', revision: 1, receipts: [] });
    expect(await count('purchase_order_audit', 'purchase_order_id=$1', [po.id])).toBe(1);
  });

  it('stays consistent under concurrency: parallel receipts add up exactly, cancel/edit racing a receipt never leaves a mixed state, PO numbers stay unique', async () => {
    const a = await product(); const loc = await store(); const date = await businessDate(0);
    const { po, sup } = await issuedPo([poLine(a, '10')]);
    const lineId = po.lines[0]!.id;
    const results = await Promise.allSettled(Array.from({ length: 6 }, () =>
      receipts.create({ supplier_id: sup.id, location_id: loc.id, receipt_date: date, purchase_order_id: po.id, lines: [rLine(a, lineId, '2')] }, owner)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(5);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({ code: 'PO_NOT_OPEN' });
    const final = (await pos.get(po.id, owner))!;
    expect(final).toMatchObject({ status: 'RECEIVED' });
    expect(final.lines[0]).toMatchObject({ received_quantity: '10.000000', excess_quantity: '0.000000' });
    expect(await count('purchase_order_audit', `purchase_order_id=$1 AND action='RECEIPT'`, [po.id])).toBe(5);
    expect(await balance(a.item.id, loc.id)).toBe('160.000000');

    for (let round = 0; round < 3; round++) {
      const { po: c } = await issuedPo([poLine(a, '10')], sup);
      const race = await Promise.allSettled([
        pos.cancel(c.id, 'race', owner),
        receipts.create({ supplier_id: sup.id, location_id: loc.id, receipt_date: date, purchase_order_id: c.id, lines: [rLine(a, c.lines[0]!.id, '1')] }, owner),
      ]);
      const state = (await pos.get(c.id, owner))!;
      if (race[0].status === 'fulfilled') {
        expect(race[1]).toMatchObject({ status: 'rejected', reason: { code: 'PO_NOT_OPEN' } });
        expect(state).toMatchObject({ status: 'CANCELLED', receipts: [] });
      } else {
        expect(race[0].reason).toMatchObject({ code: 'PO_STATUS_CONFLICT' });
        expect(state.status).toBe('PARTIALLY_RECEIVED');
        expect(state.receipts).toHaveLength(1);
      }

      const { po: e } = await issuedPo([poLine(a, '10')], sup);
      const race2 = await Promise.allSettled([
        pos.update(e.id, { lines: [poLine(a, '20')] }, owner),
        receipts.create({ supplier_id: sup.id, location_id: loc.id, receipt_date: date, purchase_order_id: e.id, lines: [rLine(a, e.lines[0]!.id, '1')] }, owner),
      ]);
      expect(race2.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      const eState = (await pos.get(e.id, owner))!;
      if (race2[0].status === 'fulfilled') {
        expect(race2[1]).toMatchObject({ status: 'rejected', reason: { code: 'PO_LINE_MISMATCH' } });
        expect(eState).toMatchObject({ status: 'ISSUED', revision: 2, receipts: [] });
      } else {
        expect(race2[0].reason).toMatchObject({ code: 'PO_NOT_EDITABLE' });
        expect(eState).toMatchObject({ status: 'PARTIALLY_RECEIVED', revision: 1 });
      }
    }

    const created = await Promise.all(Array.from({ length: 8 }, () => pos.create({ supplier_id: sup.id, order_date: date, lines: [poLine(a)] }, owner)));
    expect(new Set(created.map(c => c!.po_number)).size).toBe(8);
  });

  it('protects history: runtime cannot rewrite or delete (shipped grants); triggers block the schema owner; database backstops hold', async () => {
    const a = await product(); const b = await product(); const foreign = await product('16', managerB);
    const loc = await store(); const date = await businessDate(0);
    const { po, sup } = await issuedPo([poLine(a)]);
    // Shipped runtime-grants.sql: no identity/branch UPDATE, no DELETE, no line UPDATE, no audit read/rewrite.
    await expect(runtime.query(`UPDATE purchase_order SET po_number='PO-X' WHERE id=$1`, [po.id])).rejects.toThrow(/permission denied/);
    await expect(runtime.query(`UPDATE purchase_order SET branch_id='branch-b' WHERE id=$1`, [po.id])).rejects.toThrow(/permission denied/);
    await expect(runtime.query('DELETE FROM purchase_order WHERE id=$1', [po.id])).rejects.toThrow(/permission denied/);
    await expect(runtime.query('UPDATE purchase_order_line SET ordered_quantity=1 WHERE purchase_order_id=$1', [po.id])).rejects.toThrow(/permission denied/);
    await expect(runtime.query('DELETE FROM purchase_order_line WHERE purchase_order_id=$1', [po.id])).rejects.toThrow(/permission denied/);
    await expect(runtime.query('SELECT * FROM purchase_order_audit')).rejects.toThrow(/permission denied/);
    await expect(runtime.query('DELETE FROM purchase_order_audit')).rejects.toThrow(/permission denied/);
    await expect(runtime.query(`INSERT INTO purchase_order (id, branch_id, supplier_id, order_date, po_number) VALUES ($1, 'branch-a', $2, now(), 'PO-X')`, [randomUUID(), sup.id]))
      .rejects.toThrow(/permission denied/);
    // Guard triggers, even for the schema owner.
    await expect(admin.query('UPDATE purchase_order_line SET ordered_quantity=1 WHERE purchase_order_id=$1', [po.id])).rejects.toThrow(/immutable/);
    await expect(admin.query('DELETE FROM purchase_order WHERE id=$1', [po.id])).rejects.toThrow(/immutable/);
    await expect(admin.query('TRUNCATE purchase_order CASCADE')).rejects.toThrow(/immutable/);
    await expect(admin.query('DELETE FROM purchase_order_audit WHERE purchase_order_id=$1', [po.id])).rejects.toThrow(/immutable/);
    await expect(admin.query(`UPDATE purchase_order_audit SET action='UPDATE' WHERE purchase_order_id=$1`, [po.id])).rejects.toThrow(/immutable/);
    await expect(admin.query(`UPDATE purchase_order SET po_number='PO-X' WHERE id=$1`, [po.id])).rejects.toThrow(/identity/);
    await expect(admin.query(`UPDATE purchase_order SET status='RECEIVED' WHERE id=$1`, [po.id])).rejects.toThrow(/does not match/);
    await expect(admin.query(`UPDATE purchase_order SET status='CLOSED', status_reason='x' WHERE id=$1`, [po.id])).rejects.toThrow(/Invalid purchase order status change/);
    await expect(admin.query('UPDATE purchase_order SET revision = revision + 2 WHERE id=$1', [po.id])).rejects.toThrow(/advance by one/);
    await expect(admin.query(`INSERT INTO purchase_order (id, branch_id, supplier_id, order_date, po_number) VALUES ($1, 'branch-a', $2, now(), 'PO-X')`, [randomUUID(), sup.id]))
      .rejects.toThrow(/system generated/);
    // Line backstops: other-branch item, pack not matching item/brand, stale revision, same pack twice.
    const addLine = (poId: string, revision: number, p: Product, pack = p.pack.id) => admin.query(
      `INSERT INTO purchase_order_line (id, purchase_order_id, revision, line_no, item_id, brand_id, pack_variant_id, ordered_quantity) VALUES ($1, $2, $3, 9, $4, $5, $6, 1)`,
      [randomUUID(), poId, revision, p.item.id, p.brand.id, pack]);
    await expect(addLine(po.id, 1, foreign)).rejects.toThrow(/branch/);
    await expect(addLine(po.id, 1, b, a.pack.id)).rejects.toThrow(/pack variant must match/);
    await expect(addLine(po.id, 2, b)).rejects.toThrow(/current revision/);
    await expect(addLine(po.id, 1, a)).rejects.toThrow(/duplicate key/);
    // Receipt backstops: a PO line on a direct receipt; a PO that is no longer open; a final PO cannot change.
    const direct = (await receipts.create({ supplier_id: sup.id, location_id: loc.id, receipt_date: date, lines: [rLine(a)] }, owner))!;
    await expect(admin.query(
      `INSERT INTO goods_receipt_line (id, goods_receipt_id, line_no, item_id, brand_id, pack_variant_id, pack_quantity, conversion_factor, base_quantity, rate, purchase_record_id, stock_movement_id, purchase_order_line_id)
       VALUES ($1, $2, 9, $3, $4, $5, 1, 16, 16, 1, $6, $7, $8)`,
      [randomUUID(), direct.id, a.item.id, a.brand.id, a.pack.id, randomUUID(), randomUUID(), po.lines[0]!.id])).rejects.toThrow(/direct receipt/);
    await pos.cancel(po.id, 'backstop check', owner);
    await expect(admin.query(`INSERT INTO goods_receipt (id, supplier_id, location_id, receipt_date, purchase_order_id) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), sup.id, loc.id, date, po.id])).rejects.toThrow(/open purchase order/);
    await expect(admin.query(`UPDATE purchase_order SET status_reason='changed' WHERE id=$1`, [po.id])).rejects.toThrow(/final/);
  });
});
