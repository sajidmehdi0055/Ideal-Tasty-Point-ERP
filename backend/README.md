# Inventory S-01/S-02/S-03 backend

Item Master create/edit (S-01), UOM/Brand/Pack Variant Masters (S-02), and Supplier Master + Purchase Record + Rate Comparison (S-03) are implemented. No UI, login/session system, Redis, stock operations, Purchase Orders/GRN/Supplier Ledger/Payments, or costing/valuation.

## Foundation

Node.js 24, strict TypeScript, Fastify, Zod, pg, dotenv; plain SQL migrations executed by node-pg-migrate; Vitest and Fastify inject; ESLint with TypeScript ESLint. Exact resolved versions are in package-lock.json. Dependencies were installed without lifecycle scripts. No ORM, CORS plugin or in-memory database emulator is needed. Node 24 already existed on the workstation.

Dependency rationale: Fastify is the approved HTTP server, Zod validates untrusted data, pg supplies PostgreSQL transactions, dotenv handles local configuration, node-pg-migrate tracks plain SQL changes. Vitest tests behavior and real PostgreSQL; ESLint/TypeScript check code; tsx supplies the development runner. No production frontend/session dependencies are introduced.

## Local development and migrations

Run commands from backend/. Use Node 24 and `npm ci --ignore-scripts`.

1. Supply a local `POSTGRES_PASSWORD`, then `docker compose up -d postgres`. Compose binds PostgreSQL only to loopback and contains no default password. Docker is optional if a compatible local PostgreSQL instance already exists; it is not installed automatically.
2. Provision an empty development database and a dedicated runtime login using your local PostgreSQL administrator. Keep administrator/migration credentials separate from API credentials. Do not use a superuser or table owner for the API.
3. Set `DATABASE_URL` to the migration-owner connection for `npm run migrate:check`, then `npm run migrate`. These commands default to up migrations only. Never apply to a production or existing business database without a separate migration approval.
4. As owner, grant the dedicated runtime login privileges with `psql ... -v runtime_role=YOUR_RUNTIME_ROLE -v schema_name=public -f scripts/runtime-grants.sql`. The login must not inherit elevated memberships, own schema/tables, or have sequence UPDATE privilege. The grant file does not create accounts or passwords. This is the single authoritative grant source: integration tests execute this same file (substituting their own per-run isolated schema for `schema_name`) instead of duplicating grant statements — see `tests/integration/helpers/runtime-grants.ts`.
5. Set API `DATABASE_URL` to the runtime login (see .env.example), then `npm run dev` or `npm run build` and `npm start`.

The standalone server binds to 127.0.0.1 and intentionally denies mutations with 401 until a trusted AuthContext provider is composed into `buildApp`. This is a backend slice, not a deployable public authentication system. Tests inject trusted contexts directly. There is no X-Auth-Context/header-to-role shortcut. A future trusted authentication adapter can provide current user/role/authorized branch without coupling domain logic to JWT or sessions.

## API contract

- `POST /api/inventory/items`: returns 201 and the persisted item after item and audit transaction commit.
- `PATCH /api/inventory/items/:id`: returns 200 and the updated item; at least one editable field required. ID is a system-generated UUID.

Create body (PATCH accepts a nonempty subset):

```json
{
  "item_name": "Example item",
  "primary_item_type": "RAW_MATERIAL",
  "base_uom": "kg",
  "brand": "Generic / No Brand"
}
```

Types: RAW_MATERIAL, WIP_SEMI_FINISHED, FINISHED_SELLING_PRODUCT, DIRECT_PURCHASE_SALE. Exactly one string value, never an array. Name/unit/brand must be nonblank text; units and brand are values, not new catalog-management workflows. Whitespace at edges is trimmed. Null, missing create fields and unknown properties are rejected. Code, ID, branch, timestamps and active state cannot be supplied or edited through this API.

Only OWNER or MANAGER in the trusted AuthContext may mutate. branch_id derives exclusively from its authorized branchId. Update selects by both ID and branch; an absent or different-branch item returns the same 404. Responses include item_code, branch_id, active=true on creation and timestamps. 400 indicates invalid input, 401 missing/invalid context, 403 other roles; 500 reports failure without exposing SQL/credentials. No audit-read permission; create/edit responses return the stored result.

