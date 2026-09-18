# ADR-0007: S-02 UOM/Brand/Pack Variant Schema and Migration Safety Decisions

Date: 2026-09-18 (updated same day, twice, after independent Codex review — round 1: commit 989208c, FAIL, 2 BLOCKER + 3 MINOR; round 2 focused re-review: FAIL, 1 remaining BLOCKER; both corrected)
Status: **APPROVED — owner-selected 2026-09-18**
Scope: Inventory S-02 (UOM, Brand & Pack Variant Masters). Records the technical decisions made within the owner-approved S-02 scope and architecture/implementation plan; does not itself grant new business authority.
Approval source: Owner-approved S-02 architecture/implementation plan on 2026-09-18, including the owner-directed safety refinement to the base_uom migration.

**Update note (round 1):** D-05 originally described a single combined migration; independent review found its documented recovery path ("add the missing UOM then rerun") was not actually executable, because the single transaction rolled back `uom_master` along with everything else on failure. D-05 was corrected to describe a two-migration design. D-08 and D-09 are new, added for the same review's Pack Variant branch-isolation and runtime-grants-drift findings. D-01 through D-04, D-06, D-07 are unchanged from the original approval.

**Update note (round 2):** the round-1 two-migration split was real but, on its own, still inert: node-pg-migrate's `up` command defaults `--single-transaction` to `true`, so a normal `npm run migrate` batch run still wrapped both files in one outer transaction and rolled Migration A back along with Migration B on failure. D-05 below now describes the actually-executable fix: `--no-single-transaction` added to `package.json`'s `migrate`/`migrate:check` scripts, and the integration test suite re-verifying the entire recovery sequence by spawning the real CLI binary with those same flags rather than the programmatic API in isolation.

## Approved decisions

### D-01 — UOM Master and Brand Master are global, branch-independent catalogs

`uom_master` and `brand_master` carry no `branch_id`. A UOM ("KG") or a brand identity ("Brand A") means the same thing regardless of which branch created or references it. This mirrors the existing global-uniqueness philosophy already approved for `item_code` (ADR-0006 O-01): shared reference/catalog data is global; only operational records (`item_master`) are branch-owned. If a genuine need for branch-specific units or brands is ever identified, that is a future business decision, not assumed here.

### D-02 — Pack Variant carries no redundant branch_id

`pack_variant` has no `branch_id` column. Its branch ownership is entirely inherited through `item_id -> item_master.branch_id`. Authorization for Pack Variant create/edit is enforced in the repository layer by verifying the referenced item belongs to the caller's authorized branch (`AuthContext.branchId`) inside the same transaction, returning the same 404 for "item not found" and "item belongs to a different branch" — never leaking cross-branch existence, consistent with Item Master's own update-lookup behavior (S-01).

### D-03 — One audit table per new entity, not a single polymorphic table

`uom_audit`, `brand_audit`, and `pack_variant_audit` are dedicated tables, each with a strict foreign key to its own entity, mirroring `inventory_audit`'s existing shape exactly. All four audit tables share the same existing, already-generic `inventory_reject_history_mutation()` trigger function unchanged. This was chosen over a single polymorphic audit table to avoid altering the already-shipped `inventory_audit` table and to preserve strong per-table referential integrity; a future consolidation remains possible if the per-entity duplication becomes a real maintenance cost.

### D-04 — conversion_factor precision and transport

`pack_variant.conversion_factor` is `NUMERIC(18,6)`, `CHECK (conversion_factor > 0)`. At the API boundary it is validated and transported as a decimal **string** (e.g. `"16"`, `"16.5"`), never a JSON number — a JSON number is already a JS float the instant it is parsed, which would silently break the "never float" requirement even with a `NUMERIC` column underneath. This keeps the guarantee end-to-end, not only at rest in PostgreSQL.

### D-05 — base_uom migration: never guess unit_type for an unmatched legacy value, split into two executable-recovery migrations

The migration backfills `item_master.base_uom_id` from the existing free-text `base_uom` by a case-insensitive/trimmed match against `uom_master`. If any legacy value has no match, the migration halts inside a `DO` block, raising an exception that lists every unmatched value, **before** `base_uom_id` is ever set `NOT NULL` or FK-constrained.

This is split across two ordered migration files, specifically so the documented recovery path is actually executable rather than just aspirational:

- **Migration A** (`202609180001_inventory_s02_uom_brand.sql`): creates and seeds `uom_master` and `brand_master` (plus their audit tables and immutability triggers) only. Commits independently of anything item-related.
- **Migration B** (`202609180002_inventory_s02_item_base_uom_pack_variant.sql`): performs the `base_uom` backfill/safety-check, then creates `pack_variant`/`pack_variant_audit`. Depends on Migration A already having run.

Splitting the files alone is **not** sufficient. node-pg-migrate's `up` command defaults `--single-transaction` to `true`, which wraps every pending migration applied in one invocation into a single outer transaction — a second independent focused re-review confirmed that, without an explicit override, a real `npm run migrate` batch run still rolled Migration A back along with Migration B on failure, exactly as if there had been only one file (the split was real, but inert, because the runtime configuration still merged them). The fix is `--no-single-transaction`, added explicitly to both `migrate` and `migrate:check` in `package.json` — this is the single authoritative place that setting is controlled. With it set, a halt inside Migration B rolls back **only** Migration B — Migration A's `uom_master`/`brand_master` remain committed and queryable. The recovery path is therefore genuinely real: an operator can `INSERT` the missing UOM into the still-existing `uom_master` with a deliberately chosen `unit_type`, then re-run `npm run migrate`, unmodified; Migration B picks up from where it left off (it was never marked applied) and this time backfills successfully.

