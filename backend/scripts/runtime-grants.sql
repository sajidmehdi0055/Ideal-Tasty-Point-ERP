-- Run with psql as migration owner, after creating a dedicated non-owner login:
-- psql ... -v runtime_role=inv_s01_runtime -f scripts/runtime-grants.sql
-- Role creation/password provisioning is deliberately external; do not embed secrets.
-- This script grants no role membership, ownership, DDL, DELETE or TRUNCATE.
GRANT USAGE ON SCHEMA public TO :"runtime_role";
GRANT SELECT ON item_master TO :"runtime_role";
GRANT INSERT (id, branch_id, item_name, primary_item_type, base_uom, brand)
  ON item_master TO :"runtime_role";
GRANT UPDATE (item_name, primary_item_type, base_uom, brand, updated_at)
  ON item_master TO :"runtime_role";
GRANT INSERT ON inventory_audit TO :"runtime_role";
GRANT USAGE ON SEQUENCE item_code_seq TO :"runtime_role";
