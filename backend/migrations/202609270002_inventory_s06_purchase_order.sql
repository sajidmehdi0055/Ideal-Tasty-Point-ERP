-- Up Migration
-- S-06: Purchase Order (ADR-0010). Owner decisions 2026-09-27: no approval
-- step (a saved PO is ISSUED and open for receiving); linking a receipt to a
-- PO is optional (direct receiving stays); one PO may be received in many
-- receipts and more than ordered may be received (excess is shown); PO rate
-- is optional, the receipt rate stays mandatory; a PO can be edited only
-- while it has no receipt; it becomes RECEIVED automatically when every line
-- is fully received, otherwise it can be CLOSED; Owner/Manager may cancel
-- (no receipts yet) or close it with a reason. Additive only: no existing row
-- is changed.

-- 1. Purchase order header. branch_id is stored because the PO has no
-- branch-owned parent (suppliers are global). po_number is system generated.
CREATE SEQUENCE purchase_order_no_seq AS bigint START WITH 1 NO CYCLE;

CREATE TABLE purchase_order (
  id uuid PRIMARY KEY,
  po_number text NOT NULL UNIQUE,
  branch_id text NOT NULL CHECK (length(btrim(branch_id)) > 0),
  supplier_id uuid NOT NULL REFERENCES supplier_master(id) ON DELETE RESTRICT,
  order_date date NOT NULL,
  status text NOT NULL DEFAULT 'ISSUED'
    CHECK (status IN ('ISSUED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED')),
  status_reason text CHECK (status_reason IS NULL OR (length(btrim(status_reason)) > 0 AND length(status_reason) <= 500)),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((status IN ('CLOSED', 'CANCELLED')) = (status_reason IS NOT NULL))
);
CREATE INDEX purchase_order_branch_date_idx ON purchase_order (branch_id, order_date DESC, created_at DESC);
CREATE INDEX purchase_order_supplier_idx ON purchase_order (supplier_id);

CREATE FUNCTION inventory_generate_po_number() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sequence_value text;
BEGIN
  IF NEW.po_number IS NOT NULL THEN
    RAISE EXCEPTION 'Purchase order number must be system generated';
  END IF;
  IF NEW.status <> 'ISSUED' OR NEW.revision <> 1 OR NEW.status_reason IS NOT NULL THEN
    RAISE EXCEPTION 'A new purchase order starts as ISSUED, revision 1, without a status reason';
  END IF;
  sequence_value := nextval('purchase_order_no_seq')::text;
  NEW.po_number := 'PO-' || lpad(sequence_value, greatest(6, length(sequence_value)), '0');
  RETURN NEW;
END $$;
CREATE TRIGGER purchase_order_generate_number BEFORE INSERT ON purchase_order
FOR EACH ROW EXECUTE FUNCTION inventory_generate_po_number();

-- 2. Lines are insert-only. An edit inserts a complete new line set with the
-- next revision; earlier revisions stay as history (no DELETE needed).
-- ordered_quantity is in packs of the pack variant; rate is optional.
CREATE TABLE purchase_order_line (
  id uuid PRIMARY KEY,
  purchase_order_id uuid NOT NULL REFERENCES purchase_order(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  line_no integer NOT NULL CHECK (line_no > 0),
  item_id uuid NOT NULL REFERENCES item_master(id) ON DELETE RESTRICT,
  brand_id uuid NOT NULL REFERENCES brand_master(id) ON DELETE RESTRICT,
  pack_variant_id uuid NOT NULL REFERENCES pack_variant(id) ON DELETE RESTRICT,
  ordered_quantity numeric(18,6) NOT NULL CHECK (ordered_quantity > 0),
  rate numeric(18,6) CHECK (rate IS NULL OR rate > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (purchase_order_id, revision, line_no),
  UNIQUE (purchase_order_id, revision, pack_variant_id)
);
CREATE INDEX purchase_order_line_item_idx ON purchase_order_line (item_id);

CREATE TABLE purchase_order_audit (
  id uuid PRIMARY KEY,
  purchase_order_id uuid NOT NULL REFERENCES purchase_order(id) ON DELETE RESTRICT,
  branch_id text NOT NULL CHECK (length(btrim(branch_id)) > 0),
  actor_id text NOT NULL CHECK (length(btrim(actor_id)) > 0),
  actor_role text NOT NULL CHECK (actor_role IN ('OWNER', 'MANAGER')),
  action text NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'RECEIPT', 'CANCEL', 'CLOSE')),
  goods_receipt_id uuid,
  before_data jsonb,
  after_data jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((action = 'CREATE') = (before_data IS NULL)),
  CHECK ((action = 'RECEIPT') = (goods_receipt_id IS NOT NULL))
);
CREATE INDEX purchase_order_audit_po_idx ON purchase_order_audit (purchase_order_id, occurred_at);

