-- Up Migration
-- S-04: Stock Location Master + Opening Stock (quantity-only). Owner decisions
-- 2026-09-26 (ADR-0008): freezers are individual locations under a store or
-- kitchen parent; opening stock is never edited/deleted, corrections are
-- separate ADJUSTMENT entries with a reason; quantity only, no valuation.
-- No receiving, issue/transfer, counts, expiry/lots or costing in this slice.

-- 1. Stock Location Master: branch-owned. STORE/KITCHEN are top-level;
-- every FREEZER sits under exactly one STORE/KITCHEN parent of the same branch.
CREATE TABLE stock_location (
  id uuid PRIMARY KEY,
  branch_id text NOT NULL CHECK (length(btrim(branch_id)) > 0),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  location_type text NOT NULL CHECK (location_type IN ('STORE', 'KITCHEN', 'FREEZER')),
  parent_id uuid,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT stock_location_id_branch_unique UNIQUE (id, branch_id),
  -- Composite FK: a parent can only ever be in the same branch.
  CONSTRAINT stock_location_parent_same_branch FOREIGN KEY (parent_id, branch_id)
    REFERENCES stock_location (id, branch_id) ON DELETE RESTRICT,
  CONSTRAINT stock_location_freezer_has_parent CHECK ((location_type = 'FREEZER') = (parent_id IS NOT NULL))
);
CREATE INDEX stock_location_branch_idx ON stock_location (branch_id);
CREATE INDEX stock_location_parent_idx ON stock_location (parent_id);
CREATE UNIQUE INDEX stock_location_branch_name_unique ON stock_location (branch_id, lower(btrim(name)));

CREATE FUNCTION inventory_validate_stock_location_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_type text;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT location_type INTO parent_type FROM stock_location WHERE id = NEW.parent_id;
    IF parent_type IS NULL OR parent_type = 'FREEZER' THEN
      RAISE EXCEPTION 'A freezer location must be placed under a STORE or KITCHEN location';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stock_location_validate_parent BEFORE INSERT ON stock_location
FOR EACH ROW EXECUTE FUNCTION inventory_validate_stock_location_parent();

-- Identity, branch, type and placement are fixed after creation (name and
-- active remain editable).
CREATE FUNCTION inventory_preserve_stock_location_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
    OR NEW.location_type IS DISTINCT FROM OLD.location_type OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Stock location identity, branch, type, parent and creation time are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stock_location_identity_immutable BEFORE UPDATE ON stock_location
FOR EACH ROW EXECUTE FUNCTION inventory_preserve_stock_location_identity();
CREATE TRIGGER stock_location_no_delete BEFORE DELETE ON stock_location
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER stock_location_no_truncate BEFORE TRUNCATE ON stock_location
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();

CREATE TABLE stock_location_audit (
  id uuid PRIMARY KEY,
  location_id uuid NOT NULL REFERENCES stock_location(id) ON DELETE RESTRICT,
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
CREATE INDEX stock_location_audit_location_idx ON stock_location_audit (location_id, occurred_at);
CREATE TRIGGER stock_location_audit_immutable BEFORE UPDATE OR DELETE ON stock_location_audit
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER stock_location_audit_no_truncate BEFORE TRUNCATE ON stock_location_audit
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();

-- 2. Stock movement ledger: append-only, quantity in the item's Base UOM.
-- Balance = SUM(quantity_delta) per item + location. No branch_id column:
-- ownership is inherited from the location and the item, which must match.
CREATE TABLE stock_movement (
  id uuid PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES item_master(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES stock_location(id) ON DELETE RESTRICT,
  movement_type text NOT NULL CHECK (movement_type IN ('OPENING', 'ADJUSTMENT')),
  quantity_delta numeric(18,6) NOT NULL CHECK (quantity_delta <> 0),
  reason text CHECK (reason IS NULL OR length(btrim(reason)) > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((movement_type = 'OPENING' AND quantity_delta > 0 AND reason IS NULL)
      OR (movement_type = 'ADJUSTMENT' AND reason IS NOT NULL))
);
-- Exactly one opening entry per item per location, even under concurrency.
CREATE UNIQUE INDEX stock_movement_one_opening ON stock_movement (item_id, location_id) WHERE movement_type = 'OPENING';
CREATE INDEX stock_movement_location_item_idx ON stock_movement (location_id, item_id, created_at);
CREATE INDEX stock_movement_item_idx ON stock_movement (item_id);

-- Database-level backstop for ledger integrity (the application performs the
-- same checks first, under the same lock, to return clean error codes):
-- same-branch item/location, adjustment only after an opening, and a balance
-- that never goes below zero. The per item+location advisory lock serialises
-- concurrent writers for that pair.
CREATE FUNCTION inventory_validate_stock_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item_branch text; location_branch text; current_balance numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.item_id::text || ':' || NEW.location_id::text, 0));
  SELECT branch_id INTO item_branch FROM item_master WHERE id = NEW.item_id;
  SELECT branch_id INTO location_branch FROM stock_location WHERE id = NEW.location_id;
  IF item_branch IS DISTINCT FROM location_branch THEN
    RAISE EXCEPTION 'Stock movement item and location must belong to the same branch';
  END IF;
  IF NEW.movement_type = 'ADJUSTMENT' AND NOT EXISTS (
    SELECT 1 FROM stock_movement WHERE item_id = NEW.item_id AND location_id = NEW.location_id AND movement_type = 'OPENING'
  ) THEN
    RAISE EXCEPTION 'An adjustment requires an existing opening stock entry for the same item and location';
  END IF;
  SELECT COALESCE(sum(quantity_delta), 0) INTO current_balance
    FROM stock_movement WHERE item_id = NEW.item_id AND location_id = NEW.location_id;
  IF current_balance + NEW.quantity_delta < 0 THEN
    RAISE EXCEPTION 'Stock balance cannot go below zero';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stock_movement_validate BEFORE INSERT ON stock_movement
FOR EACH ROW EXECUTE FUNCTION inventory_validate_stock_movement();
CREATE TRIGGER stock_movement_no_update BEFORE UPDATE ON stock_movement
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER stock_movement_no_delete BEFORE DELETE ON stock_movement
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER stock_movement_no_truncate BEFORE TRUNCATE ON stock_movement
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();

CREATE TABLE stock_movement_audit (
  id uuid PRIMARY KEY,
  stock_movement_id uuid NOT NULL REFERENCES stock_movement(id) ON DELETE RESTRICT,
  branch_id text NOT NULL CHECK (length(btrim(branch_id)) > 0),
  actor_id text NOT NULL CHECK (length(btrim(actor_id)) > 0),
  actor_role text NOT NULL CHECK (actor_role IN ('OWNER', 'MANAGER')),
  action text NOT NULL CHECK (action = 'CREATE'),
  before_data jsonb,
  after_data jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (before_data IS NULL)
);
CREATE INDEX stock_movement_audit_movement_idx ON stock_movement_audit (stock_movement_id, occurred_at);
CREATE TRIGGER stock_movement_audit_immutable BEFORE UPDATE OR DELETE ON stock_movement_audit
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER stock_movement_audit_no_truncate BEFORE TRUNCATE ON stock_movement_audit
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();

-- Down Migration
DO $$ BEGIN
  RAISE EXCEPTION 'Destructive Inventory rollback is prohibited: preserve Stock Location master data, stock movements and audit history';
END $$;
