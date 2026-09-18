# ADR-0007: S-02 UOM/Brand/Pack Variant Schema and Migration Safety Decisions

Date: 2026-09-18
Status: **APPROVED — owner-selected 2026-09-18**
Scope: Inventory S-02 (UOM, Brand & Pack Variant Masters). Records the technical decisions made within the owner-approved S-02 scope and architecture/implementation plan; does not itself grant new business authority.
Approval source: Owner-approved S-02 architecture/implementation plan on 2026-09-18, including the owner-directed safety refinement to the base_uom migration.

## Approved decisions

### D-01 — UOM Master and Brand Master are global, branch-independent catalogs

`uom_master` and `brand_master` carry no `branch_id`. A UOM ("KG") or a brand identity ("Brand A") means the same thing regardless of which branch created or references it. This mirrors the existing global-uniqueness philosophy already approved for `item_code` (ADR-0006 O-01): shared reference/catalog data is global; only operational records (`item_master`) are branch-owned. If a genuine need for branch-specific units or brands is ever identified, that is a future business decision, not assumed here.

### D-02 — Pack Variant carries no redundant branch_id

`pack_variant` has no `branch_id` column. Its branch ownership is entirely inherited through `item_id -> item_master.branch_id`. Authorization for Pack Variant create/edit is enforced in the repository layer by verifying the referenced item belongs to the caller's authorized branch (`AuthContext.branchId`) inside the same transaction, returning the same 404 for "item not found" and "item belongs to a different branch" — never leaking cross-branch existence, consistent with Item Master's own update-lookup behavior (S-01).

### D-03 — One audit table per new entity, not a single polymorphic table

`uom_audit`, `brand_audit`, and `pack_variant_audit` are dedicated tables, each with a strict foreign key to its own entity, mirroring `inventory_audit`'s existing shape exactly. All four audit tables share the same existing, already-generic `inventory_reject_history_mutation()` trigger function unchanged. This was chosen over a single polymorphic audit table to avoid altering the already-shipped `inventory_audit` table and to preserve strong per-table referential integrity; a future consolidation remains possible if the per-entity duplication becomes a real maintenance cost.

### D-04 — conversion_factor precision and transport

`pack_variant.conversion_factor` is `NUMERIC(18,6)`, `CHECK (conversion_factor > 0)`. At the API boundary it is validated and transported as a decimal **string** (e.g. `"16"`, `"16.5"`), never a JSON number — a JSON number is already a JS float the instant it is parsed, which would silently break the "never float" requirement even with a `NUMERIC` column underneath. This keeps the guarantee end-to-end, not only at rest in PostgreSQL.

### D-05 — base_uom migration: never guess unit_type for an unmatched legacy value (owner-directed safety refinement)

The migration backfills `item_master.base_uom_id` from the existing free-text `base_uom` by a case-insensitive/trimmed match against `uom_master`. If any legacy value has no match, the migration halts inside a `DO` block, raising an exception that lists every unmatched value, **before** `base_uom_id` is ever set `NOT NULL` or FK-constrained. Because the whole migration file runs as one transaction, a halt here rolls back atomically — no partial schema state, no guessed `unit_type` ever committed. Verified directly (manual migration run against real PostgreSQL, confirmed atomic rollback) and by an automated integration test that seeds an unmatched fixture row before invoking the migration.

### D-06 — Legacy base_uom text preserved one release cycle, not dropped

The original `base_uom` column is renamed to `base_uom_legacy_text` (nullable, unused by the application, not part of any API contract) rather than dropped in this migration. This is a pure data-safety margin for the one genuinely irreversible step in the migration; a later migration may drop it once the backfill is verified against real (non-test) data. The DOWN migration refuses to run at all, matching S-01's existing precedent (ADR-0006 / `202609170001_inventory_s01.sql`) — no destructive rollback path exists for either migration.

### D-07 — Minimal read endpoints for the three new masters

`GET /api/inventory/uoms`, `/brands`, `/pack-variants` (list, Owner/Manager gated, same as create/edit) were added even though not explicitly itemized in the original endpoint list. Reference/catalog data that can only be created and never listed is not practically usable — this is a routine technical-completeness call within the approved "core frame" scope, not a new business capability. No read access was extended to any role beyond Owner/Manager, since no other role's inventory access has been approved yet (open item B-09/PC-09).

## Consequences and limits

This ADR does not decide: Supplier Master or any Purchasing/Rate-History schema (deferred to a future Purchasing-foundation slice per the owner-approved S-02 scope boundary); the eventual dropping of `base_uom_legacy_text`; any future per-branch UOM/Brand need; a permission matrix for roles beyond Owner/Manager. No business rule, requirement, ADR-0001..0006 content, or architecture/security baseline is changed by this ADR.

## Relation to approved S-02 scope and acceptance criteria

| Decision | Scope item covered |
|---|---|
| D-01, D-02 | "no redundant branch_id" on Pack Variant; branch ownership via referenced item |
| D-03 | "Reuse append-only/immutable audit approach from S-01 wherever appropriate" |
| D-04 | "conversion_factor must be NUMERIC, never float" |
| D-05, D-06 | Owner-directed base_uom migration safety refinement |
| D-07 | Implicit usability requirement for "custom UOM creation", "Brand create/edit/list", "Pack Variant create/edit/list" |

## Validation

Consistent with: ADR-0002/0003 (Item Master mandatory fields, Base UOM ownership unchanged), ADR-0005 (API-level authorization enforcement, reused unchanged), ADR-0006 (global-catalog precedent for item_code, injected AuthContext pattern reused unchanged). No business rule invented; no destructive operation performed.
