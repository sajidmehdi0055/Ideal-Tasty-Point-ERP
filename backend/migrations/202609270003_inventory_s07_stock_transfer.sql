-- Up Migration
-- S-07: Stock Transfer (ADR-0011). Owner decisions 2026-09-27: two-step
-- transfer between locations -- "Send" takes the stock out of the source at
-- once (in transit), "Receive" adds it to the destination; the receiver
-- enters the quantity actually received and any shortage is a variance with
-- a mandatory reason (it does not come back); quantities in the item's Base
-- UOM; a transfer not yet received may be cancelled with a reason (the sent
-- quantity returns to the source); after receipt it is final. Additive only:
-- no existing row is changed.

-- 1. Ledger: three transfer movement types, all without a reason.
ALTER TABLE stock_movement DROP CONSTRAINT stock_movement_movement_type_check;
ALTER TABLE stock_movement ADD CONSTRAINT stock_movement_movement_type_check
  CHECK (movement_type IN ('OPENING', 'ADJUSTMENT', 'RECEIPT', 'TRANSFER_OUT', 'TRANSFER_IN', 'TRANSFER_RETURN'));
ALTER TABLE stock_movement DROP CONSTRAINT stock_movement_check;
ALTER TABLE stock_movement ADD CONSTRAINT stock_movement_check
  CHECK ((movement_type = 'OPENING' AND quantity_delta > 0 AND reason IS NULL)
      OR (movement_type = 'ADJUSTMENT' AND reason IS NOT NULL)
      OR (movement_type IN ('RECEIPT', 'TRANSFER_IN', 'TRANSFER_RETURN') AND quantity_delta > 0 AND reason IS NULL)
      OR (movement_type = 'TRANSFER_OUT' AND quantity_delta < 0 AND reason IS NULL));

-- 2. Transfer header. No branch_id column: the branch is inherited from the
-- source location; the destination must be in the same branch (trigger).
CREATE SEQUENCE stock_transfer_no_seq AS bigint START WITH 1 NO CYCLE;

CREATE TABLE stock_transfer (
  id uuid PRIMARY KEY,
  transfer_number text NOT NULL UNIQUE,
  from_location_id uuid NOT NULL REFERENCES stock_location(id) ON DELETE RESTRICT,
  to_location_id uuid NOT NULL REFERENCES stock_location(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'SENT' CHECK (status IN ('SENT', 'RECEIVED', 'CANCELLED')),
  status_reason text CHECK (status_reason IS NULL OR (length(btrim(status_reason)) > 0 AND length(status_reason) <= 500)),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (from_location_id <> to_location_id),
  CHECK ((status = 'CANCELLED') = (status_reason IS NOT NULL))
);
CREATE INDEX stock_transfer_from_idx ON stock_transfer (from_location_id, created_at DESC);
CREATE INDEX stock_transfer_to_idx ON stock_transfer (to_location_id, created_at DESC);
CREATE INDEX stock_transfer_pending_idx ON stock_transfer (status) WHERE status = 'SENT';

CREATE FUNCTION inventory_validate_stock_transfer_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE from_branch text; to_branch text; sequence_value text;
BEGIN
  IF NEW.transfer_number IS NOT NULL THEN
    RAISE EXCEPTION 'Transfer number must be system generated';
  END IF;
  IF NEW.status <> 'SENT' OR NEW.status_reason IS NOT NULL THEN
    RAISE EXCEPTION 'A new stock transfer starts as SENT without a status reason';
  END IF;
  SELECT branch_id INTO from_branch FROM stock_location WHERE id = NEW.from_location_id;
  SELECT branch_id INTO to_branch FROM stock_location WHERE id = NEW.to_location_id;
  IF from_branch IS NULL OR from_branch IS DISTINCT FROM to_branch THEN
    RAISE EXCEPTION 'Transfer source and destination must be locations of the same branch';
  END IF;
  sequence_value := nextval('stock_transfer_no_seq')::text;
  NEW.transfer_number := 'TRF-' || lpad(sequence_value, greatest(6, length(sequence_value)), '0');
  RETURN NEW;
END $$;
CREATE TRIGGER stock_transfer_validate_insert BEFORE INSERT ON stock_transfer
FOR EACH ROW EXECUTE FUNCTION inventory_validate_stock_transfer_insert();

-- Only SENT -> RECEIVED / CANCELLED, and only after every line has a
-- settlement of the matching kind. Identity is fixed; final states are frozen.
CREATE FUNCTION inventory_guard_stock_transfer_update() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE needed_kind text;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.transfer_number IS DISTINCT FROM OLD.transfer_number
    OR NEW.from_location_id IS DISTINCT FROM OLD.from_location_id OR NEW.to_location_id IS DISTINCT FROM OLD.to_location_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Stock transfer identity, locations and creation time are immutable';
  END IF;
  IF OLD.status <> 'SENT' THEN
    RAISE EXCEPTION 'A % stock transfer is final and cannot be changed', OLD.status;
  END IF;
  IF NEW.status = 'RECEIVED' THEN needed_kind := 'RECEIVE';
  ELSIF NEW.status = 'CANCELLED' THEN needed_kind := 'CANCEL';
  ELSE RAISE EXCEPTION 'A SENT stock transfer can only become RECEIVED or CANCELLED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM stock_transfer_line l
    LEFT JOIN stock_transfer_settlement s ON s.stock_transfer_line_id = l.id
    WHERE l.stock_transfer_id = NEW.id AND (s.id IS NULL OR s.kind <> needed_kind)
  ) THEN
    RAISE EXCEPTION 'Every line needs a % settlement before the transfer becomes %', needed_kind, NEW.status;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stock_transfer_guard_update BEFORE UPDATE ON stock_transfer
