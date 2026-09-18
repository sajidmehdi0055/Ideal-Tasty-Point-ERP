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
import { applyRuntimeGrants } from './helpers/runtime-grants.js';

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
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
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
    // Single authoritative grant source (MINOR 2): executes the actual shipped
    // scripts/runtime-grants.sql rather than a hand-duplicated grant list, so
    // tests and deployment cannot silently drift apart. Every test below that
    // exercises create/update through itemRepository/uomRepository/
    // brandRepository/packVariantRepository (all built on `runtime`, which
    // only has these shipped grants) is itself proof the shipped grants are
    // sufficient for real application use; the dedicated test in "Runtime
    // privilege limits" below proves they are not more than sufficient.
    await applyRuntimeGrants(admin, role, schema);
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

    it('MINOR 3: races many identical concurrent create attempts -- exactly one succeeds, the DB unique constraint is the final race-safe protection', async () => {
      const item = await itemRepository.create(itemInput, owner);
      const brand = await brandRepository.create({ name: 'Race Condition Brand' }, owner);
      const tin = (await admin.query(`SELECT id FROM uom_master WHERE name='TIN'`)).rows[0];
      const payload = { item_id: item.id, brand_id: brand.id, pack_uom_id: tin.id, conversion_factor: '7' };
      const attempts = 12;
      const results = await Promise.allSettled(Array.from({ length: attempts }, () => packVariantRepository.create(payload, owner)));
      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(attempts - 1);
      for (const r of rejected) expect(r.reason).toMatchObject({ status: 409, code: 'DUPLICATE_PACK_VARIANT' });
      const stored = await admin.query(
        'SELECT count(*)::int AS n FROM pack_variant WHERE item_id=$1 AND brand_id=$2 AND pack_uom_id=$3 AND conversion_factor=$4',
        [item.id, brand.id, tin.id, '7'],
      );
      expect(stored.rows[0].n).toBe(1);
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

  describe('BLOCKER 1: Pack Variant list is branch-isolated', () => {
    it('GET/list only ever returns the caller branch\'s pack variants, never another branch\'s', async () => {
      const app = buildApp({ repository: itemRepository, uomRepository, brandRepository, packVariantRepository, authProvider: async () => owner });
      try {
        const tin = (await admin.query(`SELECT id FROM uom_master WHERE name='TIN'`)).rows[0];
        const brand = await brandRepository.create({ name: 'Cross Branch List Brand' }, owner);

        // Branch A: item + pack variant, created/owned by `owner` (branch-a).
        const itemA = await itemRepository.create(itemInput, owner);
        const variantA = await packVariantRepository.create(
          { item_id: itemA.id, brand_id: brand.id, pack_uom_id: tin.id, conversion_factor: '11' }, owner,
        );

        // Branch B: a *separate* item created directly under `manager` (branch-b),
        // with its own pack variant -- proves the leak scenario the review found.
        const itemB = await itemRepository.create(itemInput, manager);
        const variantB = await packVariantRepository.create(
          { item_id: itemB.id, brand_id: brand.id, pack_uom_id: tin.id, conversion_factor: '22' }, manager,
        );
        expect(variantB).not.toBeNull();

        // Authenticate as Owner for Branch A and list.
        const response = await app.inject({ method: 'GET', url: '/api/inventory/pack-variants' });
        expect(response.statusCode).toBe(200);
        const listed = response.json<Array<{ id: string; item_id: string }>>();
        const listedIds = listed.map(v => v.id);

        expect(listedIds).toContain(variantA!.id);
        expect(listedIds).not.toContain(variantB!.id);
        expect(listed.every(v => v.item_id !== itemB.id)).toBe(true);
      } finally { await app.close(); }
    });

    it('repository.list itself never returns another branch\'s pack variants, independent of the HTTP layer', async () => {
      const tin = (await admin.query(`SELECT id FROM uom_master WHERE name='TIN'`)).rows[0];
      const brand = await brandRepository.create({ name: 'Repo Level List Brand' }, owner);
      const itemA = await itemRepository.create(itemInput, owner);
      const itemB = await itemRepository.create(itemInput, manager);
      const variantA = await packVariantRepository.create({ item_id: itemA.id, brand_id: brand.id, pack_uom_id: tin.id, conversion_factor: '33' }, owner);
      const variantB = await packVariantRepository.create({ item_id: itemB.id, brand_id: brand.id, pack_uom_id: tin.id, conversion_factor: '44' }, manager);

      const forOwner = await packVariantRepository.list(owner);
      const forManager = await packVariantRepository.list(manager);

      expect(forOwner.map(v => v.id)).toContain(variantA!.id);
      expect(forOwner.map(v => v.id)).not.toContain(variantB!.id);
      expect(forManager.map(v => v.id)).toContain(variantB!.id);
      expect(forManager.map(v => v.id)).not.toContain(variantA!.id);
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

    it('MINOR 2: the shipped runtime-grants.sql alone is sufficient for a full create+edit cycle on every S-02 entity', async () => {
      // `runtime` in this file carries ONLY the grants applied via
      // scripts/runtime-grants.sql (see beforeAll) -- no test-only extra
      // grants exist. A full, real, end-to-end cycle succeeding here is
      // direct proof the shipped file is deployable as-is.
      const uom = await uomRepository.create({ name: 'Grant Proof Uom', unit_type: 'PACKAGING' }, owner);
      await uomRepository.update(uom.id, { active: false }, owner);
      const brand = await brandRepository.create({ name: 'Grant Proof Brand' }, owner);
      await brandRepository.update(brand.id, { active: false }, owner);
      const item = await itemRepository.create(itemInput, owner);
      await itemRepository.update(item.id, { item_name: 'Grant Proof Item' }, owner);
      const tin = (await admin.query(`SELECT id FROM uom_master WHERE name='TIN'`)).rows[0];
      const variant = await packVariantRepository.create(
        { item_id: item.id, brand_id: brand.id, pack_uom_id: tin.id, conversion_factor: '9' }, owner,
      );
      await packVariantRepository.update(variant!.id, { active: false }, owner);
      const list = await packVariantRepository.list(owner);
      expect(list.map(v => v.id)).toContain(variant!.id);
    });
  });
});

describe('S-02 base_uom migration safety refinement (split migrations, isolated schemas)', () => {
  it('Migration A (UOM/Brand) commits independently and Migration B backfills existing S-01 items, case-insensitively and trimmed', async () => {
    // Apply S-01 + Migration A only (2 of 3 files).
    const { schema, admin } = await migrateSchema(`${randomUUID().replaceAll('-', '')}_ok`, 2);
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
      // Apply the remaining migration (Migration B).
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

  it('BLOCKER 2: halts safely without guessing unit_type when a legacy base_uom has no match, while Migration A (uom_master/brand_master) stays committed', async () => {
    const { schema, admin } = await migrateSchema(`${randomUUID().replaceAll('-', '')}_fail`, 2);
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
        await client.query('ROLLBACK').catch(() => undefined);
      } finally { client.release(); }

      expect(caught).toBeDefined();
      expect(String((caught as Error).message)).toContain('Nonexistent Unit XYZ');
      expect(String((caught as Error).message)).toMatch(/never.*guess/i);

      // Migration A already committed as its own, separate, prior migration --
      // only Migration B's own transaction rolled back.
      const uomCount = await admin.query('SELECT count(*)::int AS n FROM uom_master');
      expect(uomCount.rows[0].n).toBe(12);
      const brandCount = await admin.query(`SELECT count(*)::int AS n FROM brand_master WHERE name=$1`, [GENERIC_BRAND_NAME]);
      expect(brandCount.rows[0].n).toBe(1);

      // Migration B's own objects/changes must NOT exist.
      const tables = (await admin.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema=$1 ORDER BY table_name`, [schema],
      )).rows.map(r => r.table_name);
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

  it('BLOCKER 2: complete executable recovery -- classify the missing UOM explicitly, re-run Migration B, backfill succeeds', async () => {
    // Step 1: apply Migration A (and S-01).
    const { schema, admin } = await migrateSchema(`${randomUUID().replaceAll('-', '')}_recover`, 2);
    try {
      // Step 2: prepare a legacy item containing an unknown UOM.
      const itemId = randomUUID();
      await admin.query(
        `INSERT INTO item_master (id, branch_id, item_name, primary_item_type, base_uom, brand)
         VALUES ($1, 'branch-a', 'Recoverable Item', 'RAW_MATERIAL', 'Firkin', 'Generic / No Brand')`,
        [itemId],
      );

      // Step 3: run Migration B and confirm safe halt.
      const firstAttempt = await admin.connect();
      let haltError: unknown;
      try {
        await runner({ dbClient: firstAttempt, schema, migrationsSchema: schema, migrationsTable: 'pgmigrations',
          dir: resolve('migrations'), direction: 'up', log: () => undefined });
      } catch (error) {
        haltError = error;
        await firstAttempt.query('ROLLBACK').catch(() => undefined);
      } finally { firstAttempt.release(); }
      expect(haltError).toBeDefined();
      expect(String((haltError as Error).message)).toContain('Firkin');

      // Step 4: confirm uom_master still exists (Migration A untouched).
      const uomCountAfterHalt = await admin.query('SELECT count(*)::int AS n FROM uom_master');
      expect(uomCountAfterHalt.rows[0].n).toBe(12);

      // Step 5: add the custom UOM explicitly with a chosen unit_type.
      const firkinId = randomUUID();
      await admin.query(`INSERT INTO uom_master (id, name, unit_type) VALUES ($1, 'Firkin', 'PACKAGING')`, [firkinId]);

      // Step 6: rerun Migration B.
      const secondAttempt = await admin.connect();
      let secondApplied: Array<{ name: string }> = [];
      try {
        secondApplied = await runner({ dbClient: secondAttempt, schema, migrationsSchema: schema, migrationsTable: 'pgmigrations',
          dir: resolve('migrations'), direction: 'up', log: () => undefined });
      } finally { secondAttempt.release(); }
      expect(secondApplied.map(m => m.name)).toEqual(['202609180002_inventory_s02_item_base_uom_pack_variant']);

      // Step 7: confirm successful backfill, FK, preserved legacy text, and valid Item behavior.
      const resolved = await admin.query(
        `SELECT im.base_uom_id, im.base_uom_legacy_text, um.name AS resolved_name
         FROM item_master im JOIN uom_master um ON um.id = im.base_uom_id WHERE im.id = $1`,
        [itemId],
      );
      expect(resolved.rows).toHaveLength(1);
      expect(resolved.rows[0]).toMatchObject({ base_uom_id: firkinId, base_uom_legacy_text: 'Firkin', resolved_name: 'Firkin' });

      const fkCheck = await admin.query(
        `SELECT 1 FROM pg_constraint WHERE conname = 'item_master_base_uom_fk' AND conrelid = 'item_master'::regclass`,
      );
      expect(fkCheck.rows).toHaveLength(1);

      // Valid Item behavior: the recovered item is usable through the repository like any other.
      // Roles are cluster-wide (not dropped by DROP SCHEMA), so the name must
      // be genuinely unique per run, and it is explicitly dropped afterward.
      const runtimeRole = `inv_s02_recover_app_${randomUUID().replaceAll('-', '')}`;
      await admin.query(`CREATE ROLE ${runtimeRole} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
      try {
        await applyRuntimeGrants(admin, runtimeRole, schema);
        const runtime = new Pool({ connectionString, options: `-c search_path=${schema} -c role=${runtimeRole}` });
        try {
          const repository = new PgItemRepository(runtime);
          const owner: AuthContext = { userId: 'owner-a', role: 'OWNER', branchId: 'branch-a' };
          const updated = await repository.update(itemId, { item_name: 'Recovered and usable' }, owner);
          expect(updated).toMatchObject({ item_name: 'Recovered and usable', base_uom: 'Firkin' });
        } finally { await runtime.end(); }
      } finally {
        // DROP ROLE alone fails while the role still holds granted privileges;
        // DROP OWNED BY revokes them (and drops anything it owns) first.
        await admin.query(`DROP OWNED BY ${runtimeRole}`);
        await admin.query(`DROP ROLE ${runtimeRole}`);
      }
    } finally {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  });
});