Verified against real PostgreSQL using the actual authoritative command (not the programmatic API in isolation, and not migrations applied as separate manually-split invocations): (1) manually, running the full start-from-S-01 → run `npm run migrate` → halt → inspect → classify → rerun the same command → succeed sequence by hand against a real database; (2) an automated integration test suite that spawns the real `node-pg-migrate` CLI binary with the same flags `npm run migrate` uses (`tests/integration/helpers/migrate-cli.ts`), proving Migration A survives a Migration B halt and executing the complete recovery sequence end to end (start from S-01, run the authoritative command, confirm the halt, confirm `uom_master` intact and Migration A recorded/Migration B not, classify the missing UOM, re-run the identical command, confirm backfill + FK + preserved legacy text + Pack Variant structures + the recovered item fully usable through a normal runtime-role connection).

### D-06 — Legacy base_uom text preserved one release cycle, not dropped

The original `base_uom` column is renamed to `base_uom_legacy_text` (nullable, unused by the application, not part of any API contract) rather than dropped in this migration. This is a pure data-safety margin for the one genuinely irreversible step in the migration; a later migration may drop it once the backfill is verified against real (non-test) data. The DOWN migration refuses to run at all, matching S-01's existing precedent (ADR-0006 / `202609170001_inventory_s01.sql`) — no destructive rollback path exists for either migration.

### D-07 — Minimal read endpoints for the three new masters

`GET /api/inventory/uoms`, `/brands`, `/pack-variants` (list, Owner/Manager gated, same as create/edit) were added even though not explicitly itemized in the original endpoint list. Reference/catalog data that can only be created and never listed is not practically usable — this is a routine technical-completeness call within the approved "core frame" scope, not a new business capability. No read access was extended to any role beyond Owner/Manager, since no other role's inventory access has been approved yet (open item B-09/PC-09).

### D-08 — Pack Variant list must be branch-scoped through the same item join as create/update (review correction)

Independent review found `PackVariantRepository.list()` returned every branch's pack variants — the service validated the caller's role but never used `AuthContext.branchId` to filter the read, while `create`/`update` already correctly scoped through `item_master.branch_id`. This was a genuine cross-branch read exposure, not a documentation gap. Fixed by changing `list(auth: AuthContext)` to `JOIN pack_variant` to `item_master` and filter `WHERE item_master.branch_id = auth.branchId`, exactly mirroring `update`'s existing join. `pack-variant-service.ts` now forwards the validated `AuthContext` from `requireItemEditor` into `repository.list(auth)` instead of discarding it after the role check. All Pack Variant read paths were reviewed; `list()` was the only one (create/update already returned only the affected, branch-checked row).

### D-09 — Integration tests execute the shipped runtime-grants.sql, not a duplicated grant list (review correction)

Independent review found the integration test harness re-typed its own `GRANT` statements instead of exercising `scripts/runtime-grants.sql`, and that this had already drifted (the test grants included `SELECT` on audit tables that the shipped script never grants, since the application only ever inserts into audit tables). Fixed by adding `tests/integration/helpers/runtime-grants.ts`, which reads the actual shipped file and substitutes its two psql variables (`:"runtime_role"`, `:"schema_name"` — see below) the same way `psql -v` would, then executes it as-is. `runtime-grants.sql` itself gained a `:"schema_name"` variable (previously a hardcoded `GRANT USAGE ON SCHEMA public`) so the one file serves both a real deployment (`schema_name=public`) and a test's own per-run isolated schema without needing two versions. Every test that exercises `create`/`update` through the `runtime`-role connection is itself running proof that the shipped grants suffice; a dedicated test additionally proves a full create+edit cycle across all four entities using only those shipped grants. Audit-content inspection in tests uses the admin/schema-owner connection, never the runtime role, matching real deployment (the application only ever inserts into audit tables, never reads them back).

## Consequences and limits

This ADR does not decide: Supplier Master or any Purchasing/Rate-History schema (deferred to a future Purchasing-foundation slice per the owner-approved S-02 scope boundary); the eventual dropping of `base_uom_legacy_text`; any future per-branch UOM/Brand need; a permission matrix for roles beyond Owner/Manager. No business rule, requirement, ADR-0001..0006 content, or architecture/security baseline is changed by this ADR.

## Relation to approved S-02 scope and acceptance criteria

| Decision | Scope item covered |
|---|---|
| D-01, D-02 | "no redundant branch_id" on Pack Variant; branch ownership via referenced item |
| D-03 | "Reuse append-only/immutable audit approach from S-01 wherever appropriate" |
| D-04 | "conversion_factor must be NUMERIC, never float" |
| D-05, D-06 | Owner-directed base_uom migration safety refinement, made executable |
| D-07 | Implicit usability requirement for "custom UOM creation", "Brand create/edit/list", "Pack Variant create/edit/list" |
| D-08 | Review-found cross-branch Pack Variant read exposure |
| D-09 | Review-found runtime-grants duplication/drift |

## Validation

Consistent with: ADR-0002/0003 (Item Master mandatory fields, Base UOM ownership unchanged), ADR-0005 (API-level authorization enforcement, reused unchanged), ADR-0006 (global-catalog precedent for item_code, injected AuthContext pattern reused unchanged). No business rule invented; no destructive operation performed.
