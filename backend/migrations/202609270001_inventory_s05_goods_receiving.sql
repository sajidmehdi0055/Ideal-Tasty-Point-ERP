-- Up Migration
-- S-05: Goods Receiving (ADR-0009). Owner decisions 2026-09-27: direct
-- receiving without a Purchase Order (PO is S-06); one entry records quantity,
-- rate and date, creating the S-03 purchase record (rate history) and the S-04
-- stock movement together; receipt date today or earlier, never future, and
-- not before the item's opening stock; a wrong receipt is corrected by an
-- ADJUSTMENT, never edited; no expiry capture yet; one receipt can carry many
-- lines; a receipt may be the first stock for an item+location; optional
-- supplier bill number. Additive only: no existing row is changed.

-- 1. Ledger: allow RECEIPT movements (positive, no reason).
ALTER TABLE stock_movement DROP CONSTRAINT stock_movement_movement_type_check;
ALTER TABLE stock_movement ADD CONSTRAINT stock_movement_movement_type_check
  CHECK (movement_type IN ('OPENING', 'ADJUSTMENT', 'RECEIPT'));
ALTER TABLE stock_movement DROP CONSTRAINT stock_movement_check;
ALTER TABLE stock_movement ADD CONSTRAINT stock_movement_check
  CHECK ((movement_type = 'OPENING' AND quantity_delta > 0 AND reason IS NULL)
      OR (movement_type = 'ADJUSTMENT' AND reason IS NOT NULL)
      OR (movement_type = 'RECEIPT' AND quantity_delta > 0 AND reason IS NULL));

-- 2. Ledger backstop, updated for receipts: an OPENING must be the first
-- movement for its item+location (a receipt may now come first); an
-- ADJUSTMENT needs any earlier movement (opening or receipt); the balance
-- still never goes below zero. Same advisory lock as S-04.
CREATE OR REPLACE FUNCTION inventory_validate_stock_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item_branch text; location_branch text; current_balance numeric; has_history boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.item_id::text || ':' || NEW.location_id::text, 0));
  SELECT branch_id INTO item_branch FROM item_master WHERE id = NEW.item_id;
  SELECT branch_id INTO location_branch FROM stock_location WHERE id = NEW.location_id;
  IF item_branch IS DISTINCT FROM location_branch THEN
    RAISE EXCEPTION 'Stock movement item and location must belong to the same branch';
  END IF;
  SELECT EXISTS (SELECT 1 FROM stock_movement WHERE item_id = NEW.item_id AND location_id = NEW.location_id) INTO has_history;
  IF NEW.movement_type = 'OPENING' AND has_history THEN
    RAISE EXCEPTION 'Opening stock must be the first entry for an item and location';
  END IF;
  IF NEW.movement_type = 'ADJUSTMENT' AND NOT has_history THEN
    RAISE EXCEPTION 'An adjustment requires an existing opening or receipt entry for the same item and location';
  END IF;
  SELECT COALESCE(sum(quantity_delta), 0) INTO current_balance
    FROM stock_movement WHERE item_id = NEW.item_id AND location_id = NEW.location_id;
  IF current_balance + NEW.quantity_delta < 0 THEN
    RAISE EXCEPTION 'Stock balance cannot go below zero';
  END IF;
  RETURN NEW;
END $$;

-- 3. Goods receipt header. Branch is inherited from the location (no
-- redundant branch_id column), like Purchase Record inherits via item.
CREATE TABLE goods_receipt (
  id uuid PRIMARY KEY,
  supplier_id uuid NOT NULL REFERENCES supplier_master(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES stock_location(id) ON DELETE RESTRICT,
  receipt_date date NOT NULL,
  supplier_bill_no text CHECK (supplier_bill_no IS NULL OR length(btrim(supplier_bill_no)) > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX goods_receipt_location_date_idx ON goods_receipt (location_id, receipt_date DESC, created_at DESC);
CREATE INDEX goods_receipt_supplier_idx ON goods_receipt (supplier_id);

-- 4. Receipt lines. conversion_factor is a snapshot taken at receipt time
-- (Pack Variant's factor is editable later); base_quantity =
-- round(pack_quantity x conversion_factor, 6) in the item's Base UOM.
-- Each line owns exactly one purchase record and one stock movement.
CREATE TABLE goods_receipt_line (
  id uuid PRIMARY KEY,
  goods_receipt_id uuid NOT NULL REFERENCES goods_receipt(id) ON DELETE RESTRICT,
  line_no integer NOT NULL CHECK (line_no > 0),
  item_id uuid NOT NULL REFERENCES item_master(id) ON DELETE RESTRICT,
  brand_id uuid NOT NULL REFERENCES brand_master(id) ON DELETE RESTRICT,
  pack_variant_id uuid NOT NULL REFERENCES pack_variant(id) ON DELETE RESTRICT,
  pack_quantity numeric(18,6) NOT NULL CHECK (pack_quantity > 0),
  conversion_factor numeric(18,6) NOT NULL CHECK (conversion_factor > 0),
  base_quantity numeric(18,6) NOT NULL CHECK (base_quantity > 0),
  rate numeric(18,6) NOT NULL CHECK (rate > 0),
  purchase_record_id uuid NOT NULL UNIQUE REFERENCES purchase_record(id) ON DELETE RESTRICT,
  stock_movement_id uuid NOT NULL UNIQUE REFERENCES stock_movement(id) ON DELETE RESTRICT,
  UNIQUE (goods_receipt_id, line_no)
);
CREATE INDEX goods_receipt_line_item_idx ON goods_receipt_line (item_id);

CREATE TABLE goods_receipt_audit (
  id uuid PRIMARY KEY,
  goods_receipt_id uuid NOT NULL REFERENCES goods_receipt(id) ON DELETE RESTRICT,
  branch_id text NOT NULL CHECK (length(btrim(branch_id)) > 0),
  actor_id text NOT NULL CHECK (length(btrim(actor_id)) > 0),
  actor_role text NOT NULL CHECK (actor_role IN ('OWNER', 'MANAGER')),
  action text NOT NULL CHECK (action = 'CREATE'),
  before_data jsonb,
  after_data jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (before_data IS NULL)
);
CREATE INDEX goods_receipt_audit_receipt_idx ON goods_receipt_audit (goods_receipt_id, occurred_at);

-- 5. Receipts are create-only (owner decision: corrections are adjustments).
CREATE TRIGGER goods_receipt_no_update BEFORE UPDATE ON goods_receipt
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER goods_receipt_no_delete BEFORE DELETE ON goods_receipt
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER goods_receipt_no_truncate BEFORE TRUNCATE ON goods_receipt
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER goods_receipt_line_no_update BEFORE UPDATE ON goods_receipt_line
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER goods_receipt_line_no_delete BEFORE DELETE ON goods_receipt_line
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER goods_receipt_line_no_truncate BEFORE TRUNCATE ON goods_receipt_line
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER goods_receipt_audit_immutable BEFORE UPDATE OR DELETE ON goods_receipt_audit
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER goods_receipt_audit_no_truncate BEFORE TRUNCATE ON goods_receipt_audit
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();

-- Down Migration
DO $$ BEGIN
  RAISE EXCEPTION 'Destructive Inventory rollback is prohibited: preserve goods receipts, stock movements and audit history';
END $$;
