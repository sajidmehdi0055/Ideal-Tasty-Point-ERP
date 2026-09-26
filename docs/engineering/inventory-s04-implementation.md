# Inventory S-04 implementation and traceability

Branch: feat/inv-s04-locations-opening-stock. Base: main (971307f). Authority: owner decisions 2026-09-26 recorded in ADR-0008. Implemented by the Cowork Manager session; independent QA review pending.

## Scope

In: Stock Location master (create/rename/Owner-only activate), opening stock, adjustment corrections, current balances, movement history. Backend only.
Out (confirmed absent from `backend/src`): goods receiving, issue/transfer, counts, expiry/lots, reorder, valuation/costing, frontend screens.

## APIs (all Owner/Manager via `requireItemEditor`, all branch-scoped)

| Method / path | Purpose | Errors |
|---|---|---|
| `POST /api/inventory/locations` | create STORE/KITCHEN, or FREEZER with `parent_id` | 400 VALIDATION_ERROR / INVALID_PARENT, 409 DUPLICATE_LOCATION_NAME |
| `PATCH /api/inventory/locations/:id` | rename; `active` Owner-only | 403, 404 LOCATION_NOT_FOUND, 409 LOCATION_HAS_STOCK / LOCATION_HAS_ACTIVE_CHILDREN / PARENT_INACTIVE / DUPLICATE_LOCATION_NAME |
| `GET /api/inventory/locations` | branch locations incl. inactive | |
| `POST /api/inventory/stock/opening` | `{item_id, location_id, quantity}` Base UOM | 404 NOT_FOUND, 409 OPENING_ALREADY_EXISTS / LOCATION_INACTIVE / ITEM_INACTIVE |
| `POST /api/inventory/stock/adjustments` | `{item_id, location_id, quantity_delta, reason}` | 404, 409 OPENING_REQUIRED / NEGATIVE_BALANCE / LOCATION_INACTIVE |
| `GET /api/inventory/stock/balances?item_id&location_id` | current balance per item+location with item code/name/base UOM | |
| `GET /api/inventory/stock/movements?item_id&location_id` | ledger history, newest first | |

No PATCH/PUT/DELETE exists for movements or DELETE for locations.

## Database

Migration `202609260001_inventory_s04_locations_opening_stock.sql` (single file; creates new tables only, no backfill, so no halt-and-recover split is needed). Tables: `stock_location`, `stock_location_audit`, `stock_movement`, `stock_movement_audit`. Triggers: parent validation, identity immutability, movement validation (branch match, opening-first, non-negative balance under advisory lock), no-update/delete/truncate on ledger and audits. `scripts/runtime-grants.sql` extended (INSERT-only on the ledger).

## Requirement → verification

| Requirement | Evidence |
|---|---|
| Freezer under STORE/KITCHEN, same branch, active (O-02, D-01) | unit validation; integration: nested freezer, other-branch parent, inactive parent rejected in repository and in the DB |
| Name unique per branch, race-safe | 6-way concurrent create → exactly one winner; same name allowed in another branch |
| Owner-only active; Manager may rename | unit tests incl. bundled rename+active |
| Opening never edited; correction by ADJUSTMENT with reason (O-03) | integration: original row unchanged after adjustment, balance = sum, reason stored trimmed; runtime has no UPDATE/DELETE; triggers block schema owner |
| One opening per item+location | 6-way concurrent opening → exactly one, others 409 |
| Balance never negative (D-04) | 5 concurrent −3 on balance 10 → exactly 3 succeed; exact-to-zero allowed; DB trigger rejects direct negative insert |
| Branch isolation on every read/write | cross-branch item/location → 404 with nothing written; balances/movements/locations never show other branch; DB trigger rejects cross-branch pair |
| Deactivation safety (D-05) | LOCATION_HAS_STOCK, LOCATION_HAS_ACTIVE_CHILDREN, PARENT_INACTIVE covered |
| Atomic immutable audit | audit rows asserted equal to returned entity snapshots; audit UPDATE/DELETE rejected |
| Quantity-only (O-04) | no value/rate/cost column in S-04 tables |

## Changes to existing tests

- All 6 unit and 3 integration files: `buildApp` wiring gains `stockLocationRepository` / `stockRepository` (same kind of change S-03 made).
- Migration-list assertions in `item-postgres` and `uom-brand-pack-postgres` include the S-04 migration.
- S-03 test "never touches stock": previously asserted no `%stock%` table exists; S-04 legitimately adds stock tables, so it now asserts the purchase record wrote **no row to `stock_movement`** — same intent, still true.

## Verification (Cowork Linux VM, Node v24.21.0, PostgreSQL 17.10 embedded)

typecheck PASS · lint PASS · build PASS · unit 319/319 (7 files; 268 before + 51 new) · integration 80/80 (4 files; 61 before + 19 new). The owner's Docker PostgreSQL 17.11 environment was not used; a Windows re-run is recommended before merge.