`base_uom` stays a plain name string at this API boundary (e.g. `"kg"`); the server resolves it case-insensitively/trimmed against an existing **active** UOM Master row and stores a foreign key internally. An unresolvable name returns 400 `INVALID_BASE_UOM`. This is the one S-02 behavior change to the S-01 contract: `base_uom` must now name a real UOM, not arbitrary text.

### UOM Master

- `POST /api/inventory/uoms` `{ "name": "KG", "unit_type": "WEIGHT" }` → 201. `unit_type` is one of `WEIGHT`, `VOLUME`, `COUNT`, `PACKAGING`.
- `PATCH /api/inventory/uoms/:id` — nonempty subset of `name`/`unit_type`/`active`.
- `GET /api/inventory/uoms` — list, Owner/Manager only (there is no separate read-only role yet).

Twelve UOMs are seeded by the S-02 migration with fixed UUIDs: KG, GRAM, LITER, ML, PCS, PACKET, BOX, BAG, TIN, CARTON, CRATE, BOTTLE. Name uniqueness is case-insensitive and trimmed (`Kg`, `kg `, `KG` collide), enforced by a database unique index and re-checked on the API for a clean `409 DUPLICATE_UOM_NAME` under a concurrent race. No fuzzy/near-duplicate detection.

### Brand Master

- `POST /api/inventory/brands` `{ "name": "Brand A" }` → 201.
- `PATCH /api/inventory/brands/:id` — nonempty subset of `name`/`active`.
- `GET /api/inventory/brands` — list, Owner/Manager only.

Global, standalone catalog — not nested under Item. The S-02 migration seeds the approved non-branded sentinel `"Generic / No Brand"` (ADR-0003) so Pack Variant's `brand_id` can stay `NOT NULL`. Same case-insensitive/trimmed uniqueness as UOM.

### Pack Variant

- `POST /api/inventory/pack-variants` `{ "item_id": "...", "brand_id": "...", "pack_uom_id": "...", "conversion_factor": "16" }` → 201.
- `PATCH /api/inventory/pack-variants/:id` — nonempty subset of `conversion_factor`/`active` only; `item_id`/`brand_id`/`pack_uom_id` are immutable once created (a different combination is a different variant, not an edit).
- `GET /api/inventory/pack-variants` — list, Owner/Manager only.

`conversion_factor` is transported as a **decimal string** end-to-end (e.g. `"16"`, `"16.5"`), never a JSON number, so the `NUMERIC(18,6)` "never float" guarantee holds at the API boundary too. Must be `> 0`; up to 6 fractional digits. Represents "1 of this pack = conversion_factor × the item's Base UOM" — it never redefines the item's Base UOM itself.

Pack Variant carries no `branch_id` of its own; branch ownership is enforced through the referenced item — for create/update via the same item lookup, and for `GET`/list via a `JOIN` to `item_master` filtered by the caller's `AuthContext.branchId`, so listing only ever returns pack variants belonging to the caller's own branch. Creating or editing a variant for an item that does not belong to the caller's authorized branch returns the same 404 as a missing item (`ITEM_NOT_FOUND` / `PACK_VARIANT_NOT_FOUND`), never leaking cross-branch existence. A bogus `brand_id`/`pack_uom_id` returns `400 INVALID_REFERENCE`. An exact duplicate (same item + brand + pack UOM + conversion factor) returns `409 DUPLICATE_PACK_VARIANT` — including under concurrent duplicate creation attempts, where the database's unique constraint is the final race-safe protection (exactly one attempt succeeds); different conversion factors for the same item/brand/pack UOM are explicitly allowed (different pack sizes).

### Supplier Master

- `POST /api/inventory/suppliers` `{ "name": "Al Barkat Traders", "contact": "0300-1234567", "type": "CASH" }` -> 201. `contact` is optional free text. `type` is one of `CASH`, `CREDIT`.
- `PATCH /api/inventory/suppliers/:id` -- nonempty subset of `name`/`contact`/`type`/`active`. Editing `name`/`contact`/`type` requires Owner or Manager, same as every other master; changing `active` (deactivate/reactivate) requires **Owner only** -- a Manager attempting to include `active` in the same PATCH, alone or bundled with another field, gets `403 FORBIDDEN` and nothing is written, even the other fields in that request.
- `GET /api/inventory/suppliers` -- list, Owner/Manager only.

