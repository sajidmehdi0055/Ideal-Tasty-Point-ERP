-- Up Migration
-- Migration B of S-02: item_master.base_uom -> base_uom_id FK (with the
-- unit_type-never-guessed safety refinement) and Pack Variant. Depends on
-- uom_master/brand_master already existing from Migration A. If this
-- migration halts partway (an unmatched legacy base_uom), it rolls back on
-- its own -- Migration A's tables are a separate, already-committed
-- migration and are unaffected, so the documented recovery path (add the
-- missing UOM explicitly, then re-run this migration) is actually
-- executable.

-- 1. Item Base UOM migration (text -> FK), with a safety refinement:
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
    RAISE EXCEPTION 'S-02 base_uom migration halted: % unmatched legacy base_uom value(s) with no case-insensitive match in uom_master: [%]. This migration (and only this migration) rolled back; uom_master from the prior migration is untouched. Insert each missing value into uom_master with a deliberately chosen unit_type (never guessed), then re-run this migration.',
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

-- 2. Pack Variant
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

-- 3. Immutability, mirroring Migration A's pattern for the two new tables.
CREATE TRIGGER pack_variant_audit_immutable BEFORE UPDATE OR DELETE ON pack_variant_audit
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER pack_variant_audit_no_truncate BEFORE TRUNCATE ON pack_variant_audit
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER pack_variant_no_delete BEFORE DELETE ON pack_variant
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER pack_variant_no_truncate BEFORE TRUNCATE ON pack_variant
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();

-- 4. Identity immutability: item/brand/pack UOM identify the variant and must
-- never be redefined in place; only conversion_factor and active may change.
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
  RAISE EXCEPTION 'Destructive Inventory rollback is prohibited: preserve Pack Variant master data, audit history, and migrated item base UOM references';
END $$;
