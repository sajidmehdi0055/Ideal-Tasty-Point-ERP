-- Up Migration
-- S-03: Supplier Master and Purchase Record (rate/history only -- no stock
-- engine, no Purchase Orders/GRN/Ledger/Payments/costing in this slice).
-- Single migration: unlike S-02's split, nothing here backfills existing
-- columns from risky legacy data, so there is no halt-and-recover scenario
-- to protect against by splitting into ordered files.

-- 1. Supplier Master: global/standalone master, same shape as Brand Master
-- (not nested under a branch or another entity).
CREATE TABLE supplier_master (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  contact text,
  type text NOT NULL CHECK (type IN ('CASH', 'CREDIT')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX supplier_master_name_unique ON supplier_master (lower(btrim(name)));

CREATE TABLE supplier_audit (
  id uuid PRIMARY KEY,
  supplier_id uuid NOT NULL REFERENCES supplier_master(id) ON DELETE RESTRICT,
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
CREATE INDEX supplier_audit_supplier_idx ON supplier_audit (supplier_id, occurred_at);

CREATE TRIGGER supplier_audit_immutable BEFORE UPDATE OR DELETE ON supplier_audit
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER supplier_audit_no_truncate BEFORE TRUNCATE ON supplier_audit
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER supplier_master_no_delete BEFORE DELETE ON supplier_master
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER supplier_master_no_truncate BEFORE TRUNCATE ON supplier_master
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();
-- Reuses the same generic id/created_at identity guard uom_master/brand_master
-- already share (its editable surface is otherwise open: name, contact, type, active).
CREATE TRIGGER supplier_master_identity_immutable BEFORE UPDATE ON supplier_master
FOR EACH ROW EXECUTE FUNCTION inventory_preserve_generic_identity();

-- 2. Purchase Record: create-only rate/history record. No branch_id of its
-- own -- branch ownership is enforced through item_id, exactly like Pack
-- Variant. This never touches stock/quantity-on-hand; there is no stock
-- engine yet.
CREATE TABLE purchase_record (
  id uuid PRIMARY KEY,
  supplier_id uuid NOT NULL REFERENCES supplier_master(id) ON DELETE RESTRICT,
  item_id uuid NOT NULL REFERENCES item_master(id) ON DELETE RESTRICT,
  brand_id uuid NOT NULL REFERENCES brand_master(id) ON DELETE RESTRICT,
  pack_variant_id uuid NOT NULL REFERENCES pack_variant(id) ON DELETE RESTRICT,
  quantity numeric(18,6) NOT NULL CHECK (quantity > 0),
  rate numeric(18,6) NOT NULL CHECK (rate > 0),
  purchase_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX purchase_record_item_idx ON purchase_record (item_id);
CREATE INDEX purchase_record_supplier_idx ON purchase_record (supplier_id);
CREATE INDEX purchase_record_rate_lookup_idx ON purchase_record (item_id, brand_id, pack_variant_id, purchase_date DESC, created_at DESC);

CREATE TABLE purchase_record_audit (
  id uuid PRIMARY KEY,
  purchase_record_id uuid NOT NULL REFERENCES purchase_record(id) ON DELETE RESTRICT,
  branch_id text NOT NULL CHECK (length(btrim(branch_id)) > 0),
  actor_id text NOT NULL CHECK (length(btrim(actor_id)) > 0),
  actor_role text NOT NULL CHECK (actor_role IN ('OWNER', 'MANAGER')),
  action text NOT NULL CHECK (action = 'CREATE'),
  before_data jsonb,
  after_data jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (before_data IS NULL)
);
CREATE INDEX purchase_record_audit_purchase_record_idx ON purchase_record_audit (purchase_record_id, occurred_at);

CREATE TRIGGER purchase_record_audit_immutable BEFORE UPDATE OR DELETE ON purchase_record_audit
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER purchase_record_audit_no_truncate BEFORE TRUNCATE ON purchase_record_audit
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();
-- Purchase Record has no edit/void/cancel path at all in this slice
-- (correcting/reversing a purchase record is an explicitly deferred,
-- undecided business rule), so unlike other masters it is immutable in
-- full -- every field, not only identity columns -- once created.
CREATE TRIGGER purchase_record_no_update BEFORE UPDATE ON purchase_record
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER purchase_record_no_delete BEFORE DELETE ON purchase_record
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER purchase_record_no_truncate BEFORE TRUNCATE ON purchase_record
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();

-- Down Migration
DO $$ BEGIN
  RAISE EXCEPTION 'Destructive Inventory rollback is prohibited: preserve Supplier and Purchase Record master data and audit history';
END $$;