Global, standalone catalog -- not nested under a branch or another entity, same shape as Brand Master. Same case-insensitive/trimmed name uniqueness as UOM/Brand (`409 DUPLICATE_SUPPLIER_NAME`, including under a concurrent race). No fuzzy/near-duplicate detection.

### Purchase Record

- `POST /api/inventory/purchases` `{ "supplier_id": "...", "item_id": "...", "brand_id": "...", "pack_variant_id": "...", "quantity": "10", "rate": "12.5", "purchase_date": "2026-09-20" }` -> 201.
- `GET /api/inventory/purchases` -- list, branch-scoped (via the referenced item, see below), Owner/Manager only.

**No PATCH/edit/void endpoint exists at all.** Once created, a purchase record is immutable in full (every field, not only identity columns) -- correcting or reversing a purchase record is an explicitly deferred, undecided business rule for a later slice, not something this API silently allows. This never touches stock/quantity-on-hand; there is no stock engine yet, and no Purchase Order/GRN/Supplier Ledger/Payments workflow in this slice -- it is purely a rate/history record.

`quantity` and `rate` are transported as **decimal strings** end-to-end (never JSON numbers), exactly like Pack Variant's `conversion_factor`, so the `NUMERIC(18,6)` "never float" guarantee holds at the API boundary too. Both must be `> 0`. `purchase_date` is a plain `YYYY-MM-DD` calendar date string; it must be a real calendar date (Postgres/JS Date parsing does not itself validate this -- "2026-02-30" is checked manually against real days-in-month/leap-year rules) and **cannot be in the future** (`400`); backdated/historical entries are explicitly allowed, since staff commonly enter historical records.

Purchase Record carries no `branch_id` of its own; branch ownership is enforced through the referenced `item_id`, exactly like Pack Variant -- for create via the item lookup, and for `GET`/list via a `JOIN` to `item_master` filtered by the caller's `AuthContext.branchId`. Creating a purchase record for an item that does not belong to the caller's authorized branch returns the same `404 ITEM_NOT_FOUND` as a missing item, never leaking cross-branch existence.

The referenced `pack_variant_id` must actually belong to the given `item_id` + `brand_id` combination (this is validated in application code, not only as a foreign key) -- a mismatch, or a `pack_variant_id`/`supplier_id` that does not exist at all, returns `400 INVALID_REFERENCE`.

### Rate Comparison

- `GET /api/inventory/purchases/rate-comparison?item_id=...&brand_id=...&pack_variant_id=...` -- read-only, branch-scoped via the same item-based isolation as Purchase Record, Owner/Manager only.

For the given item + brand + pack-variant combination, returns:

```json
{
  "item_id": "...", "brand_id": "...", "pack_variant_id": "...",
  "records_considered": 3,
  "current_rate": "13.000000",
  "previous_rate": "12.000000",
  "average_rate_last_3": "12.333333",
  "current_rate_per_base_uom": "0.812500",
  "percentage_change": "8.333333",
  "supplier_breakdown": [
    { "supplier_id": "...", "supplier_name": "...", "purchase_count": 2, "latest_rate": "13.000000", "average_rate": "12.500000" }
  ]
}
```

`current_rate`/`previous_rate` are the most recent and second-most-recent purchase (by `purchase_date`, then `created_at`, descending). `average_rate_last_3` averages up to the 3 most recent purchases (fewer if fewer exist). `current_rate_per_base_uom` is `current_rate / pack_variant.conversion_factor`. `percentage_change` is `(current - previous) / previous * 100`. All arithmetic is computed in PostgreSQL with `NUMERIC`, never JS floats, rounded to 6 decimal places. `supplier_breakdown` groups the **entire** purchase history for the combination by supplier (not only the last-3 window), so the owner can compare suppliers over time.

**No custom date-range filtering in this slice** -- only the last-3-purchases default view (deferred to a later slice). When fewer than 3 (or 2, or 0) purchase records exist yet, the endpoint degrades gracefully: whatever cannot be computed is `null` (`records_considered: 0` returns nulls for every stat and an empty `supplier_breakdown`, not an error). A `pack_variant_id` that exists but does not belong to the given `item_id`/`brand_id` returns the same `400 INVALID_REFERENCE` as Purchase Record create.

## Data and audit

