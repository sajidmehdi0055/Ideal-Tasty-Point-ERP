# Inventory S-02 implementation and traceability

Branch: feat/inv-s02-uom-brand-pack. Base: main (663662e -> 163c953, S-01 already merged). Authority: owner-approved S-02 scope ("Inventory S-02: UOM, Brand & Pack Variant Masters") and its approved implementation/schema plan, including the owner-directed safety refinement to the base_uom migration. ADR-0001..0006 unchanged; a new ADR-0007 records the S-02 technical decisions below.

## Bounded task and contracts

Allowed code: backend/ only; docs/engineering/ and docs/decisions/ for evidence and the new ADR; backend/README.md and root README.md for status. No requirements, architecture, or security-baseline document changed. Frontend, Redis, Supplier Master, Purchasing, Rate History, Costing, and all later-slice functionality are explicitly excluded per the approved scope.

Claude Code implemented, self-tested, and self-reviewed this slice in one session (Manager-led, per the persisted multi-agent operating model).

## Independent review correction (2026-09-18)

Independent Codex review of commit `989208c` returned **FAIL** (2 BLOCKER, 3 MINOR). All five were fixed on this same branch, in a follow-up commit, without expanding scope:

- **BLOCKER 1** — `PackVariantRepository.list()` returned every branch's pack variants; the service validated role but discarded `AuthContext.branchId`. Fixed: `list(auth)` now joins `item_master` and filters by `auth.branchId`, exactly like `create`/`update` already did. See ADR-0007 D-08.
- **BLOCKER 2** — The single-transaction migration's documented recovery path ("add the missing UOM then rerun") was not actually executable, because a halt rolled back `uom_master` along with everything else. Fixed: split into Migration A (UOM/Brand, commits independently) and Migration B (item base_uom backfill + Pack Variant, depends on A). See ADR-0007 D-05.
- **MINOR 1** — `uom.ts`/`brand.ts` contained a literal NUL byte where `'\u0000'` (6 literal characters) was intended, from a file-write encoding issue. Fixed at the byte level; verified no NUL bytes remain anywhere in `backend/src`, `backend/tests`, `backend/migrations`, `backend/scripts`.
- **MINOR 2** — Integration tests duplicated `GRANT` statements instead of exercising the shipped `scripts/runtime-grants.sql`, and had already drifted (extra `SELECT` on audit tables the shipped script never grants). Fixed: tests now execute the actual shipped file via a shared helper. See ADR-0007 D-09.
- **MINOR 3** — No test proved the Pack Variant duplicate-conflict race was actually safe under concurrency. Fixed: added a 12-way concurrent identical-create test proving exactly one succeeds and the rest get `409 DUPLICATE_PACK_VARIANT`.

Full evidence for each: docs/engineering/CURRENT-HANDOFF.md.

## Requirement coverage

