# Inventory S-05 implementation and traceability

Branch: feat/inv-s05-goods-receiving. Base: main (9abd28c). Authority: owner decisions 2026-09-27 (ADR-0009). Implemented by the Cowork Manager session in its Linux VM (Node v24.21.0, embedded PostgreSQL 17.10). Independent QA review and Windows/Docker verification pending.

## APIs (Owner/Manager, branch-scoped)

| Method / path | Purpose | Errors |
|---|---|---|
| `POST /api/inventory/receipts` | `{ supplier_id, location_id, receipt_date, supplier_bill_no?, lines: [{ item_id, brand_id, pack_variant_id, pack_quantity, rate }] }` (1–100 lines) | 400 VALIDATION_ERROR / INVALID_REFERENCE / INVALID_RECEIPT_DATE / INVALID_QUANTITY; 404 NOT_FOUND; 409 SUPPLIER_INACTIVE / LOCATION_INACTIVE / ITEM_INACTIVE / PACK_VARIANT_INACTIVE / RECEIPT_BEFORE_OPENING |
| `GET /api/inventory/receipts` | summaries: supplier/location names, date, bill no, line count | |
| `GET /api/inventory/receipts/:id` | receipt with lines | 404 RECEIPT_NOT_FOUND |

S-04 endpoints changed behaviour (ADR-0009 O-07): `POST /stock/opening` returns `409 STOCK_HISTORY_EXISTS` when receipts already exist; `POST /stock/adjustments` accepts receipt-only history (`OPENING_REQUIRED` now means "no opening or receipt yet").

## Database

Migration `202609270001_inventory_s05_goods_receiving.sql` (additive): RECEIPT movement type (constraints replaced), updated ledger trigger function, `goods_receipt`, `goods_receipt_line`, `goods_receipt_audit`, create-only triggers. `scripts/runtime-grants.sql`: SELECT on the new tables, INSERT-only column grants, INSERT on the audit table.

## Requirement → verification

| Requirement | Evidence (tests) |
|---|---|
| O-02 one entry → purchase record + stock | integration: multi-line HTTP receipt creates purchase records (date, qty, rate), RECEIPT movements, balances, Rate Comparison sees it |
| O-06 multi-line, all-or-nothing | integration: second-line failure leaves receipt/purchase/movement counts unchanged |
| O-03 date rules (Asia/Karachi) | integration: tomorrow → 400, before opening → 409, today OK, old date without opening OK; unit: format/calendar validation |
| O-04 correction by adjustment | integration: adjustment on receipt-only stock; negative balance still refused |
| O-07 receipt first, opening must be first | integration: opening after receipt → 409 STOCK_HISTORY_EXISTS; DB trigger rejects it for the schema owner; concurrency race keeps any opening first |
| D-03 quantity/precision | integration: 2.5 × 16 = 40.000000, 3 × 0.5 = 1.500000; 0.000001 × 0.1 → 400 INVALID_QUANTITY |
| References / inactive masters | integration: pack mismatch, unknown supplier (400); inactive supplier/location/pack variant (409) |
| Branch isolation | integration: other-branch location or item → 404, nothing written; get/list hide other branch |
| Concurrency | integration: 6 parallel receipts with lines in opposite order — no deadlock, exact totals |
| Create-only | integration: runtime UPDATE/DELETE denied; triggers block schema owner; audit immutable; unit: no PATCH/PUT/DELETE routes |
| Authorization | unit: OWNER/MANAGER allowed; other roles 403; missing/blank identity 401 |
| Mutation checks | removing the future-date check or the before-opening check makes the date-rules test fail |

## Changes to existing code/tests

- `domain/purchase-record.ts`: `isValidCalendarDate` exported (reused, unchanged).
- `pg-stock-repository.ts`: opening/adjustment prerequisites per O-07 (new code `STOCK_HISTORY_EXISTS`; `OPENING_REQUIRED` message updated).
- `buildApp` wiring gains `goodsReceiptRepository` in all unit/integration test files; migration-list assertions include the S-05 migration.

## Verification (Cowork VM)

npm ci PASS · typecheck PASS · lint PASS · build PASS · unit 355/355 (8 files; 319 + 36 new) · integration 87/87 (5 files; 80 + 7 new) on PostgreSQL 17.10 with the authoritative migrate CLI and shipped runtime grants. Windows/Docker PostgreSQL 17.11 re-run: pending.