-- 3. Optional PO link on goods receipts (nullable; existing receipts stay direct).
ALTER TABLE goods_receipt ADD COLUMN purchase_order_id uuid REFERENCES purchase_order(id) ON DELETE RESTRICT;
ALTER TABLE goods_receipt_line ADD COLUMN purchase_order_line_id uuid REFERENCES purchase_order_line(id) ON DELETE RESTRICT;
ALTER TABLE goods_receipt_line ADD CONSTRAINT goods_receipt_line_po_line_once UNIQUE (goods_receipt_id, purchase_order_line_id);
CREATE INDEX goods_receipt_po_idx ON goods_receipt (purchase_order_id) WHERE purchase_order_id IS NOT NULL;
CREATE INDEX goods_receipt_line_po_line_idx ON goods_receipt_line (purchase_order_line_id) WHERE purchase_order_line_id IS NOT NULL;
ALTER TABLE purchase_order_audit ADD CONSTRAINT purchase_order_audit_goods_receipt_fk
  FOREIGN KEY (goods_receipt_id) REFERENCES goods_receipt(id) ON DELETE RESTRICT;

-- 4. Backstops (the application checks the same rules with clear error codes).
CREATE FUNCTION inventory_guard_purchase_order_update() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE has_receipts boolean; all_received boolean;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.po_number IS DISTINCT FROM OLD.po_number
     OR NEW.branch_id IS DISTINCT FROM OLD.branch_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Purchase order identity, branch and creation time are immutable';
  END IF;
  IF OLD.status IN ('RECEIVED', 'CLOSED', 'CANCELLED') THEN
    RAISE EXCEPTION 'A % purchase order is final and cannot be changed', OLD.status;
  END IF;
  IF OLD.status <> 'ISSUED' AND (NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
       OR NEW.order_date IS DISTINCT FROM OLD.order_date OR NEW.revision IS DISTINCT FROM OLD.revision) THEN
    RAISE EXCEPTION 'A purchase order with receipts cannot be edited';
  END IF;
  IF NEW.revision IS DISTINCT FROM OLD.revision AND NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'Purchase order revision can only advance by one';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'ISSUED' AND NEW.status IN ('PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'))
    OR (OLD.status = 'PARTIALLY_RECEIVED' AND NEW.status IN ('RECEIVED', 'CLOSED'))) THEN
    RAISE EXCEPTION 'Invalid purchase order status change from % to %', OLD.status, NEW.status;
  END IF;
  SELECT EXISTS (SELECT 1 FROM goods_receipt WHERE purchase_order_id = NEW.id) INTO has_receipts;
  IF (NEW.status IN ('ISSUED', 'CANCELLED')) = has_receipts THEN
    RAISE EXCEPTION 'Purchase order status % does not match its receipts', NEW.status;
  END IF;
  IF NEW.status IN ('PARTIALLY_RECEIVED', 'RECEIVED') THEN
    SELECT bool_and(COALESCE(r.received, 0) >= l.ordered_quantity) INTO all_received
      FROM purchase_order_line l
      LEFT JOIN LATERAL (SELECT sum(grl.pack_quantity) AS received FROM goods_receipt_line grl
                         WHERE grl.purchase_order_line_id = l.id) r ON true
     WHERE l.purchase_order_id = NEW.id AND l.revision = NEW.revision;
    IF (NEW.status = 'RECEIVED') IS DISTINCT FROM COALESCE(all_received, false) THEN
      RAISE EXCEPTION 'Purchase order status % does not match its received quantities', NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER purchase_order_guard_update BEFORE UPDATE ON purchase_order
FOR EACH ROW EXECUTE FUNCTION inventory_guard_purchase_order_update();

CREATE FUNCTION inventory_validate_purchase_order_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE po_branch text; po_status text; po_revision integer; item_branch text; pack_item uuid; pack_brand uuid;
BEGIN
  SELECT branch_id, status, revision INTO po_branch, po_status, po_revision FROM purchase_order WHERE id = NEW.purchase_order_id;
  IF po_status IS DISTINCT FROM 'ISSUED' OR NEW.revision IS DISTINCT FROM po_revision THEN
    RAISE EXCEPTION 'Purchase order lines can only be added to the current revision of an ISSUED purchase order';
  END IF;
  SELECT branch_id INTO item_branch FROM item_master WHERE id = NEW.item_id;
  IF item_branch IS DISTINCT FROM po_branch THEN
    RAISE EXCEPTION 'Purchase order line item must belong to the purchase order branch';
  END IF;
  SELECT item_id, brand_id INTO pack_item, pack_brand FROM pack_variant WHERE id = NEW.pack_variant_id;
  IF pack_item IS DISTINCT FROM NEW.item_id OR pack_brand IS DISTINCT FROM NEW.brand_id THEN
    RAISE EXCEPTION 'Purchase order line pack variant must match its item and brand';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER purchase_order_line_validate BEFORE INSERT ON purchase_order_line