FOR EACH ROW EXECUTE FUNCTION inventory_guard_stock_transfer_update();
CREATE TRIGGER stock_transfer_no_delete BEFORE DELETE ON stock_transfer
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER stock_transfer_no_truncate BEFORE TRUNCATE ON stock_transfer
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();

-- 3. Lines: insert-only, written only in the transaction that created the
-- transfer (xmin of the header = current top-level transaction; the
-- application never uses savepoints here -- inserting the header inside a
-- savepoint would give it a subtransaction xid and this check would refuse
-- the lines). sent_quantity is in the item's Base UOM; each line owns exactly
-- one TRANSFER_OUT movement at the source for -sent_quantity.
CREATE TABLE stock_transfer_line (
  id uuid PRIMARY KEY,
  stock_transfer_id uuid NOT NULL REFERENCES stock_transfer(id) ON DELETE RESTRICT,
  line_no integer NOT NULL CHECK (line_no > 0),
  item_id uuid NOT NULL REFERENCES item_master(id) ON DELETE RESTRICT,
  sent_quantity numeric(18,6) NOT NULL CHECK (sent_quantity > 0),
  out_movement_id uuid NOT NULL UNIQUE REFERENCES stock_movement(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (stock_transfer_id, line_no),
  UNIQUE (stock_transfer_id, item_id)
);
CREATE INDEX stock_transfer_line_item_idx ON stock_transfer_line (item_id);

CREATE FUNCTION inventory_validate_stock_transfer_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t record; item_branch text; from_branch text; mv record;
BEGIN
  SELECT id, status, from_location_id, xmin INTO t FROM stock_transfer WHERE id = NEW.stock_transfer_id;
  IF t.id IS NULL OR t.status <> 'SENT' OR t.xmin <> pg_current_xact_id()::xid THEN
    RAISE EXCEPTION 'Transfer lines can only be added while creating the transfer';
  END IF;
  SELECT branch_id INTO item_branch FROM item_master WHERE id = NEW.item_id;
  SELECT branch_id INTO from_branch FROM stock_location WHERE id = t.from_location_id;
  IF item_branch IS DISTINCT FROM from_branch THEN
    RAISE EXCEPTION 'Transfer line item must belong to the transfer branch';
  END IF;
  SELECT movement_type, item_id, location_id, quantity_delta INTO mv FROM stock_movement WHERE id = NEW.out_movement_id;
  IF mv.movement_type IS DISTINCT FROM 'TRANSFER_OUT' OR mv.item_id IS DISTINCT FROM NEW.item_id
    OR mv.location_id IS DISTINCT FROM t.from_location_id OR mv.quantity_delta IS DISTINCT FROM -NEW.sent_quantity THEN
    RAISE EXCEPTION 'Transfer line must reference its own TRANSFER_OUT movement at the source location';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stock_transfer_line_validate BEFORE INSERT ON stock_transfer_line
FOR EACH ROW EXECUTE FUNCTION inventory_validate_stock_transfer_line();
CREATE TRIGGER stock_transfer_line_no_update BEFORE UPDATE ON stock_transfer_line
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER stock_transfer_line_no_delete BEFORE DELETE ON stock_transfer_line
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER stock_transfer_line_no_truncate BEFORE TRUNCATE ON stock_transfer_line
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();

-- 4. Settlement: exactly one per line, insert-only. RECEIVE records the
-- quantity actually received (0..sent) and the variance (sent - received,
-- reason required when > 0), with a TRANSFER_IN at the destination when
-- received > 0. CANCEL returns the full sent quantity to the source with a
-- TRANSFER_RETURN. The variance has no ledger movement: it already left the
-- source at send.
CREATE TABLE stock_transfer_settlement (
  id uuid PRIMARY KEY,
  stock_transfer_line_id uuid NOT NULL UNIQUE REFERENCES stock_transfer_line(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('RECEIVE', 'CANCEL')),
  received_quantity numeric(18,6) CHECK (received_quantity >= 0),
  variance_quantity numeric(18,6) CHECK (variance_quantity >= 0),
  variance_reason text CHECK (variance_reason IS NULL OR (length(btrim(variance_reason)) > 0 AND length(variance_reason) <= 500)),
  movement_id uuid UNIQUE REFERENCES stock_movement(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((kind = 'RECEIVE' AND received_quantity IS NOT NULL AND variance_quantity IS NOT NULL
          AND (variance_quantity > 0) = (variance_reason IS NOT NULL)
          AND (received_quantity > 0) = (movement_id IS NOT NULL))
      OR (kind = 'CANCEL' AND received_quantity IS NULL AND variance_quantity IS NULL
          AND variance_reason IS NULL AND movement_id IS NOT NULL))
);

CREATE FUNCTION inventory_validate_stock_transfer_settlement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE l record; t record; mv record;
BEGIN
  SELECT id, stock_transfer_id, item_id, sent_quantity INTO l FROM stock_transfer_line WHERE id = NEW.stock_transfer_line_id;
  IF l.id IS NULL THEN
    RAISE EXCEPTION 'Settlement must reference an existing transfer line';
  END IF;
  -- Row lock: a concurrent receive and cancel of the same transfer serialise here.
  SELECT id, status, from_location_id, to_location_id INTO t FROM stock_transfer WHERE id = l.stock_transfer_id FOR UPDATE;
  IF t.status <> 'SENT' THEN
    RAISE EXCEPTION 'Only a SENT transfer can be received or cancelled';
  END IF;
  IF EXISTS (
    SELECT 1 FROM stock_transfer_settlement s JOIN stock_transfer_line x ON x.id = s.stock_transfer_line_id
    WHERE x.stock_transfer_id = t.id AND s.kind <> NEW.kind
  ) THEN
    RAISE EXCEPTION 'A transfer is either received or cancelled, never both';
  END IF;
  IF NEW.kind = 'RECEIVE' THEN
    IF NEW.received_quantity > l.sent_quantity OR NEW.received_quantity + NEW.variance_quantity <> l.sent_quantity THEN
      RAISE EXCEPTION 'Received quantity must be between 0 and the sent quantity, and variance = sent - received';
    END IF;
    IF NEW.movement_id IS NOT NULL THEN
      SELECT movement_type, item_id, location_id, quantity_delta INTO mv FROM stock_movement WHERE id = NEW.movement_id;
      IF mv.movement_type IS DISTINCT FROM 'TRANSFER_IN' OR mv.item_id IS DISTINCT FROM l.item_id
        OR mv.location_id IS DISTINCT FROM t.to_location_id OR mv.quantity_delta IS DISTINCT FROM NEW.received_quantity THEN
        RAISE EXCEPTION 'Receive settlement must reference its own TRANSFER_IN movement at the destination';
      END IF;
    END IF;
  ELSE
    SELECT movement_type, item_id, location_id, quantity_delta INTO mv FROM stock_movement WHERE id = NEW.movement_id;
    IF mv.movement_type IS DISTINCT FROM 'TRANSFER_RETURN' OR mv.item_id IS DISTINCT FROM l.item_id
      OR mv.location_id IS DISTINCT FROM t.from_location_id OR mv.quantity_delta IS DISTINCT FROM l.sent_quantity THEN
      RAISE EXCEPTION 'Cancel settlement must reference its own TRANSFER_RETURN movement at the source';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stock_transfer_settlement_validate BEFORE INSERT ON stock_transfer_settlement
FOR EACH ROW EXECUTE FUNCTION inventory_validate_stock_transfer_settlement();
CREATE TRIGGER stock_transfer_settlement_no_update BEFORE UPDATE ON stock_transfer_settlement
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER stock_transfer_settlement_no_delete BEFORE DELETE ON stock_transfer_settlement
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER stock_transfer_settlement_no_truncate BEFORE TRUNCATE ON stock_transfer_settlement
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();

-- 5. Commit-time checks (deferred): a transfer movement never exists without
-- its transfer record, and a transfer never exists without lines.
CREATE FUNCTION inventory_check_transfer_movement_linked() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.movement_type = 'TRANSFER_OUT' THEN
    IF NOT EXISTS (SELECT 1 FROM stock_transfer_line WHERE out_movement_id = NEW.id) THEN
      RAISE EXCEPTION 'TRANSFER_OUT movement % is not linked to a transfer line', NEW.id;
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM stock_transfer_settlement WHERE movement_id = NEW.id
      AND kind = CASE NEW.movement_type WHEN 'TRANSFER_IN' THEN 'RECEIVE' ELSE 'CANCEL' END
  ) THEN
    RAISE EXCEPTION '% movement % is not linked to a transfer settlement', NEW.movement_type, NEW.id;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER stock_movement_transfer_linked AFTER INSERT ON stock_movement
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
WHEN (NEW.movement_type IN ('TRANSFER_OUT', 'TRANSFER_IN', 'TRANSFER_RETURN'))
EXECUTE FUNCTION inventory_check_transfer_movement_linked();

CREATE FUNCTION inventory_check_transfer_has_lines() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM stock_transfer_line WHERE stock_transfer_id = NEW.id) THEN
    RAISE EXCEPTION 'Stock transfer % has no lines', NEW.id;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER stock_transfer_has_lines AFTER INSERT ON stock_transfer
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_check_transfer_has_lines();

