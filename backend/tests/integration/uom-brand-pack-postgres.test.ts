import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { runner } from 'node-pg-migrate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { AuthContext } from '../../src/auth/context.js';
import { PgItemRepository } from '../../src/inventory/persistence/pg-item-repository.js';
import { PgUomRepository } from '../../src/inventory/persistence/pg-uom-repository.js';
import { PgBrandRepository } from '../../src/inventory/persistence/pg-brand-repository.js';
import { PgPackVariantRepository } from '../../src/inventory/persistence/pg-pack-variant-repository.js';
import type { ItemInput } from '../../src/inventory/domain/item.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('TEST_DATABASE_URL is required for real PostgreSQL integration tests');

const SEEDED_UOM_NAMES = ['KG', 'GRAM', 'LITER', 'ML', 'PCS', 'PACKET', 'BOX', 'BAG', 'TIN', 'CARTON', 'CRATE', 'BOTTLE'];
const GENERIC_BRAND_NAME = 'Generic / No Brand';

async function migrateSchema(schemaSuffix: string, count?: number) {
  const schema = `inv_s02_test_${schemaSuffix}`;
  const admin = new Pool({ connectionString, options: `-c search_path=${schema}` });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const client = await admin.connect();
  try {
    const applied = await runner({
      dbClient: client, schema, migrationsSchema: schema, migrationsTable: 'pgmigrations',
      dir: resolve('migrations'), direction: 'up', log: () => undefined,
      ...(count === undefined ? {} : { count }),
    });
    return { schema, admin, applied };
  } finally { client.release(); }
}