`item_master`, `uom_master`, `brand_master`, `pack_variant`, `supplier_master`, `purchase_record`, their respective `*_audit` tables, and the global `item_code_seq` are the domain objects. A trigger generates ITM-000001-style codes; padding grows beyond six digits without truncation. UNIQUE(item_code) is global; branch_id is separate. Sequence allocation is concurrent-safe and may leave gaps after rollback. There is no sequence reset/recycling tool. Identity columns (id, code/FK-identity fields, branch, creation time) are immutable; no delete/archive endpoint on any master table — deactivate via `active` instead. `purchase_record` has no `active`/deactivate concept at all: it has no edit path of any kind, so every column (not only identity columns) is immutable once inserted.

`item_master.base_uom_id` is a foreign key into `uom_master` (migrated in S-02 from a free-text `base_uom` column). The original text is preserved, unused, as `base_uom_legacy_text` for one release cycle as a migration safety net — not read or written by the application, not part of any API contract, to be dropped in a later migration once verified against real (non-test) data.

Create and edit append actor, role, branch, action, before/after snapshots and timestamp in the same transaction, for every master table. Edit locks the row before merging changed fields. Audit UPDATE/DELETE/TRUNCATE triggers reject mutation on every audit table; runtime grants exclude destructive actions and sequence reset. Database superusers/owners remain an administrative trust boundary and must never be application credentials. This is application/database immutability, not external tamper-evident archival infrastructure.

The down migration intentionally fails instead of deleting history. Correct deployed schema/data using an independently reviewed forward migration. Test schemas/data are isolated and retained; no existing business data is reset.

### base_uom migration safety and recovery

S-02 ships as **two ordered migrations**, specifically so recovery from an unrecognized legacy value is actually executable, not just documented:

- `202609180001_inventory_s02_uom_brand.sql` ("Migration A"): creates and seeds `uom_master`/`brand_master` only. Commits on its own.
- `202609180002_inventory_s02_item_base_uom_pack_variant.sql` ("Migration B"): backfills `item_master.base_uom_id` from the existing `base_uom` text by a case-insensitive/trimmed match against `uom_master`, then creates `pack_variant`. Depends on Migration A already being applied.

Splitting the files is necessary but not sufficient: node-pg-migrate's `up` command defaults to `--single-transaction` (`true`), which wraps **every pending migration in one invocation into a single outer transaction** — so without an explicit override, a batch run still rolls Migration A back along with Migration B on any failure, exactly as if there had been only one file. Both `migrate` and `migrate:check` in `package.json` therefore pass **`--no-single-transaction`** explicitly; this is the one authoritative place that setting is controlled, and every migration-applying path (normal execution, the dry-run check, and the integration test suite, which spawns this same CLI binary with the same flags rather than using the programmatic API independently — see `tests/integration/helpers/migrate-cli.ts`) goes through it.

If any legacy `base_uom` value has **no** match, Migration B halts with a clear list of the unmatched value(s) and rolls back — but only *its own* transaction. Migration A, already a separate, already-committed migration, is untouched. Recovery is a real, executable procedure using the exact same command you'd normally run:

1. Run `npm run migrate` (Migration A applies and commits; Migration B halts and lists the unmatched value(s); the command exits non-zero).
2. As the migration owner, `INSERT` the missing value into `uom_master` directly, choosing its `unit_type` deliberately — never guessed by anything automated.
3. Run `npm run migrate` again — the same command, unmodified. Migration B was never marked applied, so it retries and this time backfills successfully.

See `tests/integration/uom-brand-pack-postgres.test.ts`'s "base_uom migration safety refinement" describe block for the automated proof, driven entirely through the real CLI binary (not a bespoke runner invocation): successful backfill, Migration A surviving a Migration B halt, and the complete start-from-S-01 → run → halt → verify → classify → rerun-the-same-command → succeed → verify recovery sequence end to end against real PostgreSQL.

## Verification

```text
npm run typecheck
npm run lint
npm run migrate:check
npm run test:unit
npm run test:integration
npm run build
```

Integration tests require TEST_DATABASE_URL for an isolated test PostgreSQL database with administrative schema/role creation rights. They create unique schemas and a restricted runtime role, never truncate/drop existing business objects. No mock counts as PostgreSQL verification; missing test database fails visibly. Supply TEST_DATABASE_URL as an environment variable (test scripts do not read .env automatically). See tests/integration for precise checks and CURRENT-HANDOFF for actual results. Do not use a production connection.
