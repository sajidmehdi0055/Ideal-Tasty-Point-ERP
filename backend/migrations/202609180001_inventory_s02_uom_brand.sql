-- Up Migration
-- Migration A of S-02: UOM Master and Brand Master only. Commits independently
-- of the item base_uom backfill (Migration B), so that if Migration B ever
-- halts on an unrecognized legacy value, uom_master/brand_master remain in
-- place and an operator can classify the missing UOM before re-running B.

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

-- 3. Immutability: reuse the existing generic history-mutation guard for
-- UPDATE/DELETE/TRUNCATE on every new audit table, and for DELETE/TRUNCATE
-- on each new master table (deactivate via `active`, never delete).
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

-- 4. Identity immutability. uom_master/brand_master share one generic
-- id+created_at guard (their editable surface is otherwise open: name,
-- unit_type, active).
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

-- Down Migration
DO $$ BEGIN
  RAISE EXCEPTION 'Destructive Inventory rollback is prohibited: preserve UOM/Brand master data and audit history';
END $$;
