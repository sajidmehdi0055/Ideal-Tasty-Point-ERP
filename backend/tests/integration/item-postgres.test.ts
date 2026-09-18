import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { AuthContext } from '../../src/auth/context.js';
import type { Item, ItemInput } from '../../src/inventory/domain/item.js';
import { PgItemRepository } from '../../src/inventory/persistence/pg-item-repository.js';
import { PgUomRepository } from '../../src/inventory/persistence/pg-uom-repository.js';
import { PgBrandRepository } from '../../src/inventory/persistence/pg-brand-repository.js';
import { PgPackVariantRepository } from '../../src/inventory/persistence/pg-pack-variant-repository.js';

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
const owner: AuthContext = { userId: 'owner-a', role: 'OWNER', branchId: 'branch-a' };
const manager: AuthContext = { userId: 'manager-b', role: 'MANAGER', branchId: 'branch-b' };
const input: ItemInput = { item_name: 'Rice', primary_item_type: 'RAW_MATERIAL', base_uom: 'kg', brand: 'Generic / No Brand' };
const KG_UOM_ID = 'a0000000-0000-4000-8000-000000000001';
let migrationsApplied = 0;
let migrationsRepeated = -1;

beforeAll(async () => {
  // Unique NEW schema/NOLOGIN role only. Never truncate or drop pre-existing data.
  await admin.query(`CREATE SCHEMA ${schema}`);
  const client = await admin.connect();
  try {
    const options = { dbClient: client, schema, migrationsSchema: schema, migrationsTable: 'pgmigrations',
      dir: resolve('migrations'), direction: 'up' as const, log: () => undefined };
    migrationsApplied = (await runner(options)).length;
    migrationsRepeated = (await runner(options)).length;
  } finally { client.release(); }
  await admin.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
  await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
  await admin.query(`GRANT SELECT ON item_master, inventory_audit, uom_master, brand_master, pack_variant TO ${role}`);
  await admin.query(`GRANT INSERT (id, branch_id, item_name, primary_item_type, base_uom_id, brand),
    UPDATE (item_name, primary_item_type, base_uom_id, brand, updated_at) ON item_master TO ${role}`);
  await admin.query(`GRANT INSERT ON inventory_audit TO ${role}`);
  await admin.query(`GRANT USAGE ON SEQUENCE item_code_seq TO ${role}`);
  await admin.query(`GRANT INSERT (id, name, unit_type), UPDATE (name, unit_type, active, updated_at) ON uom_master TO ${role}`);
  await admin.query(`GRANT INSERT ON uom_audit TO ${role}`);
  await admin.query(`GRANT INSERT (id, name), UPDATE (name, active, updated_at) ON brand_master TO ${role}`);
  await admin.query(`GRANT INSERT ON brand_audit TO ${role}`);
  await admin.query(`GRANT INSERT (id, item_id, brand_id, pack_uom_id, conversion_factor),
    UPDATE (conversion_factor, active, updated_at) ON pack_variant TO ${role}`);
  await admin.query(`GRANT INSERT ON pack_variant_audit TO ${role}`);
});

afterAll(async () => { await runtime.end(); await admin.end(); });

function buildTestApp(auth: AuthContext) {
  return buildApp({ repository, uomRepository, brandRepository, packVariantRepository, authProvider: async () => auth });
}

describe('S-01 real PostgreSQL migration and persistence', () => {
  it('applies SQL migrations once and re-running is a no-op', () => {
    expect(migrationsApplied).toBe(2);
    expect(migrationsRepeated).toBe(0);
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