FOR EACH ROW EXECUTE FUNCTION inventory_validate_purchase_order_line();

CREATE FUNCTION inventory_validate_goods_receipt_po() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE po_branch text; po_status text; po_supplier uuid; po_order_date date; location_branch text;
BEGIN
  IF NEW.purchase_order_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT branch_id, status, supplier_id, order_date INTO po_branch, po_status, po_supplier, po_order_date
    FROM purchase_order WHERE id = NEW.purchase_order_id FOR SHARE;
  IF po_status NOT IN ('ISSUED', 'PARTIALLY_RECEIVED') THEN
    RAISE EXCEPTION 'Goods can only be received against an open purchase order';
  END IF;
  IF po_supplier IS DISTINCT FROM NEW.supplier_id THEN
    RAISE EXCEPTION 'Receipt supplier must be the purchase order supplier';
  END IF;
  SELECT branch_id INTO location_branch FROM stock_location WHERE id = NEW.location_id;
  IF location_branch IS DISTINCT FROM po_branch THEN
    RAISE EXCEPTION 'Receipt location and purchase order must belong to the same branch';
  END IF;
  IF NEW.receipt_date < po_order_date THEN
    RAISE EXCEPTION 'Receipt date cannot be before the purchase order date';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER goods_receipt_validate_po BEFORE INSERT ON goods_receipt
FOR EACH ROW EXECUTE FUNCTION inventory_validate_goods_receipt_po();

CREATE FUNCTION inventory_validate_goods_receipt_line_po() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE header_po uuid; po_revision integer; line_po uuid; line_revision integer; line_item uuid; line_brand uuid; line_pack uuid;
BEGIN
  SELECT purchase_order_id INTO header_po FROM goods_receipt WHERE id = NEW.goods_receipt_id;
  IF header_po IS NULL THEN
    IF NEW.purchase_order_line_id IS NOT NULL THEN
      RAISE EXCEPTION 'A direct receipt line cannot reference a purchase order line';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.purchase_order_line_id IS NULL THEN
    RAISE EXCEPTION 'Every line of a purchase order receipt must reference a purchase order line';
  END IF;
  SELECT revision INTO po_revision FROM purchase_order WHERE id = header_po;
  SELECT purchase_order_id, revision, item_id, brand_id, pack_variant_id
    INTO line_po, line_revision, line_item, line_brand, line_pack
    FROM purchase_order_line WHERE id = NEW.purchase_order_line_id;
  IF line_po IS DISTINCT FROM header_po OR line_revision IS DISTINCT FROM po_revision THEN
    RAISE EXCEPTION 'Receipt line must reference a current line of the receipt purchase order';
  END IF;
  IF line_item IS DISTINCT FROM NEW.item_id OR line_brand IS DISTINCT FROM NEW.brand_id OR line_pack IS DISTINCT FROM NEW.pack_variant_id THEN
    RAISE EXCEPTION 'Receipt line item, brand and pack variant must match the purchase order line';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER goods_receipt_line_validate_po BEFORE INSERT ON goods_receipt_line
FOR EACH ROW EXECUTE FUNCTION inventory_validate_goods_receipt_line_po();

-- 5. History protection: POs are never deleted; lines and audit are immutable.
CREATE TRIGGER purchase_order_no_delete BEFORE DELETE ON purchase_order
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER purchase_order_no_truncate BEFORE TRUNCATE ON purchase_order
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER purchase_order_line_no_update BEFORE UPDATE ON purchase_order_line
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER purchase_order_line_no_delete BEFORE DELETE ON purchase_order_line
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER purchase_order_line_no_truncate BEFORE TRUNCATE ON purchase_order_line
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER purchase_order_audit_immutable BEFORE UPDATE OR DELETE ON purchase_order_audit
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER purchase_order_audit_no_truncate BEFORE TRUNCATE ON purchase_order_audit
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();

-- Down Migration
DO $$ BEGIN
  RAISE EXCEPTION 'Destructive Inventory rollback is prohibited: preserve purchase orders, goods receipts and audit history';
END $$;
