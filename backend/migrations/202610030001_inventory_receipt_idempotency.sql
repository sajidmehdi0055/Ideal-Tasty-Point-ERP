-- Up Migration
-- Additive retry identity; no supplier bill uniqueness or historical changes.
CREATE TABLE goods_receipt_request (
  branch_id text NOT NULL CHECK (length(btrim(branch_id)) > 0),
  actor_id text NOT NULL CHECK (length(btrim(actor_id)) > 0),
  request_key text NOT NULL CHECK (request_key ~ '^[A-Za-z0-9_-]{1,128}$'),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  receipt_id uuid NOT NULL UNIQUE REFERENCES goods_receipt(id) ON DELETE RESTRICT,
  PRIMARY KEY (branch_id, actor_id, request_key)
);
CREATE TRIGGER goods_receipt_request_immutable BEFORE UPDATE OR DELETE ON goods_receipt_request
FOR EACH ROW EXECUTE FUNCTION inventory_reject_history_mutation();
CREATE TRIGGER goods_receipt_request_no_truncate BEFORE TRUNCATE ON goods_receipt_request
FOR EACH STATEMENT EXECUTE FUNCTION inventory_reject_history_mutation();
-- Down Migration
DO $$ BEGIN
  RAISE EXCEPTION 'Destructive rollback prohibited: preserve receipt retry identities';
END $$;
