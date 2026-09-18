-- Up Migration

-- 1. UOM Master
CREATE TABLE uom_master (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  unit_type text NOT NULL CHECK (unit_type IN ('WEIGHT', 'VOLUME', 'COUNT', 'PACKAGING')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX uom_master_name_unique ON uom_master (lower(btrim(name)));

CREATE TABLE uom_audit (
  id uuid PRIMARY KEY,
  uom_id uuid NOT NULL REFERENCES uom_master(id) ON DELETE RESTRICT,
  branch_id text NOT NULL CHECK (length(btrim(branch_id)) > 0),
  actor_id text NOT NULL CHECK (length(btrim(actor_id)) > 0),
  actor_role text NOT NULL CHECK (actor_role IN ('OWNER', 'MANAGER')),
  action text NOT NULL CHECK (action IN ('CREATE', 'UPDATE')),
  before_data jsonb,
  after_data jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((action = 'CREATE' AND before_data IS NULL) OR
         (action = 'UPDATE' AND before_data IS NOT NULL))
);
CREATE INDEX uom_audit_uom_idx ON uom_audit (uom_id, occurred_at);

-- Seed common UOMs with fixed UUIDs (reproducible across environments).
INSERT INTO uom_master (id, name, unit_type) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'KG', 'WEIGHT'),
  ('a0000000-0000-4000-8000-000000000002', 'GRAM', 'WEIGHT'),
  ('a0000000-0000-4000-8000-000000000003', 'LITER', 'VOLUME'),
  ('a0000000-0000-4000-8000-000000000004', 'ML', 'VOLUME'),
  ('a0000000-0000-4000-8000-000000000005', 'PCS', 'COUNT'),
  ('a0000000-0000-4000-8000-000000000006', 'PACKET', 'PACKAGING'),
  ('a0000000-0000-4000-8000-000000000007', 'BOX', 'PACKAGING'),
  ('a0000000-0000-4000-8000-000000000008', 'BAG', 'PACKAGING'),
  ('a0000000-0000-4000-8000-000000000009', 'TIN', 'PACKAGING'),
  ('a0000000-0000-4000-8000-00000000000a', 'CARTON', 'PACKAGING'),
  ('a0000000-0000-4000-8000-00000000000b', 'CRATE', 'PACKAGING'),
  ('a0000000-0000-4000-8000-00000000000c', 'BOTTLE', 'PACKAGING');

-- 2. Brand Master
CREATE TABLE brand_master (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX brand_master_name_unique ON brand_master (lower(btrim(name)));

CREATE TABLE brand_audit (
  id uuid PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES brand_master(id) ON DELETE RESTRICT,
  branch_id text NOT NULL CHECK (length(btrim(branch_id)) > 0),
  actor_id text NOT NULL CHECK (length(btrim(actor_id)) > 0),
  actor_role text NOT NULL CHECK (actor_role IN ('OWNER', 'MANAGER')),
  action text NOT NULL CHECK (action IN ('CREATE', 'UPDATE')),
  before_data jsonb,
  after_data jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((action = 'CREATE' AND before_data IS NULL) OR
         (action = 'UPDATE' AND before_data IS NOT NULL))
);
CREATE INDEX brand_audit_brand_idx ON brand_audit (brand_id, occurred_at);

-- Seed the approved non-branded sentinel (ADR-0003), so Pack Variant's brand_id
-- can stay NOT NULL without inventing a nullable-brand concept.
INSERT INTO brand_master (id, name) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'Generic / No Brand');

-- 3. Item Base UOM migration (text -> FK), with a safety refinement:
-- never guess unit_type for an unmatched legacy value. Case-insensitive/trimmed
-- match against uom_master; any unmatched value halts the migration with a
-- clear list, before NOT NULL/FK are ever enforced.
ALTER TABLE item_master ADD COLUMN base_uom_id uuid;

UPDATE item_master im
SET base_uom_id = um.id
FROM uom_master um
WHERE lower(btrim(im.base_uom)) = lower(btrim(um.name));

DO $$
DECLARE
  unmatched_count integer;
  unmatched_list text;
BEGIN
  SELECT count(DISTINCT base_uom), string_agg(DISTINCT base_uom, ', ' ORDER BY base_uom)
    INTO unmatched_count, unmatched_list
    FROM item_master
    WHERE base_uom_id IS NULL;

  IF unmatched_count > 0 THEN
    RAISE EXCEPTION 'S-02 base_uom migration halted: % unmatched legacy base_uom value(s) with no case-insensitive match in uom_master: [%]. Add each as an explicit uom_master row with a deliberately chosen unit_type (never guessed), then re-run this migration.',
      unmatched_count, unmatched_list;
  END IF;
END $$;

ALTER TABLE item_master ALTER COLUMN base_uom_id SET NOT NULL;
ALTER TABLE item_master ADD CONSTRAINT item_master_base_uom_fk
  FOREIGN KEY (base_uom_id) REFERENCES uom_master(id) ON DELETE RESTRICT;
CREATE INDEX item_master_base_uom_idx ON item_master (base_uom_id);

-- Preserve the original free text as an unused, deprecated safety-net column
-- for one release cycle. No destructive drop in S-02; a later migration may
-- drop it once the backfill is verified against real (non-test) data.
ALTER TABLE item_master RENAME COLUMN base_uom TO base_uom_legacy_text;
ALTER TABLE item_master ALTER COLUMN base_uom_legacy_text DROP NOT NULL;

-- 4. Pack Variant
CREATE TABLE pack_variant (
  id uuid PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES item_master(id) ON DELETE RESTRICT,
  brand_id uuid NOT NULL REFERENCES brand_master(id) ON DELETE RESTRICT,
  pack_uom_id uuid NOT NULL REFERENCES uom_master(id) ON DELETE RESTRICT,
  conversion_factor numeric(18,6) NOT NULL CHECK (conversion_factor > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (item_id, brand_id, pack_uom_id, conversion_factor)
);
CREATE INDEX pack_variant_item_idx ON pack_variant (item_id);
CREATE INDEX pack_variant_brand_idx ON pack_variant (brand_id);

CREATE TABLE pack_variant_audit (
  id uuid PRIMARY KEY,
  pack_variant_id uuid NOT NULL REFERENCES pack_variant(id) ON DELETE RESTRICT,
  branch_id text NOT NULL CHECK (length(btrim(branch_id)) > 0),
  actor_id text NOT NULL CHECK (length(btrim(actor_id)) > 0),
  actor_role text NOT NULL CHECK (actor_role IN ('OWNER', 'MANAGER')),
  action text NOT NULL CHECK (action IN ('CREATE', 'UPDATE')),
  before_data jsonb,
  after_data jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((action = 'CREATE' AND before_data IS NULL) OR
         (action = 'UPDATE' AND before_data IS NOT NULL))
);
CREATE INDEX pack_variant_audit_pack_variant_idx ON pack_variant_audit (pack_variant_id, occurred_at);

-- 5. Immutability: reuse the existing generic history-mutation guard for
-- UPDATE/DELETE/TRUNCATE on every new audit table, and for DELETE/TRUNCATE
-- on every new master table (deactivate via `active`, never delete).
CREATE TRIGGER uom_audit_immutable BEFORE UPDATE OR DELETE ON uom_audit
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER uom_audit_no_truncate BEFORE TRUNCATE ON uom_audit
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER uom_master_no_delete BEFORE DELETE ON uom_master
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER uom_master_no_truncate BEFORE TRUNCATE ON uom_master
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();

CREATE TRIGGER brand_audit_immutable BEFORE UPDATE OR DELETE ON brand_audit
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER brand_audit_no_truncate BEFORE TRUNCATE ON brand_audit
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER brand_master_no_delete BEFORE DELETE ON brand_master
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER brand_master_no_truncate BEFORE TRUNCATE ON brand_master
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();

CREATE TRIGGER pack_variant_audit_immutable BEFORE UPDATE OR DELETE ON pack_variant_audit
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER pack_variant_audit_no_truncate BEFORE TRUNCATE ON pack_variant_audit
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER pack_variant_no_delete BEFORE DELETE ON pack_variant
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER pack_variant_no_truncate BEFORE TRUNCATE ON pack_variant
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();

-- 6. Identity immutability. uom_master/brand_master share one generic
-- id+created_at guard (their editable surface is otherwise open: name,
-- unit_type, active). pack_variant needs its own guard: item/brand/pack UOM
-- identify the variant and must never be redefined in place; only
-- conversion_factor and active may change.
CREATE FUNCTION inventory_preserve_generic_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Identity and creation time are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER uom_master_identity_immutable BEFORE UPDATE ON uom_master
FOR EACH ROW EXECUTE FUNCTION inventory_preserve_generic_identity();
CREATE TRIGGER brand_master_identity_immutable BEFORE UPDATE ON brand_master
FOR EACH ROW EXECUTE FUNCTION inventory_preserve_generic_identity();

CREATE FUNCTION inventory_preserve_pack_variant_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.item_id IS DISTINCT FROM OLD.item_id
    OR NEW.brand_id IS DISTINCT FROM OLD.brand_id OR NEW.pack_uom_id IS DISTINCT FROM OLD.pack_uom_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Pack variant identity (item, brand, pack UOM) and creation time are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pack_variant_identity_immutable BEFORE UPDATE ON pack_variant
FOR EACH ROW EXECUTE FUNCTION inventory_preserve_pack_variant_identity();

-- Down Migration
DO $$ BEGIN
  RAISE EXCEPTION 'Destructive Inventory rollback is prohibited: preserve UOM/Brand/Pack Variant master data, audit history, and migrated item base UOM references';
END $$;
