import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
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
import type { StockTransfer } from '../../src/inventory/domain/stock-transfer.js';
import { applyRuntimeGrants } from './helpers/runtime-grants.js';
import { runAuthoritativeMigrate } from './helpers/migrate-cli.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('TEST_DATABASE_URL is required for real PostgreSQL integration tests');

describe('S-07 Stock Transfer (real PostgreSQL)', () => {
  const suffix = randomUUID().replaceAll('-', '');
  const schema = `inv_s07_test_${suffix}`;
  const role = `inv_s07_app_${suffix}`;
  const admin = new Pool({ connectionString, options: `-c search_path=${schema}` });
  const runtime = new Pool({ connectionString, options: `-c search_path=${schema} -c role=${role}`, max: 12 });
  const items = new PgItemRepository(runtime);
  const locations = new PgStockLocationRepository(runtime);
  const stock = new PgStockRepository(runtime);
  const transfers = new PgStockTransferRepository(runtime);
  const owner: AuthContext = { userId: 'owner-a', role: 'OWNER', branchId: 'branch-a' };
  const managerA: AuthContext = { userId: 'manager-a', role: 'MANAGER', branchId: 'branch-a' };
  const managerB: AuthContext = { userId: 'manager-b', role: 'MANAGER', branchId: 'branch-b' };
  const uniq = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;

  function buildTestApp(auth: AuthContext) {
    return buildApp({
      repository: items, uomRepository: new PgUomRepository(runtime), brandRepository: new PgBrandRepository(runtime),
      packVariantRepository: new PgPackVariantRepository(runtime), supplierRepository: new PgSupplierRepository(runtime),
      purchaseRecordRepository: new PgPurchaseRecordRepository(runtime), stockLocationRepository: locations,
      stockRepository: stock, goodsReceiptRepository: new PgGoodsReceiptRepository(runtime),
      purchaseOrderRepository: new PgPurchaseOrderRepository(runtime), stockTransferRepository: transfers,
      authProvider: async () => auth,
    });
  }
  const item = (auth: AuthContext = owner) =>
    items.create({ item_name: uniq('Flour'), primary_item_type: 'RAW_MATERIAL', base_uom: 'kg', brand: 'Generic / No Brand' }, auth);
  const loc = (type: 'STORE' | 'KITCHEN' = 'STORE', auth: AuthContext = owner) => locations.create({ name: uniq(type), location_type: type }, auth);
  /** Item with opening stock `qty` at a new store, plus a new kitchen destination. */
  async function stocked(qty = '10', auth: AuthContext = owner) {
    const i = await item(auth);
    const from = await loc('STORE', auth);
    const to = await loc('KITCHEN', auth);
    await stock.createOpening({ item_id: i.id, location_id: from.id, quantity: qty }, auth);
    return { i, from, to };
  }
  async function sentTransfer(qty = '10', sendQty = '4', auth: AuthContext = owner) {
    const s = await stocked(qty, auth);
    const t = (await transfers.send({ from_location_id: s.from.id, to_location_id: s.to.id, lines: [{ item_id: s.i.id, quantity: sendQty }] }, auth))!;
    return { ...s, t };
  }
  const fullReceipt = (t: StockTransfer) => ({ lines: t.lines.map(l => ({ line_id: l.id, received_quantity: l.sent_quantity })) });
  async function balance(itemId: string, locationId: string, auth: AuthContext = owner) {
    return (await stock.listBalances({ item_id: itemId, location_id: locationId }, auth))[0]?.quantity;
  }
  const count = async (table: string, where = 'true', params: unknown[] = []) =>
    Number((await admin.query(`SELECT count(*) FROM ${table} WHERE ${where}`, params)).rows[0].count);
  const status = async (id: string) => (await admin.query('SELECT status FROM stock_transfer WHERE id=$1', [id])).rows[0].status as string;

  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await runAuthoritativeMigrate(connectionString, schema);
    await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    await applyRuntimeGrants(admin, role, schema);
  });
  afterAll(async () => { await runtime.end(); await admin.end(); });

  it('sends through HTTP: stock leaves the source at once, destination unchanged (in transit), audited, listed (O-02)', async () => {
    const { i, from, to } = await stocked('10');
    const second = await item();
    await stock.createOpening({ item_id: second.id, location_id: from.id, quantity: '2.5' }, owner);
    const app = buildTestApp(managerA);
    try {
      const res = await app.inject({ method: 'POST', url: '/api/inventory/transfers', payload: {
        from_location_id: from.id, to_location_id: to.id, lines: [{ item_id: i.id, quantity: '4' }, { item_id: second.id, quantity: '2.5' }],
      } });
      expect(res.statusCode).toBe(201);
      const t = res.json();
      expect(t.transfer_number).toMatch(/^TRF-\d{6,}$/);
      expect(t).toMatchObject({ branch_id: 'branch-a', from_location_id: from.id, to_location_id: to.id, status: 'SENT', status_reason: null });
      expect(t.lines).toHaveLength(2);
      expect(t.lines[0]).toMatchObject({ line_no: 1, item_id: i.id, sent_quantity: '4.000000', received_quantity: null, variance_quantity: null, in_movement_id: null, return_movement_id: null });
      expect(await balance(i.id, from.id)).toBe('6.000000');
      expect(await balance(second.id, from.id)).toBe('0.000000');
      expect(await balance(i.id, to.id)).toBeUndefined();
      const out = (await admin.query('SELECT * FROM stock_movement WHERE id=$1', [t.lines[0].out_movement_id])).rows[0];
      expect(out).toMatchObject({ movement_type: 'TRANSFER_OUT', item_id: i.id, location_id: from.id, quantity_delta: '-4.000000', reason: null });
      expect(await count('stock_movement_audit', 'stock_movement_id=$1', [out.id])).toBe(1);
      const audit = (await admin.query('SELECT * FROM stock_transfer_audit WHERE stock_transfer_id=$1', [t.id])).rows;
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ action: 'CREATE', before_data: null, actor_id: 'manager-a', actor_role: 'MANAGER', branch_id: 'branch-a' });
      expect(audit[0].after_data.lines).toHaveLength(2);

      const pending = await app.inject({ method: 'GET', url: '/api/inventory/transfers?status=SENT' });
      expect(pending.statusCode).toBe(200);
      expect(pending.json().find((x: { id: string }) => x.id === t.id)).toMatchObject({
        transfer_number: t.transfer_number, from_location_name: from.name, to_location_name: to.name, status: 'SENT', line_count: 2,
      });
      const received = await app.inject({ method: 'GET', url: '/api/inventory/transfers?status=RECEIVED' });
      expect(received.json().some((x: { id: string }) => x.id === t.id)).toBe(false);
      const got = await app.inject({ method: 'GET', url: `/api/inventory/transfers/${t.id}` });
      expect(got.statusCode).toBe(200);
      expect(got.json()).toEqual(t);
      const movements = await app.inject({ method: 'GET', url: `/api/inventory/stock/movements?location_id=${from.id}&item_id=${i.id}` });
      expect(movements.json().map((m: { movement_type: string }) => m.movement_type)).toEqual(['TRANSFER_OUT', 'OPENING']);
    } finally { await app.close(); }
  });

  it('receives in full: destination balance rises, final, audited; a TRANSFER_IN may be the first stock (opening then refused)', async () => {
    const { i, from, to, t } = await sentTransfer('10', '4');
    const app = buildTestApp(owner);
    try {
      const res = await app.inject({ method: 'POST', url: `/api/inventory/transfers/${t.id}/receive`, payload: fullReceipt(t) });
      expect(res.statusCode).toBe(200);
      const r = res.json();
      expect(r.status).toBe('RECEIVED');
      expect(r.lines[0]).toMatchObject({ received_quantity: '4.000000', variance_quantity: '0.000000', variance_reason: null, return_movement_id: null });
      expect(await balance(i.id, to.id)).toBe('4.000000');
      expect(await balance(i.id, from.id)).toBe('6.000000');
      const inMv = (await admin.query('SELECT * FROM stock_movement WHERE id=$1', [r.lines[0].in_movement_id])).rows[0];
      expect(inMv).toMatchObject({ movement_type: 'TRANSFER_IN', location_id: to.id, quantity_delta: '4.000000' });
      const audit = (await admin.query(`SELECT * FROM stock_transfer_audit WHERE stock_transfer_id=$1 AND action='RECEIVE'`, [t.id])).rows;
      expect(audit).toHaveLength(1);
      expect(audit[0].before_data.status).toBe('SENT');
      expect(audit[0].after_data.status).toBe('RECEIVED');
      const again = await app.inject({ method: 'POST', url: `/api/inventory/transfers/${t.id}/receive`, payload: fullReceipt(t) });
      expect(again.statusCode).toBe(409);
      expect(again.json().error).toBe('TRANSFER_STATUS_CONFLICT');
      const cancel = await app.inject({ method: 'POST', url: `/api/inventory/transfers/${t.id}/cancel`, payload: { reason: 'late' } });
      expect(cancel.statusCode).toBe(409);
      expect(cancel.json().error).toBe('TRANSFER_STATUS_CONFLICT');
      await expect(stock.createOpening({ item_id: i.id, location_id: to.id, quantity: '1' }, owner)).rejects.toMatchObject({ status: 409, code: 'STOCK_HISTORY_EXISTS' });
      // An adjustment at the destination is allowed after the transfer-in.
      await expect(stock.createAdjustment({ item_id: i.id, location_id: to.id, quantity_delta: '-1', reason: 'spilled' }, owner)).resolves.toMatchObject({ movement_type: 'ADJUSTMENT' });
    } finally { await app.close(); }
  });

  it('short receive records variance with a mandatory reason; received 0 has no TRANSFER_IN; variance never returns to the source (O-03)', async () => {
    const { i, from, to } = await stocked('10');
    const oil = await item();
    await stock.createOpening({ item_id: oil.id, location_id: from.id, quantity: '5' }, owner);
    const t = (await transfers.send({ from_location_id: from.id, to_location_id: to.id, lines: [{ item_id: i.id, quantity: '10' }, { item_id: oil.id, quantity: '2' }] }, owner))!;
    const [l1, l2] = t.lines;
    const movementsBefore = await count('stock_movement');
    const bad = [
      [{ lines: [{ line_id: l1!.id, received_quantity: '7' }, { line_id: l2!.id, received_quantity: '0', variance_reason: 'broken' }] }, 'VARIANCE_REASON_REQUIRED'],
      [{ lines: [{ line_id: l1!.id, received_quantity: '10.5', variance_reason: 'x' }, { line_id: l2!.id, received_quantity: '2' }] }, 'RECEIVED_EXCEEDS_SENT'],
      [{ lines: [{ line_id: l1!.id, received_quantity: '10', variance_reason: 'x' }, { line_id: l2!.id, received_quantity: '2' }] }, 'VARIANCE_REASON_NOT_ALLOWED'],
      [{ lines: [{ line_id: l1!.id, received_quantity: '10' }] }, 'RECEIVE_LINES_MISMATCH'],
      [{ lines: [{ line_id: l1!.id, received_quantity: '10' }, { line_id: randomUUID(), received_quantity: '2' }] }, 'RECEIVE_LINES_MISMATCH'],
    ] as const;
    for (const [payload, code] of bad) {
      await expect(transfers.receive(t.id, payload as never, owner)).rejects.toMatchObject({ status: 400, code });
    }
    expect(await status(t.id)).toBe('SENT');
    expect(await count('stock_movement')).toBe(movementsBefore);
    expect(await count('stock_transfer_settlement s JOIN stock_transfer_line l ON l.id = s.stock_transfer_line_id', 'l.stock_transfer_id=$1', [t.id])).toBe(0);

    const r = (await transfers.receive(t.id, { lines: [
      { line_id: l2!.id, received_quantity: '0', variance_reason: 'Bottles broken on stairs' },
      { line_id: l1!.id, received_quantity: '7.25', variance_reason: 'Bag torn' },
    ] }, managerA))!;
    expect(r.status).toBe('RECEIVED');
    expect(r.lines[0]).toMatchObject({ item_id: i.id, received_quantity: '7.250000', variance_quantity: '2.750000', variance_reason: 'Bag torn' });
    expect(r.lines[1]).toMatchObject({ item_id: oil.id, received_quantity: '0.000000', variance_quantity: '2.000000', variance_reason: 'Bottles broken on stairs', in_movement_id: null });
    expect(await balance(i.id, to.id)).toBe('7.250000');
    expect(await balance(oil.id, to.id)).toBeUndefined();
    expect(await balance(i.id, from.id)).toBe('0.000000');
    expect(await balance(oil.id, from.id)).toBe('3.000000');
    expect(await count('stock_movement')).toBe(movementsBefore + 1);
  });

  it('cancels before receipt with a reason: full sent quantity returns to the source; final (O-05)', async () => {
    const { i, from, to, t } = await sentTransfer('10', '4');
    const app = buildTestApp(managerA);
    try {
      const noReason = await app.inject({ method: 'POST', url: `/api/inventory/transfers/${t.id}/cancel`, payload: { reason: '   ' } });
      expect(noReason.statusCode).toBe(400);
      const res = await app.inject({ method: 'POST', url: `/api/inventory/transfers/${t.id}/cancel`, payload: { reason: ' Wrong kitchen ' } });
      expect(res.statusCode).toBe(200);
      const c = res.json();
      expect(c).toMatchObject({ status: 'CANCELLED', status_reason: 'Wrong kitchen' });
      expect(c.lines[0]).toMatchObject({ received_quantity: null, variance_quantity: null, in_movement_id: null });
      expect(await balance(i.id, from.id)).toBe('10.000000');
      expect(await balance(i.id, to.id)).toBeUndefined();
      const ret = (await admin.query('SELECT * FROM stock_movement WHERE id=$1', [c.lines[0].return_movement_id])).rows[0];
      expect(ret).toMatchObject({ movement_type: 'TRANSFER_RETURN', location_id: from.id, quantity_delta: '4.000000' });
      const audit = (await admin.query(`SELECT * FROM stock_transfer_audit WHERE stock_transfer_id=$1 AND action='CANCEL'`, [t.id])).rows;
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ actor_id: 'manager-a' });
      const receive = await app.inject({ method: 'POST', url: `/api/inventory/transfers/${t.id}/receive`, payload: fullReceipt(t) });
      expect(receive.statusCode).toBe(409);
      expect(receive.json().error).toBe('TRANSFER_STATUS_CONFLICT');
    } finally { await app.close(); }
  });

  it('refuses insufficient stock, inactive item/location, and writes nothing (all-or-nothing, A-02)', async () => {
    const { i, from, to } = await stocked('10');
    const other = await item();
    await stock.createOpening({ item_id: other.id, location_id: from.id, quantity: '1' }, owner);
    const before = [await count('stock_transfer'), await count('stock_movement'), await count('stock_transfer_audit')];
    await expect(transfers.send({ from_location_id: from.id, to_location_id: to.id, lines: [{ item_id: i.id, quantity: '5' }, { item_id: other.id, quantity: '1.000001' }] }, owner))
      .rejects.toMatchObject({ status: 409, code: 'INSUFFICIENT_STOCK', message: expect.stringContaining('lines[1]') });
    const noStock = await item();
    await expect(transfers.send({ from_location_id: from.id, to_location_id: to.id, lines: [{ item_id: noStock.id, quantity: '1' }] }, owner))
      .rejects.toMatchObject({ status: 409, code: 'INSUFFICIENT_STOCK' });
    const inactive = await item();
    await stock.createOpening({ item_id: inactive.id, location_id: from.id, quantity: '3' }, owner);
    await admin.query('UPDATE item_master SET active=false WHERE id=$1', [inactive.id]);
    await expect(transfers.send({ from_location_id: from.id, to_location_id: to.id, lines: [{ item_id: inactive.id, quantity: '1' }] }, owner))
      .rejects.toMatchObject({ status: 409, code: 'ITEM_INACTIVE' });
    const closedKitchen = await loc('KITCHEN');
    await locations.update(closedKitchen.id, { active: false }, owner);
    await expect(transfers.send({ from_location_id: from.id, to_location_id: closedKitchen.id, lines: [{ item_id: i.id, quantity: '1' }] }, owner))
      .rejects.toMatchObject({ status: 409, code: 'LOCATION_INACTIVE' });
    expect([await count('stock_transfer'), await count('stock_movement') - 1, await count('stock_transfer_audit')]).toEqual(before);
    expect(await balance(i.id, from.id)).toBe('10.000000');
  });

  it('blocks deactivating a source or destination with a pending transfer; allows it after receive; in-transit item deactivated can still be received (D-07, A-02)', async () => {
    const { i, from, to, t } = await sentTransfer('4', '4');
    await expect(locations.update(from.id, { active: false }, owner)).rejects.toMatchObject({ status: 409, code: 'LOCATION_HAS_PENDING_TRANSFERS' });
    await expect(locations.update(to.id, { active: false }, owner)).rejects.toMatchObject({ status: 409, code: 'LOCATION_HAS_PENDING_TRANSFERS' });
    await expect(admin.query('UPDATE stock_location SET active=false WHERE id=$1', [to.id])).rejects.toThrow(/pending stock transfers/);
    await admin.query('UPDATE item_master SET active=false WHERE id=$1', [i.id]);
    await expect(transfers.receive(t.id, fullReceipt(t), owner)).resolves.toMatchObject({ status: 'RECEIVED' });
    await expect(locations.update(from.id, { active: false }, owner)).resolves.toMatchObject({ active: false });
    await expect(locations.update(to.id, { active: false }, owner)).rejects.toMatchObject({ code: 'LOCATION_HAS_STOCK' });
  });

  it('keeps branches isolated for reads and writes; nothing is written across branches', async () => {
    const { i, from, to, t } = await sentTransfer('10', '4');
    const bLoc = await loc('KITCHEN', managerB);
    const bItem = await item(managerB);
    expect(await transfers.get(t.id, managerB)).toBeNull();
    expect((await transfers.list({}, managerB)).some(x => x.id === t.id)).toBe(false);
    expect((await transfers.list({}, owner)).some(x => x.id === t.id)).toBe(true);
    const app = buildTestApp(managerB);
    try {
      for (const req of [
        { method: 'GET' as const, url: `/api/inventory/transfers/${t.id}` },
        { method: 'POST' as const, url: `/api/inventory/transfers/${t.id}/receive`, payload: fullReceipt(t) },
        { method: 'POST' as const, url: `/api/inventory/transfers/${t.id}/cancel`, payload: { reason: 'hijack' } },
      ]) {
        const res = await app.inject(req);
        expect(res.statusCode).toBe(404);
        expect(res.json().error).toBe('TRANSFER_NOT_FOUND');
      }
      const before = [await count('stock_transfer'), await count('stock_movement')];
      for (const payload of [
        { from_location_id: from.id, to_location_id: bLoc.id, lines: [{ item_id: i.id, quantity: '1' }] },
        { from_location_id: bLoc.id, to_location_id: to.id, lines: [{ item_id: bItem.id, quantity: '1' }] },
      ]) {
        const res = await app.inject({ method: 'POST', url: '/api/inventory/transfers', payload });
        expect(res.statusCode).toBe(404);
        expect(res.json().error).toBe('NOT_FOUND');
      }
      expect([await count('stock_transfer'), await count('stock_movement')]).toEqual(before);
    } finally { await app.close(); }
    // Own-branch caller naming another branch's destination or item: 404, nothing written.
    await expect(transfers.send({ from_location_id: from.id, to_location_id: bLoc.id, lines: [{ item_id: i.id, quantity: '1' }] }, owner)).resolves.toBeNull();
    await expect(transfers.send({ from_location_id: from.id, to_location_id: to.id, lines: [{ item_id: bItem.id, quantity: '1' }] }, owner)).resolves.toBeNull();
    expect(await status(t.id)).toBe('SENT');
    expect(await balance(i.id, from.id)).toBe('6.000000');
  });

  it('stays consistent under concurrency: parallel sends never overdraw, receive vs cancel has one winner, numbers unique, send vs deactivation never both succeed', async () => {
    // (a) 6 parallel sends of 3 from a balance of 10: exactly 3 succeed.
    const { i, from, to } = await stocked('10');
    const sends = await Promise.allSettled(Array.from({ length: 6 }, () =>
      transfers.send({ from_location_id: from.id, to_location_id: to.id, lines: [{ item_id: i.id, quantity: '3' }] }, owner)));
    expect(sends.filter(r => r.status === 'fulfilled')).toHaveLength(3);
    for (const r of sends.filter(r => r.status === 'rejected')) {
      expect((r as PromiseRejectedResult).reason).toMatchObject({ status: 409, code: 'INSUFFICIENT_STOCK' });
    }
    expect(await balance(i.id, from.id)).toBe('1.000000');
    const numbers = sends.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<StockTransfer>).value.transfer_number);
    expect(new Set(numbers).size).toBe(3);

    // (b) receive vs cancel of the same transfer, 5 rounds: exactly one wins, the loser gets a clean 409.
    for (let round = 0; round < 5; round++) {
      const s = await sentTransfer('5', '5');
      const results = await Promise.allSettled([
        transfers.receive(s.t.id, fullReceipt(s.t), owner),
        transfers.cancel(s.t.id, 'race', managerA),
      ]);
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ status: 409, code: 'TRANSFER_STATUS_CONFLICT' });
      const final = await status(s.t.id);
      expect(await balance(s.i.id, s.from.id)).toBe(final === 'CANCELLED' ? '5.000000' : '0.000000');
      expect(await balance(s.i.id, s.to.id)).toBe(final === 'RECEIVED' ? '5.000000' : undefined);
      expect(await count('stock_transfer_settlement s JOIN stock_transfer_line l ON l.id = s.stock_transfer_line_id', 'l.stock_transfer_id=$1', [s.t.id])).toBe(1);
    }

    // (c) 3 rounds: send into an empty kitchen vs deactivating that kitchen -- never both succeed.
    for (let round = 0; round < 3; round++) {
      const s = await stocked('2');
      const [sent, deactivated] = await Promise.allSettled([
        transfers.send({ from_location_id: s.from.id, to_location_id: s.to.id, lines: [{ item_id: s.i.id, quantity: '1' }] }, owner),
        locations.update(s.to.id, { active: false }, owner),
      ]);
      expect([sent.status, deactivated.status].filter(x => x === 'fulfilled')).toHaveLength(1);
      if (sent.status === 'rejected') expect(sent.reason).toMatchObject({ code: 'LOCATION_INACTIVE' });
      if (deactivated.status === 'rejected') expect(deactivated.reason).toMatchObject({ code: 'LOCATION_HAS_PENDING_TRANSFERS' });
    }
  });

  it('uses the shipped runtime grants: identity, deletes, line/settlement edits and audit reads are denied', async () => {
    const { t } = await sentTransfer('5', '2');
    const lineId = t.lines[0]!.id;
    await expect(runtime.query(`UPDATE stock_transfer SET transfer_number='TRF-X' WHERE id=$1`, [t.id])).rejects.toThrow(/permission denied/);
    await expect(runtime.query(`UPDATE stock_transfer SET to_location_id=from_location_id WHERE id=$1`, [t.id])).rejects.toThrow(/permission denied/);
    await expect(runtime.query('DELETE FROM stock_transfer WHERE id=$1', [t.id])).rejects.toThrow(/permission denied/);
    await expect(runtime.query('UPDATE stock_transfer_line SET sent_quantity=1 WHERE id=$1', [lineId])).rejects.toThrow(/permission denied/);
    await expect(runtime.query('DELETE FROM stock_transfer_line WHERE id=$1', [lineId])).rejects.toThrow(/permission denied/);
    await expect(runtime.query('UPDATE stock_transfer_settlement SET received_quantity=1')).rejects.toThrow(/permission denied/);
    await expect(runtime.query('DELETE FROM stock_transfer_settlement')).rejects.toThrow(/permission denied/);
    await expect(runtime.query('SELECT * FROM stock_transfer_audit')).rejects.toThrow(/permission denied/);
    await expect(runtime.query('DELETE FROM stock_transfer_audit')).rejects.toThrow(/permission denied/);
    await expect(runtime.query(`INSERT INTO stock_transfer (id, from_location_id, to_location_id, transfer_number) VALUES ($1, $2, $3, 'TRF-X')`,
      [randomUUID(), t.from_location_id, t.to_location_id])).rejects.toThrow(/permission denied/);
    // Allowed column, but the guard trigger refuses a status change without settlements.
    await expect(runtime.query(`UPDATE stock_transfer SET status='RECEIVED' WHERE id=$1`, [t.id])).rejects.toThrow(/settlement/);
    expect(await status(t.id)).toBe('SENT');
  });

  it('database backstops hold even for the schema owner (immutability, lifecycle, links, commit-time checks)', async () => {
    const { i, from, to, t } = await sentTransfer('10', '2');
    const lineId = t.lines[0]!.id;
    const inTx = async (work: (c: PoolClient) => Promise<void>) => {
      const c = await admin.connect();
      try { await c.query('BEGIN'); await work(c); await c.query('COMMIT'); } catch (e) { await c.query('ROLLBACK').catch(() => undefined); throw e; } finally { c.release(); }
    };
    // Immutable lines, audit, no delete/truncate, identity fixed.
    await expect(admin.query('UPDATE stock_transfer_line SET sent_quantity=1 WHERE id=$1', [lineId])).rejects.toThrow(/immutable/);
    await expect(admin.query('DELETE FROM stock_transfer_line WHERE id=$1', [lineId])).rejects.toThrow(/immutable/);
    await expect(admin.query('DELETE FROM stock_transfer WHERE id=$1', [t.id])).rejects.toThrow(/immutable/);
    await expect(admin.query('TRUNCATE stock_transfer CASCADE')).rejects.toThrow(/immutable/);
    await expect(admin.query('DELETE FROM stock_transfer_audit WHERE stock_transfer_id=$1', [t.id])).rejects.toThrow(/immutable/);
    await expect(admin.query(`UPDATE stock_transfer_audit SET action='CANCEL' WHERE stock_transfer_id=$1`, [t.id])).rejects.toThrow(/immutable/);
    await expect(admin.query(`UPDATE stock_transfer SET transfer_number='TRF-X' WHERE id=$1`, [t.id])).rejects.toThrow(/immutable/);
    await expect(admin.query(`UPDATE stock_transfer SET status='CANCELLED', status_reason='x' WHERE id=$1`, [t.id])).rejects.toThrow(/settlement/);
    await expect(admin.query(`UPDATE stock_transfer SET updated_at=now() WHERE id=$1`, [t.id])).rejects.toThrow(/only become/);
    // Line added outside the creating transaction.
    await expect(inTx(async c => {
      const mv = randomUUID();
      await c.query(`INSERT INTO stock_movement (id, item_id, location_id, movement_type, quantity_delta) VALUES ($1, $2, $3, 'TRANSFER_OUT', -1)`, [mv, i.id, from.id]);
      await c.query('INSERT INTO stock_transfer_line (id, stock_transfer_id, line_no, item_id, sent_quantity, out_movement_id) VALUES ($1, $2, 9, $3, 1, $4)', [randomUUID(), t.id, i.id, mv]);
    })).rejects.toThrow(/only be added while creating/);
    // A transfer movement without its transfer record fails at commit.
    await expect(inTx(async c => {
      await c.query(`INSERT INTO stock_movement (id, item_id, location_id, movement_type, quantity_delta) VALUES ($1, $2, $3, 'TRANSFER_OUT', -1)`, [randomUUID(), i.id, from.id]);
    })).rejects.toThrow(/not linked to a transfer line/);
    await expect(inTx(async c => {
      await c.query(`INSERT INTO stock_movement (id, item_id, location_id, movement_type, quantity_delta) VALUES ($1, $2, $3, 'TRANSFER_IN', 1)`, [randomUUID(), i.id, to.id]);
    })).rejects.toThrow(/not linked to a transfer settlement/);
    // A transfer without lines fails at commit; destination in another branch or equal to the source is refused.
    await expect(inTx(async c => {
      await c.query('INSERT INTO stock_transfer (id, from_location_id, to_location_id) VALUES ($1, $2, $3)', [randomUUID(), from.id, to.id]);
    })).rejects.toThrow(/has no lines/);
    const bLoc = await loc('STORE', managerB);
    await expect(admin.query('INSERT INTO stock_transfer (id, from_location_id, to_location_id) VALUES ($1, $2, $3)', [randomUUID(), from.id, bLoc.id])).rejects.toThrow(/same branch/);
    await expect(admin.query('INSERT INTO stock_transfer (id, from_location_id, to_location_id) VALUES ($1, $2, $2)', [randomUUID(), from.id])).rejects.toThrow(/check constraint/);
    // Settlements: received > sent, wrong movement, mixed kinds.
    await expect(inTx(async c => {
      const mv = randomUUID();
      await c.query(`INSERT INTO stock_movement (id, item_id, location_id, movement_type, quantity_delta) VALUES ($1, $2, $3, 'TRANSFER_IN', 3)`, [mv, i.id, to.id]);
      await c.query(`INSERT INTO stock_transfer_settlement (id, stock_transfer_line_id, kind, received_quantity, variance_quantity, movement_id) VALUES ($1, $2, 'RECEIVE', 3, 0, $3)`, [randomUUID(), lineId, mv]);
    })).rejects.toThrow(/between 0 and the sent quantity/);
    await expect(inTx(async c => {
      const mv = randomUUID();
      await c.query(`INSERT INTO stock_movement (id, item_id, location_id, movement_type, quantity_delta) VALUES ($1, $2, $3, 'TRANSFER_IN', 2)`, [mv, i.id, from.id]);
      await c.query(`INSERT INTO stock_transfer_settlement (id, stock_transfer_line_id, kind, received_quantity, variance_quantity, movement_id) VALUES ($1, $2, 'RECEIVE', 2, 0, $3)`, [randomUUID(), lineId, mv]);
    })).rejects.toThrow(/own TRANSFER_IN movement/);
    const two = await item();
    await stock.createOpening({ item_id: two.id, location_id: from.id, quantity: '5' }, owner);
    const t2 = (await transfers.send({ from_location_id: from.id, to_location_id: to.id, lines: [{ item_id: i.id, quantity: '1' }, { item_id: two.id, quantity: '1' }] }, owner))!;
    await expect(inTx(async c => {
      const [a, b] = [randomUUID(), randomUUID()];
      await c.query(`INSERT INTO stock_movement (id, item_id, location_id, movement_type, quantity_delta) VALUES ($1, $2, $3, 'TRANSFER_IN', 1)`, [a, i.id, to.id]);
      await c.query(`INSERT INTO stock_transfer_settlement (id, stock_transfer_line_id, kind, received_quantity, variance_quantity, movement_id) VALUES ($1, $2, 'RECEIVE', 1, 0, $3)`, [randomUUID(), t2.lines[0]!.id, a]);
      await c.query(`INSERT INTO stock_movement (id, item_id, location_id, movement_type, quantity_delta) VALUES ($1, $2, $3, 'TRANSFER_RETURN', 1)`, [b, two.id, from.id]);
      await c.query(`INSERT INTO stock_transfer_settlement (id, stock_transfer_line_id, kind, movement_id) VALUES ($1, $2, 'CANCEL', $3)`, [randomUUID(), t2.lines[1]!.id, b]);
    })).rejects.toThrow(/never both/);
    // Final transfers are frozen; settlements on a final transfer are refused.
    await transfers.receive(t.id, fullReceipt(t), owner);
    await expect(admin.query(`UPDATE stock_transfer SET status='CANCELLED', status_reason='x' WHERE id=$1`, [t.id])).rejects.toThrow(/final/);
    await expect(admin.query('UPDATE stock_transfer_settlement SET variance_reason=$2 WHERE stock_transfer_line_id=$1', [lineId, 'x'])).rejects.toThrow(/immutable/);
    await expect(inTx(async c => {
      const mv = randomUUID();
      await c.query(`INSERT INTO stock_movement (id, item_id, location_id, movement_type, quantity_delta) VALUES ($1, $2, $3, 'TRANSFER_RETURN', 2)`, [mv, i.id, from.id]);
      await c.query(`INSERT INTO stock_transfer_settlement (id, stock_transfer_line_id, kind, movement_id) VALUES ($1, $2, 'CANCEL', $3)`, [randomUUID(), lineId, mv]);
    })).rejects.toThrow(/only a SENT transfer|duplicate key/i);
    // Ledger constraint: a TRANSFER_OUT must be negative.
    await expect(admin.query(`INSERT INTO stock_movement (id, item_id, location_id, movement_type, quantity_delta) VALUES ($1, $2, $3, 'TRANSFER_OUT', 1)`, [randomUUID(), i.id, from.id])).rejects.toThrow(/check constraint/);
    expect(await status(t2.id)).toBe('SENT');
  });
});