| Requirement (approved S-02 scope) | Implementation / verification |
|---|---|
| UOM Master: seed, custom, duplicate control, unit_type, active | `uom_master` table + trigger immutability; 12 seeded rows with fixed UUIDs; case-insensitive/trimmed unique index; service-layer pre-check + DB-level 409 on race; unit/integration tests |
| Item Base UOM -> FK | `item_master.base_uom_id` FK, resolved from/to the existing `base_uom` string at the API boundary inside `PgItemRepository`; migration backfill with safety refinement (below); existing S-01 tests re-verified unchanged |
| Brand Master: global, standalone, no forced join table | `brand_master` table; Item<->Brand relationship expressed only through `pack_variant` rows, never a separate join table; seeded "Generic / No Brand" sentinel (ADR-0003) |
| Pack Variant: item+brand+pack UOM+conversion, own identity | `pack_variant` table; `UNIQUE(item_id, brand_id, pack_uom_id, conversion_factor)` allows multiple sizes of the same item+brand+container while blocking exact duplicates; identity-immutable trigger (item/brand/pack UOM/created_at) |
| conversion_factor NUMERIC(18,6) > 0, never float | DB column type + CHECK; API transports it as a validated decimal string end-to-end, never a JSON number |
| No redundant branch_id on Pack Variant, including reads | Branch ownership enforced via `item_id -> item_master.branch_id` in the repository layer for create/update **and** list (BLOCKER 1 fix); verified under real cross-branch integration tests covering all three |
| Existing S-01 items valid with zero Pack Variant rows | No FK/trigger requires a Pack Variant to exist; dedicated integration test |
| Safety refinement: no guessed unit_type for unmatched legacy base_uom, with an executable recovery path | Split into Migration A (UOM/Brand, commits independently) and Migration B (backfill + safety-halt + Pack Variant); a Migration B halt leaves Migration A committed, so the documented recovery (classify the UOM explicitly, re-run) actually works; proven by direct migration testing and by an integration test running the complete 7-step recovery sequence (BLOCKER 2 fix) |
| Legacy text preserved one cycle, no destructive drop | `base_uom` renamed to `base_uom_legacy_text`, nullable, unused by the app; both migrations' DOWN refuses to run (matches S-01's precedent) |
| Reuse S-01 AuthContext/Owner-Manager pattern, no RBAC redesign | Every new route calls the existing `requireItemEditor` unchanged; no new role or permission concept introduced |
| Reuse append-only/immutable audit pattern | `uom_audit`/`brand_audit`/`pack_variant_audit`, same shape and same shared `inventory_reject_history_mutation()` trigger function as `inventory_audit`; entity write + audit insert in one transaction |
| Runtime grants: one authoritative source, exercised by tests | Integration tests execute the actual shipped `scripts/runtime-grants.sql` (MINOR 2 fix) instead of a duplicated grant list; a dedicated test proves a full create+edit cycle across all four entities using only those shipped grants |
| Pack Variant duplicate protection safe under concurrency | 12-way concurrent identical-create integration test: exactly one succeeds, the rest get `409 DUPLICATE_PACK_VARIANT` (MINOR 3 fix) |
| Testing per the approved list | See Verification results in CURRENT-HANDOFF.md, all against real PostgreSQL for the integration layer |

Out of scope and not implemented, confirmed absent from `backend/src`: Supplier Master, Purchase Orders, GRN, Supplier Ledger, Payments, Purchase Rate History, Rate Alerts, Stock In/Out, Transfers, Kitchen Issues, Lots/Expiry, Reorder, Stock Valuation, Moving Average/actual-batch costing, Barcode/QR, Production/Recipe, Reports/Dashboards.

## Technical choices (recorded in ADR-0007)

- UOM Master and Brand Master are global, branch-independent catalogs; Pack Variant carries no `branch_id` of its own and inherits branch scoping entirely through its `item_id` — for every read and write path, including `list()` (corrected per BLOCKER 1).
- Audit is one dedicated table per new entity (not a single polymorphic table), reusing the existing generic immutability trigger function unchanged.
- `conversion_factor` is `NUMERIC(18,6)`, transported as a decimal string at the API boundary (never a JSON number) to keep the "never float" guarantee end-to-end, not only at rest.
- The `base_uom` backfill never guesses a `unit_type` for an unmatched legacy value; it halts and rolls back, and — split across two migrations (corrected per BLOCKER 2) — the halt is actually recoverable: `uom_master` survives, an operator classifies the missing value, and re-running succeeds.
- `base_uom_legacy_text` is kept, nullable and unused, for one release cycle as a migration safety net, not for any live application purpose.
- Minimal `GET` list endpoints were added for all three new masters (not explicitly requested in the original prompt list, but included as a routine technical-completeness call): reference/catalog data that can only be created and never listed is not practically usable.
- Integration tests provision their runtime role by executing the actual shipped `scripts/runtime-grants.sql` (corrected per MINOR 2), never a hand-typed duplicate, so test and deployment permissions cannot silently diverge.

## Technical choices and limits (carried over from S-01, unchanged)

Runtime credentials remain a dedicated non-owner role with column grants; migration-owner/administrator access is separate. Migration adds new objects and columns only; no existing business database is migrated in this task. Destructive down migration is refused; forward correction required.

Detailed commands, API format, and data model: ../../backend/README.md. Actual execution/review results belong in CURRENT-HANDOFF.md; tests are not assumed passed here.
