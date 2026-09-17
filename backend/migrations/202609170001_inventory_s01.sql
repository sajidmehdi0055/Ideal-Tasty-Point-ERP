-- Up Migration
CREATE SEQUENCE item_code_seq AS bigint START WITH 1 NO CYCLE;
CREATE TABLE item_master (
  id uuid PRIMARY KEY,
  item_code text NOT NULL UNIQUE,
  branch_id text NOT NULL CHECK (length(btrim(branch_id)) > 0),
  item_name text NOT NULL CHECK (length(btrim(item_name)) > 0),
  primary_item_type text NOT NULL CHECK (primary_item_type IN
    ('RAW_MATERIAL', 'WIP_SEMI_FINISHED', 'FINISHED_SELLING_PRODUCT', 'DIRECT_PURCHASE_SALE')),
  base_uom text NOT NULL CHECK (length(btrim(base_uom)) > 0),
  brand text NOT NULL CHECK (length(btrim(brand)) > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX item_master_branch_idx ON item_master (branch_id);
CREATE FUNCTION inventory_generate_item_code() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sequence_value text;
BEGIN
  IF NEW.item_code IS NOT NULL THEN
    RAISE EXCEPTION 'Item code must be system generated';
  END IF;
  sequence_value := nextval('item_code_seq')::text;
  NEW.item_code := 'ITM-' || lpad(sequence_value, greatest(6, length(sequence_value)), '0');
  RETURN NEW;
END;
$$;
CREATE TRIGGER item_master_generate_code BEFORE INSERT ON item_master
FOR EACH ROW EXECUTE FUNCTION inventory_generate_item_code();
CREATE TABLE inventory_audit (
  id uuid PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES item_master(id),
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
CREATE INDEX inventory_audit_item_idx ON inventory_audit(item_id, occurred_at);
CREATE INDEX inventory_audit_branch_idx ON inventory_audit(branch_id);
CREATE FUNCTION inventory_reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Inventory historical records are immutable';
END;
$$;
CREATE TRIGGER inventory_audit_immutable BEFORE UPDATE OR DELETE ON inventory_audit
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER inventory_audit_no_truncate BEFORE TRUNCATE ON inventory_audit
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER item_master_no_delete BEFORE DELETE ON item_master
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER item_master_no_truncate BEFORE TRUNCATE ON item_master
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE FUNCTION inventory_preserve_item_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.item_code IS DISTINCT FROM OLD.item_code
    OR NEW.branch_id IS DISTINCT FROM OLD.branch_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Item identity, branch and creation time are immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER item_master_identity_immutable BEFORE UPDATE ON item_master
FOR EACH ROW EXECUTE FUNCTION inventory_preserve_item_identity();
-- Down Migration
DO $$ BEGIN
  RAISE EXCEPTION 'Destructive Inventory rollback is prohibited: preserve item identities and audit history';
END $$;