-- A settlement only exists together with the matching final header status
-- (RECEIVE -> RECEIVED, CANCEL -> CANCELLED), so a transfer can never be
-- half-settled while still SENT (in transit counted twice).
CREATE FUNCTION inventory_check_settlement_finalised() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE transfer_status text; expected_status text;
BEGIN
  expected_status := CASE NEW.kind WHEN 'RECEIVE' THEN 'RECEIVED' ELSE 'CANCELLED' END;
  SELECT t.status INTO transfer_status FROM stock_transfer t
    JOIN stock_transfer_line l ON l.stock_transfer_id = t.id WHERE l.id = NEW.stock_transfer_line_id;
  IF transfer_status IS DISTINCT FROM expected_status THEN
    RAISE EXCEPTION 'A % settlement requires the transfer to be % in the same transaction', NEW.kind, expected_status;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER stock_transfer_settlement_finalised AFTER INSERT ON stock_transfer_settlement
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION inventory_check_settlement_finalised();

-- 6. Audit: full before/after snapshots including lines and settlements.
CREATE TABLE stock_transfer_audit (
  id uuid PRIMARY KEY,
  stock_transfer_id uuid NOT NULL REFERENCES stock_transfer(id) ON DELETE RESTRICT,
  branch_id text NOT NULL CHECK (length(btrim(branch_id)) > 0),
  actor_id text NOT NULL CHECK (length(btrim(actor_id)) > 0),
  actor_role text NOT NULL CHECK (actor_role IN ('OWNER', 'MANAGER')),
  action text NOT NULL CHECK (action IN ('CREATE', 'RECEIVE', 'CANCEL')),
  before_data jsonb,
  after_data jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((action = 'CREATE') = (before_data IS NULL))
);
CREATE INDEX stock_transfer_audit_transfer_idx ON stock_transfer_audit (stock_transfer_id, occurred_at);
CREATE TRIGGER stock_transfer_audit_immutable BEFORE UPDATE OR DELETE ON stock_transfer_audit
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER stock_transfer_audit_no_truncate BEFORE TRUNCATE ON stock_transfer_audit
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();

-- 7. A location with a pending (SENT) transfer in or out cannot be
-- deactivated, so in-transit stock can always be received or returned.
CREATE FUNCTION inventory_block_deactivation_with_pending_transfers() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM stock_transfer WHERE status = 'SENT'
             AND (from_location_id = NEW.id OR to_location_id = NEW.id)) THEN
    RAISE EXCEPTION 'A location with pending stock transfers cannot be deactivated';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stock_location_pending_transfers BEFORE UPDATE ON stock_location
FOR EACH ROW WHEN (OLD.active AND NOT NEW.active)
EXECUTE FUNCTION inventory_block_deactivation_with_pending_transfers();

-- Down Migration
DO $$ BEGIN
  RAISE EXCEPTION 'Destructive Inventory rollback is prohibited: preserve stock transfers, stock movements and audit history';
END $$;
