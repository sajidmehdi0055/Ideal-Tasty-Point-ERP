-- Up Migration
-- AI-S01: append-only AI audit log (ADR-0011 D-07). Additive only: no existing
-- table or row is changed. Stores who asked the AI, which provider/model and
-- prompt version answered, which ERP tools were requested, the permission
-- result, approval status and outcome. The user's message text and the model's
-- answers are intentionally NOT stored. The runtime role gets INSERT only.

CREATE TABLE ai_audit_log (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL,
  conversation_id uuid,
  branch_id text NOT NULL CHECK (length(btrim(branch_id)) > 0),
  actor_id text NOT NULL CHECK (length(btrim(actor_id)) > 0),
  actor_role text NOT NULL CHECK (length(btrim(actor_role)) > 0),
  event_type text NOT NULL CHECK (event_type IN ('CHAT', 'TOOL_CALL')),
  provider text,
  model text,
  prompt_version text NOT NULL CHECK (length(btrim(prompt_version)) > 0),
  tool_name text CHECK (tool_name IS NULL OR length(tool_name) BETWEEN 1 AND 100),
  tool_mode text CHECK (tool_mode IN ('READ', 'WRITE')),
  tool_params jsonb,
  permission_result text CHECK (permission_result IN ('ALLOWED', 'DENIED')),
  approval_status text CHECK (approval_status IN ('NOT_REQUIRED', 'PENDING')),
  outcome text NOT NULL CHECK (outcome IN ('SUCCESS', 'ERROR', 'DENIED', 'INVALID', 'UNKNOWN_TOOL', 'PROPOSED', 'PROVIDER_ERROR', 'LIMIT_REACHED')),
  error_code text,
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  details jsonb,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((event_type = 'TOOL_CALL') = (tool_name IS NOT NULL)),
  CHECK (event_type = 'TOOL_CALL' OR (tool_mode IS NULL AND tool_params IS NULL AND permission_result IS NULL))
);
CREATE INDEX ai_audit_log_branch_time_idx ON ai_audit_log (branch_id, occurred_at);
CREATE INDEX ai_audit_log_request_idx ON ai_audit_log (request_id);
CREATE INDEX ai_audit_log_actor_idx ON ai_audit_log (actor_id, occurred_at);

CREATE FUNCTION ai_reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AI audit history is append-only';
END $$;
CREATE TRIGGER ai_audit_log_immutable BEFORE UPDATE OR DELETE ON ai_audit_log
FOR EACH ROW EXECUTE FUNCTION ai_reject_audit_mutation();
CREATE TRIGGER ai_audit_log_no_truncate BEFORE TRUNCATE ON ai_audit_log
FOR EACH STATEMENT EXECUTE FUNCTION ai_reject_audit_mutation();

-- Down Migration
DO $$ BEGIN
  RAISE EXCEPTION 'Destructive AI audit rollback is prohibited: preserve AI audit history';
END $$;
