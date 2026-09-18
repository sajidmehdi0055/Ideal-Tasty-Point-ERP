# Inventory S-02 implementation and traceability

Branch: feat/inv-s02-uom-brand-pack. Base: main (663662e -> 163c953, S-01 already merged). Authority: owner-approved S-02 scope ("Inventory S-02: UOM, Brand & Pack Variant Masters") and its approved implementation/schema plan, including the owner-directed safety refinement to the base_uom migration. ADR-0001..0006 unchanged; a new ADR-0007 records the S-02 technical decisions below.

## Bounded task and contracts

Allowed code: backend/ only; docs/engineering/ and docs/decisions/ for evidence and the new ADR; backend/README.md and root README.md for status. No requirements, architecture, or security-baseline document changed. Frontend, Redis, Supplier Master, Purchasing, Rate History, Costing, and all later-slice functionality are explicitly excluded per the approved scope.

Claude Code implemented, self-tested, and self-reviewed this slice in one session (Manager-led, per the persisted multi-agent operating model). Independent review (Codex) has not yet run on this candidate — see CURRENT-HANDOFF.md.

## Requirement coverage

| Requirement (approved S-02 scope) | Implementation / verification |
|---|---|
| UOM Master: seed, custom, duplicate control, unit_type, active | `uom_master` table + trigger immutability; 12 seeded rows with fixed UUIDs; case-insensitive/trimmed unique index; service-layer pre-check + DB-level 409 on race; unit/integration tests |
| Item Base UOM -> FK | `item_master.base_uom_id` FK, resolved from/to the existing `base_uom` string at the API boundary inside `PgItemRepository`; migration backfill with safety refinement (below); existing S-01 tests re-verified unchanged |
| Brand Master: global, standalone, no forced join table | `brand_master` table; Item<->Brand relationship expressed only through `pack_variant` rows, never a separate join table; seeded "Generic / No Brand" sentinel (ADR-0003) |
| Pack Variant: item+brand+pack UOM+conversion, own identity | `pack_variant` table; `UNIQUE(item_id, brand_id, pack_uom_id, conversion_factor)` allows multiple sizes of the same item+brand+container while blocking exact duplicates; identity-immutable trigger (item/brand/pack UOM/created_at) |
| conversion_factor NUMERIC(18,6) > 0, never float | DB column type + CHECK; API transports it as a validated decimal string end-to-end, never a JSON number |
| No redundant branch_id on Pack Variant | Branch ownership enforced via `item_id -> item_master.branch_id` in the repository layer, verified under a real cross-branch integration test |
| Existing S-01 items valid with zero Pack Variant rows | No FK/trigger requires a Pack Variant to exist; dedicated integration test |
| Safety refinement: no guessed unit_type for unmatched legacy base_uom | Migration `DO` block halts with the full unmatched-value list before enforcing NOT NULL/FK; proven both by direct migration testing (atomic rollback) and an integration test |
| Legacy text preserved one cycle, no destructive drop | `base_uom` renamed to `base_uom_legacy_text`, nullable, unused by the app; DOWN migration refuses to run (matches S-01's precedent) |
| Reuse S-01 AuthContext/Owner-Manager pattern, no RBAC redesign | Every new route calls the existing `requireItemEditor` unchanged; no new role or permission concept introduced |
| Reuse append-only/immutable audit pattern | `uom_audit`/`brand_audit`/`pack_variant_audit`, same shape and same shared `inventory_reject_history_mutation()` trigger function as `inventory_audit`; entity write + audit insert in one transaction |
| Testing per the approved list | See Verification results in CURRENT-HANDOFF.md; 105 new unit tests + 21 new integration tests, plus 2 new item-integration tests, all against real PostgreSQL for the integration layer |

Out of scope and not implemented, confirmed absent from `backend/src`: Supplier Master, Purchase Orders, GRN, Supplier Ledger, Payments, Purchase Rate History, Rate Alerts, Stock In/Out, Transfers, Kitchen Issues, Lots/Expiry, Reorder, Stock Valuation, Moving Average/actual-batch costing, Barcode/QR, Production/Recipe, Reports/Dashboards.

## Technical choices (recorded in ADR-0007)

- UOM Master and Brand Master are global, branch-independent catalogs; Pack Variant carries no `branch_id` of its own and inherits branch scoping entirely through its `item_id`.
- Audit is one dedicated table per new entity (not a single polymorphic table), reusing the existing generic immutability trigger function unchanged.
- `conversion_factor` is `NUMERIC(18,6)`, transported as a decimal string at the API boundary (never a JSON number) to keep the "never float" guarantee end-to-end, not only at rest.
- The `base_uom` backfill never guesses a `unit_type` for an unmatched legacy value; the migration halts and rolls back atomically instead, per the owner's explicit safety refinement.
- `base_uom_legacy_text` is kept, nullable and unused, for one release cycle as a migration safety net, not for any live application purpose.
- Minimal `GET` list endpoints were added for all three new masters (not explicitly requested in the original prompt list, but included as a routine technical-completeness call): reference/catalog data that can only be created and never listed is not practically usable.

## Technical choices and limits (carried over from S-01, unchanged)

Runtime credentials remain a dedicated non-owner role with column grants; migration-owner/administrator access is separate. Migration adds new objects and columns only; no existing business database is migrated in this task. Destructive down migration is refused; forward correction required.

Detailed commands, API format, and data model: ../../backend/README.md. Actual execution/review results belong in CURRENT-HANDOFF.md; tests are not assumed passed here.
