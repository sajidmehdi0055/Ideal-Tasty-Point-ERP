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
import { applyRuntimeGrants } from './helpers/runtime-grants.js';
import { runAuthoritativeMigrate } from './helpers/migrate-cli.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('TEST_DATABASE_URL is required for real PostgreSQL integration tests');

describe('S-04 Stock Locations & Opening Stock (real PostgreSQL)', () => {
  const suffix = randomUUID().replaceAll('-', '');
  const schema = `inv_s04_test_${suffix}`;
  const role = `inv_s04_app_${suffix}`;
  const admin = new Pool({ connectionString, options: `-c search_path=${schema}` });
  const runtime = new Pool({ connectionString, options: `-c search_path=${schema} -c role=${role}`, max: 12 });
  const itemRepository = new PgItemRepository(runtime);
  const locationRepository = new PgStockLocationRepository(runtime);
  const stockRepository = new PgStockRepository(runtime);
  const owner: AuthContext = { userId: 'owner-a', role: 'OWNER', branchId: 'branch-a' };
  const managerA: AuthContext = { userId: 'manager-a', role: 'MANAGER', branchId: 'branch-a' };
  const managerB: AuthContext = { userId: 'manager-b', role: 'MANAGER', branchId: 'branch-b' };

  function buildTestApp(auth: AuthContext) {
    return buildApp({
      repository: itemRepository, uomRepository: new PgUomRepository(runtime), brandRepository: new PgBrandRepository(runtime),
      packVariantRepository: new PgPackVariantRepository(runtime), supplierRepository: new PgSupplierRepository(runtime),
      purchaseRecordRepository: new PgPurchaseRecordRepository(runtime), stockLocationRepository: locationRepository,
      stockRepository, authProvider: async () => auth,
    });
  }
  const itemInput = (name: string): ItemInput => ({ item_name: name, primary_item_type: 'RAW_MATERIAL', base_uom: 'kg', brand: 'Generic / No Brand' });
  const uniqueName = (label: string) => `${label} ${randomUUID().slice(0, 8)}`;
  async function store(auth: AuthContext = owner) {
    return locationRepository.create({ name: uniqueName('Store'), location_type: 'STORE' }, auth);
  }
  async function itemAndStore(auth: AuthContext = owner) {
    const item = await itemRepository.create(itemInput(uniqueName('Flour')), auth);
    const location = await store(auth);
    return { item, location };
  }
  async function balance(itemId: string, locationId: string, auth: AuthContext = owner) {
    const rows = await stockRepository.listBalances({ item_id: itemId, location_id: locationId }, auth);
    return rows[0]?.quantity;
  }

  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    await runAuthoritativeMigrate(connectionString, schema);
    await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    await applyRuntimeGrants(admin, role, schema);
  });
  afterAll(async () => { await runtime.end(); await admin.end(); });

  describe('Stock Location Master', () => {
    it('creates a store and a freezer under it through HTTP, with atomic immutable audit', async () => {
      const app = buildTestApp(owner);
      try {
        const created = await app.inject({ method: 'POST', url: '/api/inventory/locations', payload: { name: uniqueName('Main Store'), location_type: 'STORE' } });
        expect(created.statusCode).toBe(201);
        const parent = created.json();
        expect(parent).toMatchObject({ branch_id: 'branch-a', location_type: 'STORE', parent_id: null, active: true });
        const freezer = await app.inject({ method: 'POST', url: '/api/inventory/locations', payload: { name: uniqueName('Freezer'), location_type: 'FREEZER', parent_id: parent.id } });
        expect(freezer.statusCode).toBe(201);
        expect(freezer.json().parent_id).toBe(parent.id);
        const audit = await admin.query('SELECT * FROM stock_location_audit WHERE location_id=$1', [parent.id]);
        expect(audit.rows).toHaveLength(1);
        expect(audit.rows[0]).toMatchObject({ action: 'CREATE', before_data: null, actor_id: 'owner-a', branch_id: 'branch-a' });
      } finally { await app.close(); }
    });

    it('rejects a freezer under a freezer, under an inactive parent, or under another branch\'s location', async () => {
      const parent = await store();
      const freezer = await locationRepository.create({ name: uniqueName('F1'), location_type: 'FREEZER', parent_id: parent.id }, owner);
      await expect(locationRepository.create({ name: uniqueName('F2'), location_type: 'FREEZER', parent_id: freezer.id }, owner))
        .rejects.toMatchObject({ status: 400, code: 'INVALID_PARENT' });
      const otherBranchStore = await store(managerB);
      await expect(locationRepository.create({ name: uniqueName('F3'), location_type: 'FREEZER', parent_id: otherBranchStore.id }, owner))
        .rejects.toMatchObject({ status: 400, code: 'INVALID_PARENT' });
      const emptyStore = await store();
      await locationRepository.update(emptyStore.id, { active: false }, owner);
      await expect(locationRepository.create({ name: uniqueName('F4'), location_type: 'FREEZER', parent_id: emptyStore.id }, owner))
        .rejects.toMatchObject({ status: 400, code: 'INVALID_PARENT' });
    });

    it('enforces cross-branch parent and freezer-under-freezer rules in the database itself', async () => {
      const parentB = await store(managerB);
      await expect(admin.query(
        `INSERT INTO stock_location (id, branch_id, name, location_type, parent_id) VALUES ($1, 'branch-a', $2, 'FREEZER', $3)`,
        [randomUUID(), uniqueName('Sneaky'), parentB.id],
      )).rejects.toThrow();
      const parentA = await store();
      const freezer = await locationRepository.create({ name: uniqueName('F'), location_type: 'FREEZER', parent_id: parentA.id }, owner);
      await expect(admin.query(
        `INSERT INTO stock_location (id, branch_id, name, location_type, parent_id) VALUES ($1, 'branch-a', $2, 'FREEZER', $3)`,
        [randomUUID(), uniqueName('Nested'), freezer.id],
      )).rejects.toThrow(/STORE or KITCHEN/);
      await expect(admin.query(
        `INSERT INTO stock_location (id, branch_id, name, location_type) VALUES ($1, 'branch-a', $2, 'FREEZER')`,
        [randomUUID(), uniqueName('Orphan')],
      )).rejects.toThrow();
    });

    it('treats names case-insensitively/trimmed per branch, with exactly one winner under concurrency', async () => {
      const name = uniqueName('Cold Room');
      const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) =>
        locationRepository.create({ name: i % 2 ? `  ${name.toUpperCase()} ` : name, location_type: 'STORE' }, owner)));
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      for (const r of results.filter(r => r.status === 'rejected')) {
        expect((r as PromiseRejectedResult).reason).toMatchObject({ status: 409, code: 'DUPLICATE_LOCATION_NAME' });
      }
      // The same name is allowed in a different branch.
      await expect(locationRepository.create({ name, location_type: 'STORE' }, managerB)).resolves.toMatchObject({ branch_id: 'branch-b' });
    });

    it('lists and updates only within the caller\'s branch (no cross-branch read or write)', async () => {
      const a = await store(owner);
      const b = await store(managerB);
      const listA = await locationRepository.list(owner);
      const listB = await locationRepository.list(managerB);
      expect(listA.map(l => l.id)).toContain(a.id);
      expect(listA.map(l => l.id)).not.toContain(b.id);
      expect(listB.every(l => l.branch_id === 'branch-b')).toBe(true);
      await expect(locationRepository.update(a.id, { name: 'Hijack' }, managerB)).resolves.toBeNull();
      expect((await admin.query('SELECT name FROM stock_location WHERE id=$1', [a.id])).rows[0].name).toBe(a.name);
    });

    it('records rename in the audit trail with before/after snapshots', async () => {
      const loc = await store();
      const renamed = await locationRepository.update(loc.id, { name: uniqueName('Renamed') }, managerA);
      const audit = await admin.query('SELECT * FROM stock_location_audit WHERE location_id=$1 ORDER BY occurred_at', [loc.id]);
      expect(audit.rows).toHaveLength(2);
      expect(audit.rows[1]).toMatchObject({ action: 'UPDATE', actor_role: 'MANAGER', before_data: loc, after_data: renamed });
    });

    it('refuses deactivation while holding stock or having active freezers, and reactivating under an inactive parent', async () => {
      const { item, location } = await itemAndStore();
      const freezer = await locationRepository.create({ name: uniqueName('F'), location_type: 'FREEZER', parent_id: location.id }, owner);
      await stockRepository.createOpening({ item_id: item.id, location_id: freezer.id, quantity: '4' }, owner);
      await expect(locationRepository.update(freezer.id, { active: false }, owner)).rejects.toMatchObject({ status: 409, code: 'LOCATION_HAS_STOCK' });
      await expect(locationRepository.update(location.id, { active: false }, owner)).rejects.toMatchObject({ status: 409, code: 'LOCATION_HAS_ACTIVE_CHILDREN' });
      await stockRepository.createAdjustment({ item_id: item.id, location_id: freezer.id, quantity_delta: '-4', reason: 'Moved out before closing freezer' }, owner);
      await expect(locationRepository.update(freezer.id, { active: false }, owner)).resolves.toMatchObject({ active: false });
      await expect(locationRepository.update(location.id, { active: false }, owner)).resolves.toMatchObject({ active: false });
      await expect(locationRepository.update(freezer.id, { active: true }, owner)).rejects.toMatchObject({ status: 409, code: 'PARENT_INACTIVE' });
      await locationRepository.update(location.id, { active: true }, owner);
      await expect(locationRepository.update(freezer.id, { active: true }, owner)).resolves.toMatchObject({ active: true });
    });

    it('keeps identity, type and parent immutable and forbids delete at the database layer', async () => {
      const loc = await store();
      await expect(admin.query(`UPDATE stock_location SET location_type='KITCHEN' WHERE id=$1`, [loc.id])).rejects.toThrow(/immutable/);
      await expect(admin.query(`UPDATE stock_location SET branch_id='branch-b' WHERE id=$1`, [loc.id])).rejects.toThrow();
      await expect(admin.query('DELETE FROM stock_location WHERE id=$1', [loc.id])).rejects.toThrow(/immutable/);
      await expect(runtime.query('DELETE FROM stock_location WHERE id=$1', [loc.id])).rejects.toThrow(/permission denied/);
      await expect(runtime.query(`UPDATE stock_location SET location_type='KITCHEN' WHERE id=$1`, [loc.id])).rejects.toThrow(/permission denied/);
      await expect(admin.query('UPDATE stock_location_audit SET actor_id=$2 WHERE location_id=$1', [loc.id, 'x'])).rejects.toThrow(/immutable/);
    });
  });

  describe('Opening stock', () => {
    it('records opening stock through HTTP in base UOM, with atomic audit and a balance', async () => {
      const { item, location } = await itemAndStore();
      const app = buildTestApp(managerA);
      try {
        const created = await app.inject({ method: 'POST', url: '/api/inventory/stock/opening', payload: { item_id: item.id, location_id: location.id, quantity: '12.5' } });
        expect(created.statusCode).toBe(201);
        const movement = created.json();
        expect(movement).toMatchObject({ movement_type: 'OPENING', quantity_delta: '12.500000', reason: null });
        const audit = await admin.query('SELECT * FROM stock_movement_audit WHERE stock_movement_id=$1', [movement.id]);
        expect(audit.rows).toHaveLength(1);
        expect(audit.rows[0]).toMatchObject({ action: 'CREATE', before_data: null, after_data: movement, actor_role: 'MANAGER' });
        const balances = await app.inject({ method: 'GET', url: `/api/inventory/stock/balances?item_id=${item.id}` });
        expect(balances.json()).toEqual([{
          item_id: item.id, item_code: item.item_code, item_name: item.item_name, base_uom: item.base_uom,
          location_id: location.id, location_name: location.name, quantity: '12.500000',
        }]);
      } finally { await app.close(); }
    });

    it('allows exactly one opening per item+location, including under concurrency', async () => {
      const { item, location } = await itemAndStore();
      const results = await Promise.allSettled(Array.from({ length: 6 }, () =>
        stockRepository.createOpening({ item_id: item.id, location_id: location.id, quantity: '5' }, owner)));
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      for (const r of results.filter(r => r.status === 'rejected')) {
        expect((r as PromiseRejectedResult).reason).toMatchObject({ status: 409, code: 'OPENING_ALREADY_EXISTS' });
      }
      expect(await balance(item.id, location.id)).toBe('5.000000');
      // The same item may have its own opening in another location.
      const second = await store();
      await expect(stockRepository.createOpening({ item_id: item.id, location_id: second.id, quantity: '1' }, owner)).resolves.toBeTruthy();
    });

    it('returns null (404) for another branch\'s item or location, without writing anything', async () => {
      const { item, location } = await itemAndStore(owner);
      const b = await itemAndStore(managerB);
      await expect(stockRepository.createOpening({ item_id: b.item.id, location_id: location.id, quantity: '1' }, owner)).resolves.toBeNull();
      await expect(stockRepository.createOpening({ item_id: item.id, location_id: b.location.id, quantity: '1' }, owner)).resolves.toBeNull();
      await expect(stockRepository.createOpening({ item_id: item.id, location_id: location.id, quantity: '1' }, managerB)).resolves.toBeNull();
      await expect(stockRepository.createOpening({ item_id: randomUUID(), location_id: location.id, quantity: '1' }, owner)).resolves.toBeNull();
      expect((await admin.query('SELECT 1 FROM stock_movement WHERE item_id = ANY($1)', [[item.id, b.item.id]])).rows).toHaveLength(0);
    });

    it('rejects stock in an inactive location', async () => {
      const { item, location } = await itemAndStore();
      await locationRepository.update(location.id, { active: false }, owner);
      await expect(stockRepository.createOpening({ item_id: item.id, location_id: location.id, quantity: '1' }, owner))
        .rejects.toMatchObject({ status: 409, code: 'LOCATION_INACTIVE' });
    });

    it('refuses a cross-branch item/location pair in the database itself', async () => {
      const a = await itemAndStore(owner);
      const b = await itemAndStore(managerB);
      await expect(admin.query(
        `INSERT INTO stock_movement (id, item_id, location_id, movement_type, quantity_delta) VALUES ($1, $2, $3, 'OPENING', 1)`,
        [randomUUID(), a.item.id, b.location.id],
      )).rejects.toThrow(/same branch/);
    });
  });

  describe('Adjustments (corrections to opening stock)', () => {
    it('requires an opening entry first', async () => {
      const { item, location } = await itemAndStore();
      await expect(stockRepository.createAdjustment({ item_id: item.id, location_id: location.id, quantity_delta: '1', reason: 'x' }, owner))
        .rejects.toMatchObject({ status: 409, code: 'OPENING_REQUIRED' });
    });

    it('corrects opening stock without editing it: original row unchanged, balance = sum, reason kept', async () => {
      const { item, location } = await itemAndStore();
      const openingRow = await stockRepository.createOpening({ item_id: item.id, location_id: location.id, quantity: '10' }, owner);
      const app = buildTestApp(owner);
      try {
        const adj = await app.inject({ method: 'POST', url: '/api/inventory/stock/adjustments', payload: { item_id: item.id, location_id: location.id, quantity_delta: '-2.25', reason: ' Miscounted sacks ' } });
        expect(adj.statusCode).toBe(201);
        expect(adj.json()).toMatchObject({ movement_type: 'ADJUSTMENT', quantity_delta: '-2.250000', reason: 'Miscounted sacks' });
        expect(await balance(item.id, location.id)).toBe('7.750000');
        const stored = await admin.query('SELECT quantity_delta FROM stock_movement WHERE id=$1', [openingRow!.id]);
        expect(stored.rows[0].quantity_delta).toBe('10.000000');
        const history = await app.inject({ method: 'GET', url: `/api/inventory/stock/movements?item_id=${item.id}&location_id=${location.id}` });
        expect(history.json().map((m: { movement_type: string }) => m.movement_type).sort()).toEqual(['ADJUSTMENT', 'OPENING']);
      } finally { await app.close(); }
    });

    it('never lets the balance go below zero, even with concurrent adjustments', async () => {
      const { item, location } = await itemAndStore();
      await stockRepository.createOpening({ item_id: item.id, location_id: location.id, quantity: '10' }, owner);
      await expect(stockRepository.createAdjustment({ item_id: item.id, location_id: location.id, quantity_delta: '-10.000001', reason: 'x' }, owner))
        .rejects.toMatchObject({ status: 409, code: 'NEGATIVE_BALANCE' });
      const results = await Promise.allSettled(Array.from({ length: 5 }, () =>
        stockRepository.createAdjustment({ item_id: item.id, location_id: location.id, quantity_delta: '-3', reason: 'Concurrent correction' }, owner)));
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(3);
      for (const r of results.filter(r => r.status === 'rejected')) {
        expect((r as PromiseRejectedResult).reason).toMatchObject({ status: 409, code: 'NEGATIVE_BALANCE' });
      }
      expect(await balance(item.id, location.id)).toBe('1.000000');
      // Exactly to zero is allowed.
      await stockRepository.createAdjustment({ item_id: item.id, location_id: location.id, quantity_delta: '-1', reason: 'Last unit' }, owner);
      expect(await balance(item.id, location.id)).toBe('0.000000');
    });

    it('enforces opening-first and non-negative balance in the database itself', async () => {
      const { item, location } = await itemAndStore();
      await expect(admin.query(
        `INSERT INTO stock_movement (id, item_id, location_id, movement_type, quantity_delta, reason) VALUES ($1, $2, $3, 'ADJUSTMENT', 1, 'x')`,
        [randomUUID(), item.id, location.id],
      )).rejects.toThrow(/opening/);
      await stockRepository.createOpening({ item_id: item.id, location_id: location.id, quantity: '2' }, owner);
      await expect(admin.query(
        `INSERT INTO stock_movement (id, item_id, location_id, movement_type, quantity_delta, reason) VALUES ($1, $2, $3, 'ADJUSTMENT', -3, 'x')`,
        [randomUUID(), item.id, location.id],
      )).rejects.toThrow(/below zero/);
      await expect(admin.query(
        `INSERT INTO stock_movement (id, item_id, location_id, movement_type, quantity_delta) VALUES ($1, $2, $3, 'ADJUSTMENT', 1)`,
        [randomUUID(), item.id, location.id],
      )).rejects.toThrow();
    });

    it('keeps the ledger and its audit append-only (runtime has no UPDATE/DELETE; triggers block owner too)', async () => {
      const { item, location } = await itemAndStore();
      const row = await stockRepository.createOpening({ item_id: item.id, location_id: location.id, quantity: '3' }, owner);
      await expect(runtime.query('UPDATE stock_movement SET quantity_delta = 99 WHERE id=$1', [row!.id])).rejects.toThrow(/permission denied/);
      await expect(runtime.query('DELETE FROM stock_movement WHERE id=$1', [row!.id])).rejects.toThrow(/permission denied/);
      await expect(admin.query('UPDATE stock_movement SET quantity_delta = 99 WHERE id=$1', [row!.id])).rejects.toThrow(/immutable/);
      await expect(admin.query('DELETE FROM stock_movement WHERE id=$1', [row!.id])).rejects.toThrow(/immutable/);
      await expect(admin.query('DELETE FROM stock_movement_audit WHERE stock_movement_id=$1', [row!.id])).rejects.toThrow(/immutable/);
      await expect(admin.query('TRUNCATE stock_movement CASCADE')).rejects.toThrow(/immutable/);
    });
  });

  describe('Branch-scoped reads', () => {
    it('never shows another branch\'s balances or movements', async () => {
      const a = await itemAndStore(owner);
      const b = await itemAndStore(managerB);
      await stockRepository.createOpening({ item_id: a.item.id, location_id: a.location.id, quantity: '7' }, owner);
      await stockRepository.createOpening({ item_id: b.item.id, location_id: b.location.id, quantity: '9' }, managerB);
      const balancesB = await stockRepository.listBalances({}, managerB);
      const movementsB = await stockRepository.listMovements({}, managerB);
      expect(balancesB.map(r => r.item_id)).toContain(b.item.id);
      expect(balancesB.map(r => r.item_id)).not.toContain(a.item.id);
      expect(movementsB.map(r => r.item_id)).not.toContain(a.item.id);
      expect(await stockRepository.listBalances({ item_id: a.item.id }, managerB)).toEqual([]);
      expect(await stockRepository.listMovements({ location_id: a.location.id }, managerB)).toEqual([]);
    });
  });
});