describe('S-02 UOM/Brand/Pack Variant Masters (real PostgreSQL)', () => {
  const suffix = randomUUID().replaceAll('-', '');
  const schema = `inv_s02_test_${suffix}`;
  const role = `inv_s02_app_${suffix}`;
  const admin = new Pool({ connectionString, options: `-c search_path=${schema}` });
  const runtime = new Pool({ connectionString, options: `-c search_path=${schema} -c role=${role}`, max: 12 });
  const itemRepository = new PgItemRepository(runtime);
  const uomRepository = new PgUomRepository(runtime);
  const brandRepository = new PgBrandRepository(runtime);
  const packVariantRepository = new PgPackVariantRepository(runtime);
  const owner: AuthContext = { userId: 'owner-a', role: 'OWNER', branchId: 'branch-a' };
  const manager: AuthContext = { userId: 'manager-b', role: 'MANAGER', branchId: 'branch-b' };
  const itemInput: ItemInput = { item_name: 'Ghee', primary_item_type: 'RAW_MATERIAL', base_uom: 'kg', brand: 'Generic / No Brand' };

  beforeAll(async () => {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const client = await admin.connect();
    try {
      await runner({ dbClient: client, schema, migrationsSchema: schema, migrationsTable: 'pgmigrations',
        dir: resolve('migrations'), direction: 'up', log: () => undefined });
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

  describe('UOM Master', () => {
    it('seeds exactly the twelve approved UOMs with correct unit_type', async () => {
      const rows = (await admin.query('SELECT name, unit_type, active FROM uom_master ORDER BY name')).rows;
      expect(rows.map(r => r.name).sort()).toEqual([...SEEDED_UOM_NAMES].sort());
      expect(rows.every(r => r.active === true)).toBe(true);
      expect(rows.find(r => r.name === 'KG')).toMatchObject({ unit_type: 'WEIGHT' });
      expect(rows.find(r => r.name === 'PCS')).toMatchObject({ unit_type: 'COUNT' });
      expect(rows.find(r => r.name === 'TIN')).toMatchObject({ unit_type: 'PACKAGING' });
    });

    it('creates and edits a custom UOM through HTTP with atomic immutable audit snapshots', async () => {
      const app = buildApp({ repository: itemRepository, uomRepository, brandRepository, packVariantRepository, authProvider: async () => owner });
      try {
        const created = await app.inject({ method: 'POST', url: '/api/inventory/uoms', payload: { name: 'Sack', unit_type: 'PACKAGING' } });
        expect(created.statusCode).toBe(201);
        const uom = created.json();
        const edited = await app.inject({ method: 'PATCH', url: `/api/inventory/uoms/${uom.id}`, payload: { active: false } });
        expect(edited.statusCode).toBe(200);
        const audit = await admin.query('SELECT * FROM uom_audit WHERE uom_id=$1 ORDER BY occurred_at', [uom.id]);
        expect(audit.rows).toHaveLength(2);
        expect(audit.rows[0]).toMatchObject({ action: 'CREATE', before_data: null });
        expect(audit.rows[1].before_data).toEqual(uom);
      } finally { await app.close(); }
    });

    it('rejects duplicate names case-insensitively under concurrency, exactly one winner', async () => {
      const variants = ['Drum', 'drum', ' DRUM ', 'DrUm'];
      const results = await Promise.allSettled(variants.map(name => uomRepository.create({ name, unit_type: 'PACKAGING' }, owner)));
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(3);
      for (const r of rejected) expect((r as PromiseRejectedResult).reason).toMatchObject({ status: 409, code: 'DUPLICATE_UOM_NAME' });
    });

    it('enforces unit_type and non-blank name at the database layer', async () => {
      await expect(admin.query(`INSERT INTO uom_master (id, name, unit_type) VALUES ($1, 'Sachet', 'INVALID')`, [randomUUID()])).rejects.toThrow();
      await expect(admin.query(`INSERT INTO uom_master (id, name, unit_type) VALUES ($1, '', 'WEIGHT')`, [randomUUID()])).rejects.toThrow();
    });

    it('rejects delete/truncate and identity mutation on uom_master and uom_audit', async () => {
      const uom = await uomRepository.create({ name: 'Reel', unit_type: 'PACKAGING' }, owner);
      await expect(admin.query('DELETE FROM uom_master WHERE id=$1', [uom.id])).rejects.toThrow('immutable');
      await expect(admin.query('TRUNCATE uom_master CASCADE')).rejects.toThrow('immutable');
      await expect(admin.query('UPDATE uom_master SET id=$1 WHERE id=$2', [randomUUID(), uom.id])).rejects.toThrow('immutable');
      await expect(admin.query('UPDATE uom_audit SET actor_id=$1 WHERE uom_id=$2', ['other', uom.id])).rejects.toThrow('immutable');
      await expect(admin.query('DELETE FROM uom_audit WHERE uom_id=$1', [uom.id])).rejects.toThrow('immutable');
      await expect(admin.query('TRUNCATE uom_audit')).rejects.toThrow('immutable');
    });
  });

  describe('Brand Master', () => {
    it('seeds the approved non-branded sentinel', async () => {
      const rows = (await admin.query('SELECT name, active FROM brand_master WHERE name=$1', [GENERIC_BRAND_NAME])).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ active: true });
    });

    it('creates and edits a brand through HTTP with atomic immutable audit snapshots', async () => {
      const app = buildApp({ repository: itemRepository, uomRepository, brandRepository, packVariantRepository, authProvider: async () => owner });
      try {
        const created = await app.inject({ method: 'POST', url: '/api/inventory/brands', payload: { name: 'Brand Z' } });
        expect(created.statusCode).toBe(201);
        const brand = created.json();
        const edited = await app.inject({ method: 'PATCH', url: `/api/inventory/brands/${brand.id}`, payload: { active: false } });
        expect(edited.statusCode).toBe(200);
        const audit = await admin.query('SELECT * FROM brand_audit WHERE brand_id=$1 ORDER BY occurred_at', [brand.id]);
        expect(audit.rows).toHaveLength(2);
      } finally { await app.close(); }
    });

    it('rejects duplicate names case-insensitively under concurrency, exactly one winner', async () => {
      const variants = ['Brand Q', 'brand q', ' BRAND Q ', 'BrAnD q'];
      const results = await Promise.allSettled(variants.map(name => brandRepository.create({ name }, owner)));
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.filter(r => r.status === 'rejected');
      expect(rejected).toHaveLength(3);
      for (const r of rejected) expect((r as PromiseRejectedResult).reason).toMatchObject({ status: 409, code: 'DUPLICATE_BRAND_NAME' });
    });

    it('rejects delete/truncate and identity mutation on brand_master and brand_audit', async () => {
      const brand = await brandRepository.create({ name: 'Brand Immutable' }, owner);
      await expect(admin.query('DELETE FROM brand_master WHERE id=$1', [brand.id])).rejects.toThrow('immutable');
      await expect(admin.query('TRUNCATE brand_master CASCADE')).rejects.toThrow('immutable');
      await expect(admin.query('UPDATE brand_audit SET actor_id=$1 WHERE brand_id=$2', ['other', brand.id])).rejects.toThrow('immutable');
    });
  });

  describe('Pack Variant', () => {
    it('creates and edits through HTTP, scoped to the authorized branch item, with atomic audit', async () => {
      const app = buildApp({ repository: itemRepository, uomRepository, brandRepository, packVariantRepository, authProvider: async () => owner });
      try {
        const item = await itemRepository.create(itemInput, owner);
        const brand = await brandRepository.create({ name: 'Ghee Brand A' }, owner);
        const tin = (await admin.query(`SELECT id FROM uom_master WHERE name='TIN'`)).rows[0];
        const created = await app.inject({
          method: 'POST', url: '/api/inventory/pack-variants',
          payload: { item_id: item.id, brand_id: brand.id, pack_uom_id: tin.id, conversion_factor: '16' },
        });
        expect(created.statusCode).toBe(201);
        const variant = created.json();
        expect(variant.conversion_factor).toBe('16.000000');
        const edited = await app.inject({ method: 'PATCH', url: `/api/inventory/pack-variants/${variant.id}`, payload: { conversion_factor: '5' } });
        expect(edited.statusCode).toBe(200);
        const audit = await admin.query('SELECT * FROM pack_variant_audit WHERE pack_variant_id=$1 ORDER BY occurred_at', [variant.id]);
        expect(audit.rows).toHaveLength(2);
      } finally { await app.close(); }
    });

    it('allows multiple pack sizes of the same item/brand/pack UOM, distinguished by conversion_factor', async () => {
      const item = await itemRepository.create(itemInput, owner);
      const brand = await brandRepository.create({ name: 'Multi Size Brand' }, owner);
      const tin = (await admin.query(`SELECT id FROM uom_master WHERE name='TIN'`)).rows[0];
      const small = await packVariantRepository.create({ item_id: item.id, brand_id: brand.id, pack_uom_id: tin.id, conversion_factor: '5' }, owner);
      const large = await packVariantRepository.create({ item_id: item.id, brand_id: brand.id, pack_uom_id: tin.id, conversion_factor: '16' }, owner);
      expect(small?.id).not.toBe(large?.id);
    });

    it('rejects an exact duplicate item/brand/pack-uom/conversion_factor combination', async () => {
      const item = await itemRepository.create(itemInput, owner);
      const brand = await brandRepository.create({ name: 'Exact Dup Brand' }, owner);
      const tin = (await admin.query(`SELECT id FROM uom_master WHERE name='TIN'`)).rows[0];
      const payload = { item_id: item.id, brand_id: brand.id, pack_uom_id: tin.id, conversion_factor: '16' };
      await packVariantRepository.create(payload, owner);
      await expect(packVariantRepository.create(payload, owner)).rejects.toMatchObject({ status: 409, code: 'DUPLICATE_PACK_VARIANT' });
    });

    it('rejects references to a nonexistent brand or pack UOM', async () => {
      const item = await itemRepository.create(itemInput, owner);
      const tin = (await admin.query(`SELECT id FROM uom_master WHERE name='TIN'`)).rows[0];
      await expect(packVariantRepository.create({ item_id: item.id, brand_id: randomUUID(), pack_uom_id: tin.id, conversion_factor: '1' }, owner))
        .rejects.toMatchObject({ status: 400, code: 'INVALID_REFERENCE' });
      const brand = await brandRepository.create({ name: 'Ref Check Brand' }, owner);
      await expect(packVariantRepository.create({ item_id: item.id, brand_id: brand.id, pack_uom_id: randomUUID(), conversion_factor: '1' }, owner))
        .rejects.toMatchObject({ status: 400, code: 'INVALID_REFERENCE' });
    });

    it('denies creation for an item that belongs to a different branch, without leaking existence', async () => {
      const item = await itemRepository.create(itemInput, owner); // branch-a
      const brand = await brandRepository.create({ name: 'Cross Branch Brand' }, owner);
      const tin = (await admin.query(`SELECT id FROM uom_master WHERE name='TIN'`)).rows[0];
      const result = await packVariantRepository.create({ item_id: item.id, brand_id: brand.id, pack_uom_id: tin.id, conversion_factor: '1' }, manager); // branch-b
      expect(result).toBeNull();
    });

    it('denies edit for a pack variant whose item belongs to a different branch', async () => {
      const item = await itemRepository.create(itemInput, owner);
      const brand = await brandRepository.create({ name: 'Cross Branch Edit Brand' }, owner);
      const tin = (await admin.query(`SELECT id FROM uom_master WHERE name='TIN'`)).rows[0];
      const variant = await packVariantRepository.create({ item_id: item.id, brand_id: brand.id, pack_uom_id: tin.id, conversion_factor: '1' }, owner);
      expect(await packVariantRepository.update(variant!.id, { conversion_factor: '2' }, manager)).toBeNull();
    });

    it('rejects conversion_factor <= 0 at the database layer', async () => {
      const item = await itemRepository.create(itemInput, owner);
      const brand = await brandRepository.create({ name: 'Zero Factor Brand' }, owner);
      const tin = (await admin.query(`SELECT id FROM uom_master WHERE name='TIN'`)).rows[0];
      await expect(admin.query(
        `INSERT INTO pack_variant (id, item_id, brand_id, pack_uom_id, conversion_factor) VALUES ($1,$2,$3,$4,0)`,
        [randomUUID(), item.id, brand.id, tin.id],
      )).rejects.toThrow();
    });

    it('rejects redefinition of item/brand/pack UOM identity, and audit mutation, even with the schema-owner connection', async () => {
      const item = await itemRepository.create(itemInput, owner);
      const otherItem = await itemRepository.create(itemInput, owner);
      const brand = await brandRepository.create({ name: 'Immutable Identity Brand' }, owner);
      const tin = (await admin.query(`SELECT id FROM uom_master WHERE name='TIN'`)).rows[0];
      const variant = await packVariantRepository.create({ item_id: item.id, brand_id: brand.id, pack_uom_id: tin.id, conversion_factor: '1' }, owner);
      await expect(admin.query('UPDATE pack_variant SET item_id=$1 WHERE id=$2', [otherItem.id, variant!.id])).rejects.toThrow('immutable');
      await expect(admin.query('DELETE FROM pack_variant WHERE id=$1', [variant!.id])).rejects.toThrow('immutable');
      await expect(admin.query('TRUNCATE pack_variant CASCADE')).rejects.toThrow('immutable');
      await expect(admin.query('UPDATE pack_variant_audit SET actor_id=$1 WHERE pack_variant_id=$2', ['other', variant!.id])).rejects.toThrow('immutable');
    });
  });

  describe('Zero-Pack-Variant items and S-01 compatibility', () => {
    it('keeps an item with no pack variants fully valid', async () => {
      const item = await itemRepository.create(itemInput, owner);
      const variants = await admin.query('SELECT count(*)::int AS n FROM pack_variant WHERE item_id=$1', [item.id]);
      expect(variants.rows[0].n).toBe(0);
      const stillThere = await admin.query('SELECT * FROM item_master WHERE id=$1', [item.id]);
      expect(stillThere.rows).toHaveLength(1);
    });
  });

  describe('Runtime privilege limits for new tables', () => {
    it('denies destructive operations on the new tables to the runtime role', async () => {
      await expect(runtime.query('DELETE FROM uom_master')).rejects.toThrow('permission denied');
      await expect(runtime.query('DELETE FROM brand_master')).rejects.toThrow('permission denied');
      await expect(runtime.query('DELETE FROM pack_variant')).rejects.toThrow('permission denied');
      await expect(runtime.query('TRUNCATE uom_audit')).rejects.toThrow('permission denied');
      await expect(runtime.query('TRUNCATE brand_audit')).rejects.toThrow('permission denied');
      await expect(runtime.query('TRUNCATE pack_variant_audit')).rejects.toThrow('permission denied');
    });
  });
});

describe('S-02 base_uom migration safety refinement (isolated schemas)', () => {
  it('backfills existing S-01 items to the matching seeded UOM, case-insensitively and trimmed', async () => {
    const { schema, admin } = await migrateSchema(`${randomUUID().replaceAll('-', '')}_ok`, 1);
    try {
      const fixtures = [
        { id: randomUUID(), base_uom: 'kg' },
        { id: randomUUID(), base_uom: ' KG ' },
        { id: randomUUID(), base_uom: 'Pcs' },
      ];
      for (const fixture of fixtures) {
        await admin.query(
          `INSERT INTO item_master (id, branch_id, item_name, primary_item_type, base_uom, brand)
           VALUES ($1, 'branch-a', 'Fixture', 'RAW_MATERIAL', $2, 'Generic / No Brand')`,
          [fixture.id, fixture.base_uom],
        );
      }
      const client = await admin.connect();
      try {
        await runner({ dbClient: client, schema, migrationsSchema: schema, migrationsTable: 'pgmigrations',
          dir: resolve('migrations'), direction: 'up', log: () => undefined });
      } finally { client.release(); }

      const rows = (await admin.query(
        `SELECT im.id, im.base_uom_legacy_text, um.name AS resolved_name
         FROM item_master im JOIN uom_master um ON um.id = im.base_uom_id
         WHERE im.id = ANY($1)`,
        [fixtures.map(f => f.id)],
      )).rows;
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.resolved_name).toBe(row.base_uom_legacy_text.trim().toUpperCase());
      }
    } finally {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  });

  it('halts safely, without guessing unit_type, when a legacy base_uom has no match — and rolls back atomically', async () => {
    const { schema, admin } = await migrateSchema(`${randomUUID().replaceAll('-', '')}_fail`, 1);
    try {
      await admin.query(
        `INSERT INTO item_master (id, branch_id, item_name, primary_item_type, base_uom, brand)
         VALUES ($1, 'branch-a', 'Mystery Item', 'RAW_MATERIAL', 'Nonexistent Unit XYZ', 'Generic / No Brand')`,
        [randomUUID()],
      );
      const client = await admin.connect();
      let caught: unknown;
      try {
        await runner({ dbClient: client, schema, migrationsSchema: schema, migrationsTable: 'pgmigrations',
          dir: resolve('migrations'), direction: 'up', log: () => undefined });
      } catch (error) {
        caught = error;
        // node-pg-migrate leaves the failed migration's transaction aborted on
        // this connection; reset it before the pool can hand the connection
        // back out for the assertions below.
        await client.query('ROLLBACK').catch(() => undefined);
      } finally { client.release(); }

      expect(caught).toBeDefined();
      expect(String((caught as Error).message)).toContain('Nonexistent Unit XYZ');
      expect(String((caught as Error).message)).toMatch(/never.*guess/i);

      // Atomic rollback: nothing from the failed S-02 migration should exist.
      const tables = (await admin.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema=$1 ORDER BY table_name`, [schema],
      )).rows.map(r => r.table_name);
      expect(tables).not.toContain('uom_master');
      expect(tables).not.toContain('brand_master');
      expect(tables).not.toContain('pack_variant');
      const columns = (await admin.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='item_master'`, [schema],
      )).rows.map(r => r.column_name);
      expect(columns).toContain('base_uom');
      expect(columns).not.toContain('base_uom_id');
    } finally {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  });
});
