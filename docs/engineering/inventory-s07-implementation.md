# Inventory S-07 implementation and traceability — Stock Transfer

Branch: feat/inventory-s07-stock-transfer. Base: main (a6660e5). Authority: owner decisions 2026-09-27 (ADR-0011). Implemented by the Cowork Manager session in its Linux VM (Node v24.21.0, embedded PostgreSQL 17.10). Independent QA review, push and Windows/Docker verification: see CURRENT-HANDOFF.

## APIs (Owner/Manager, branch-scoped via the source location)

| Method / path | Purpose | Errors |
|---|---|---|
| `POST /api/inventory/transfers` | `{ from_location_id, to_location_id, lines: [{ item_id, quantity }] }` (1–100 lines, item once, Base UOM) → 201, status `SENT`, `transfer_number` `TRF-000001`; `TRANSFER_OUT` at the source | 400 VALIDATION_ERROR (incl. same source/destination); 404 NOT_FOUND (location/item missing or other branch); 409 LOCATION_INACTIVE / ITEM_INACTIVE / INSUFFICIENT_STOCK |
| `GET /api/inventory/transfers[?status=]` | summaries: number, from/to names, status, line count | 400 on unknown status/filter |
| `GET /api/inventory/transfers/:id` | header + lines (`sent_quantity`, `received_quantity`, `variance_quantity`, `variance_reason`, movement ids) | 404 TRANSFER_NOT_FOUND |
| `POST /api/inventory/transfers/:id/receive` | `{ lines: [{ line_id, received_quantity, variance_reason? }] }` every line once → `RECEIVED`; `TRANSFER_IN` at the destination when received > 0 | 400 RECEIVE_LINES_MISMATCH / RECEIVED_EXCEEDS_SENT / VARIANCE_REASON_REQUIRED / VARIANCE_REASON_NOT_ALLOWED; 409 TRANSFER_STATUS_CONFLICT; 404 |
| `POST /api/inventory/transfers/:id/cancel` | `{ reason }` only while `SENT` → `CANCELLED`; `TRANSFER_RETURN` of the full sent quantity at the source | 409 TRANSFER_STATUS_CONFLICT; 404 |
| `PATCH /api/inventory/locations/:id` (changed) | deactivation also refused with a pending transfer in or out | 409 LOCATION_HAS_PENDING_TRANSFERS |

`GET /api/inventory/stock/movements` now also returns `TRANSFER_OUT` / `TRANSFER_IN` / `TRANSFER_RETURN` rows (and the `StockMovement` type lists `RECEIPT`, which S-05 already wrote).

## Database

Migration `202609270003_inventory_s07_stock_transfer.sql` (additive): `stock_movement` type/sign CHECKs extended (`TRANSFER_OUT` < 0, `TRANSFER_IN`/`TRANSFER_RETURN` > 0, no reason); sequence `stock_transfer_no_seq`; tables `stock_transfer` (no `branch_id`, inherited from the source location), `stock_transfer_line` (insert-only), `stock_transfer_settlement` (one per line, `RECEIVE`/`CANCEL`, insert-only), `stock_transfer_audit`; triggers: number generation + same-branch destination, header guard (identity, final states, SENT → RECEIVED/CANCELLED only with matching settlements on every line), line validation (only in the creating transaction via `xmin = pg_current_xact_id()`, same branch, own `TRANSFER_OUT` movement), settlement validation (row-locks the header, SENT only, one kind per transfer, `0 ≤ received ≤ sent`, variance = sent − received, own `TRANSFER_IN`/`TRANSFER_RETURN` movement), deferred constraint triggers (every transfer movement linked; every transfer has lines), no update/delete/truncate on lines/settlements/audit and no delete/truncate on headers, and a `stock_location` trigger refusing deactivation with a pending transfer. `scripts/runtime-grants.sql`: SELECT on the three tables; INSERT `(id, from_location_id, to_location_id)`; UPDATE only `status, status_reason, updated_at`; sequence USAGE; column-limited INSERT on lines and settlements; INSERT on the audit table. No DELETE/TRUNCATE grant. Existing insert column lists are unchanged, but the grants must be re-applied (upgrade order: migrate → `runtime-grants.sql` → new build).

