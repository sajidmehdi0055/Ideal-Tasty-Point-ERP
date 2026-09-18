-- Run with psql as migration owner, after creating a dedicated non-owner login:
-- psql ... -v runtime_role=inv_s01_runtime -f scripts/runtime-grants.sql
-- Role creation/password provisioning is deliberately external; do not embed secrets.
-- This script grants no role membership, ownership, DDL, DELETE or TRUNCATE.
GRANT USAGE ON SCHEMA public TO :"runtime_role";

GRANT SELECT ON item_master, uom_master, brand_master, pack_variant TO :"runtime_role";

GRANT INSERT (id, branch_id, item_name, primary_item_type, base_uom_id, brand)
  ON item_master TO :"runtime_role";
GRANT UPDATE (item_name, primary_item_type, base_uom_id, brand, updated_at)
  ON item_master TO :"runtime_role";
GRANT INSERT ON inventory_audit TO :"runtime_role";
GRANT USAGE ON SEQUENCE item_code_seq TO :"runtime_role";

GRANT INSERT (id, name, unit_type) ON uom_master TO :"runtime_role";
GRANT UPDATE (name, unit_type, active, updated_at) ON uom_master TO :"runtime_role";
GRANT INSERT ON uom_audit TO :"runtime_role";

GRANT INSERT (id, name) ON brand_master TO :"runtime_role";
GRANT UPDATE (name, active, updated_at) ON brand_master TO :"runtime_role";
GRANT INSERT ON brand_audit TO :"runtime_role";

GRANT INSERT (id, item_id, brand_id, pack_uom_id, conversion_factor) ON pack_variant TO :"runtime_role";
GRANT UPDATE (conversion_factor, active, updated_at) ON pack_variant TO :"runtime_role";
GRANT INSERT ON pack_variant_audit TO :"runtime_role";