## Requirement → verification

| Requirement | Evidence (tests) |
|---|---|
| O-02 two-step, in transit | integration: HTTP send → SENT, source 10→6, destination unchanged, TRANSFER_OUT + movement audit, CREATE audit, `?status=SENT` lists it, detail equals the send response, movements list shows TRANSFER_OUT |
| O-02 receive | integration: full receive → RECEIVED, destination +4, TRANSFER_IN, RECEIVE audit before/after; second receive/cancel → 409; TRANSFER_IN as first stock then opening → 409 STOCK_HISTORY_EXISTS; adjustment afterwards allowed |
| O-03 variance | integration: 7.25 of 10 with reason → variance 2.75; 0 of 2 with reason → no TRANSFER_IN; source not credited; missing reason / excess / reason without shortage / missing or unknown line → 400 with nothing written; unit: `received_quantity` "0" allowed, reason trimmed, blank/long/NUL rejected |
| O-04 Base UOM | unit: decimal-string quantity rules; brand/pack fields rejected |
| O-05 cancel | integration: blank reason 400; cancel → CANCELLED, trimmed reason, TRANSFER_RETURN restores 10, CANCEL audit; receive afterwards 409 |
| A-01/A-02 | integration: inactive item/location 409, insufficient stock 409 (second line), nothing written; item deactivated in transit can still be received |
| D-07 deactivation | integration: source and destination blocked while SENT (repository 409 and DB trigger); allowed after receive when empty |
| Branch isolation | integration: other branch gets 404 TRANSFER_NOT_FOUND on get/receive/cancel, not in list; send with another branch's location/item → 404; nothing written |
| Concurrency | integration: 6 parallel sends of 3 from 10 → exactly 3 succeed, 3 INSUFFICIENT_STOCK, balance 1, unique numbers; receive vs cancel (5 rounds) → exactly one winner, clean 409 for the loser, balances consistent, one settlement per line; send vs deactivating the destination (3 rounds) → never both succeed |
| Shipped grants / immutability / backstops | integration (runtime role from `runtime-grants.sql`): identity/location UPDATE, DELETE, line/settlement UPDATE/DELETE, audit SELECT/DELETE, number insert denied; status change without settlements refused; schema owner blocked by triggers (immutable lines/settlements/audit, no delete/truncate, identity, final state, line outside creating transaction, unlinked TRANSFER_OUT/TRANSFER_IN at commit, transfer without lines at commit, cross-branch or same destination, received > sent, wrong movement, mixed RECEIVE/CANCEL, settlement on a final transfer, positive TRANSFER_OUT) |
| Mutation checks | each run against the integration suite and reverted: (M1) no transfer row lock in receive/cancel → race test fails; (M2) no source balance check on send → insufficient-stock and parallel-send tests fail; (M3) list without branch filter → isolation test fails; (M4) destination branch not checked on send → isolation test fails |

## Changes to existing code/tests

- `stock.ts` (domain): `STOCK_MOVEMENT_TYPES` lists all ledger types.
- `pg-stock-location-repository.ts`: pending-transfer check on deactivation.
- `app.ts`, `server.ts`: wiring (`stockTransferRepository` is a required `buildApp` option). `buildApp` wiring in 15 existing test files; migration-list assertions (2 files).

## Verification (Cowork VM, clean clone)

npm ci PASS · typecheck PASS · lint PASS · build PASS · unit 439/439 (10 files; 401 + 38 new) · integration 106/106 (7 files; 96 + 10 new) on PostgreSQL 17.10 with the authoritative migrate CLI and shipped runtime grants.
