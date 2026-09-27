# Inventory S-06 implementation and traceability — Purchase Order

Branch: feat/inventory-s06-purchase-order. Base: main (c30e289). Authority: owner decisions 2026-09-27 (ADR-0010). Implemented by the Cowork Manager session in its Linux VM (Node v24.21.0, embedded PostgreSQL 17.10). Independent QA review, push and Windows/Docker verification: see CURRENT-HANDOFF.

## APIs (Owner/Manager, branch-scoped)

| Method / path | Purpose | Errors |
|---|---|---|
| `POST /api/inventory/purchase-orders` | `{ supplier_id, order_date, lines: [{ item_id, brand_id, pack_variant_id, ordered_quantity, rate? }] }` (1–100 lines, one pack variant once) → 201, status `ISSUED`, `po_number` `PO-000001` | 400 VALIDATION_ERROR / INVALID_REFERENCE / INVALID_ORDER_DATE; 404 NOT_FOUND (item missing/other branch); 409 SUPPLIER_INACTIVE / ITEM_INACTIVE / PACK_VARIANT_INACTIVE |
| `GET /api/inventory/purchase-orders[?status=]` | summaries: po_number, supplier name, order date, status, line/receipt counts | 400 on unknown status/filter |
| `GET /api/inventory/purchase-orders/:id` | header, current lines with `received_quantity` / `pending_quantity` / `excess_quantity`, linked receipts | 404 PURCHASE_ORDER_NOT_FOUND |
| `PATCH /api/inventory/purchase-orders/:id` | nonempty subset of `supplier_id`, `order_date`, `lines` (replaces the whole line set → new revision) | 409 PO_NOT_EDITABLE (after first receipt / final); create errors; 404 |
| `POST /api/inventory/purchase-orders/:id/cancel` | `{ reason }` — only `ISSUED` (no receipt) → `CANCELLED` | 409 PO_STATUS_CONFLICT; 404 |
| `POST /api/inventory/purchase-orders/:id/close` | `{ reason }` — only `PARTIALLY_RECEIVED` → `CLOSED` | 409 PO_STATUS_CONFLICT; 404 |
| `POST /api/inventory/receipts` (changed, additive) | optional `purchase_order_id`; then every line needs `purchase_order_line_id` (once per receipt) | 404 PURCHASE_ORDER_NOT_FOUND; 409 PO_NOT_OPEN; 400 PO_SUPPLIER_MISMATCH / PO_LINE_MISMATCH; 409 RECEIPT_BEFORE_ORDER |

Receipt responses gain `purchase_order_id` (header) and `purchase_order_line_id` (lines), both `null` for direct receipts; the receipt list gains `purchase_order_id` and `po_number`.

## Database

Migration `202609270002_inventory_s06_purchase_order.sql` (additive): sequence `purchase_order_no_seq`; tables `purchase_order`, `purchase_order_line` (insert-only, `revision`), `purchase_order_audit`; nullable `goods_receipt.purchase_order_id` and `goods_receipt_line.purchase_order_line_id` (+ unique per receipt); triggers: PO number generation, PO update guard (identity, final states, edit-after-receipt, revision step, status transitions, status vs receipts and received quantities), PO line validation (current revision of an ISSUED PO, same branch, pack matches item+brand), receipt header/line PO validation, and no-delete/immutability triggers. `scripts/runtime-grants.sql`: SELECT on the new tables; column-limited INSERT on PO and lines; UPDATE only on `supplier_id, order_date, status, status_reason, revision, updated_at`; sequence USAGE; INSERT on the audit table; receipt INSERT column lists extended. No DELETE/TRUNCATE grant.

## Requirement → verification

| Requirement | Evidence (tests) |
|---|---|
| O-01 no approval, ISSUED on save | integration: HTTP create → ISSUED, revision 1, PO number, audit CREATE; no purchase record / stock written |
| O-02 optional link | integration: PO receipt and direct receipt side by side (direct has null PO fields); S-05 suite unchanged and green |
| O-03 partial + excess | integration: 6 of 10 → PARTIALLY_RECEIVED (pending 4); +5 → RECEIVED with excess 1; receipts listed on the PO |
| O-04 PO rate optional, receipt rate from bill | unit: rate optional/validated; integration: null PO rate; purchase record carries the receipt rate (1520) not the PO rate |
| O-05 edit until first receipt | integration: PATCH → revision 2, old revision rows kept, audit UPDATE before/after; old-revision line refused on receipt; edit after receipt → 409 PO_NOT_EDITABLE |
| O-06 auto RECEIVED / manual CLOSE | integration: auto RECEIVED; RECEIVED takes no receipt (409 PO_NOT_OPEN); close after partial receipt; close without receipt → 409 |
| O-07 cancel/close by Owner and Manager with reason | unit: reason required/trimmed/≤500, both roles allowed, others 403; integration: Manager cancels/closes, audit CANCEL/CLOSE, cancel after receipt → 409 |
| A-01..A-04 defaults | integration: future order date 400, backdating allowed, receipt before order date 409, supplier mismatch 400, PO line/pack mismatch 400; unit: duplicate pack variant 400 |
| Branch isolation | integration: other branch gets null/404 PURCHASE_ORDER_NOT_FOUND on get/list/edit/cancel/close/receipt; other-branch item on PO → 404; nothing written |
| Concurrency | integration: 6 parallel receipts of 2 on an order of 10 → exactly 5 succeed, 1 PO_NOT_OPEN, received 10, 5 RECEIPT audits; cancel-vs-receipt and edit-vs-receipt races (3 rounds) always end consistent; 8 parallel creates → unique numbers. Mutation: without the PO row lock in the receipt path this test fails |
| Shipped grants / immutability / backstops | integration (runtime role from `runtime-grants.sql`): PO number/branch UPDATE, DELETE, line UPDATE/DELETE, audit SELECT/DELETE denied; schema owner blocked by triggers (lines/audit immutable, no delete/truncate, identity, invalid transitions, status vs receipts, revision jump, final PO, line branch/pack/revision, direct receipt with PO line, receipt against a cancelled PO) |
| Atomicity | integration: failing second line on PO create / PO receipt leaves counts unchanged |

## Changes to existing code/tests

- `goods-receipt.ts` (domain): optional `purchase_order_id` / `purchase_order_line_id` with consistency rules; response types gain the two fields and `po_number` on summaries.
- `pg-goods-receipt-repository.ts`: optional PO lock/validation before the S-05 checks, `RECEIPT_BEFORE_ORDER`, insert of the link columns, PO status refresh + PO audit inside the same transaction. Direct-receipt path unchanged.
- `app.ts`, `server.ts`: wiring. `buildApp` wiring in 13 existing test files; migration-list assertions (2 files); the S-05 unit fixture gains the two null fields.

## Verification (Cowork VM, clean clone)

npm ci PASS · typecheck PASS · lint PASS · build PASS · unit 401/401 (9 files; 355 + 46 new) · integration 96/96 (6 files; 87 + 9 new) on PostgreSQL 17.10 with the authoritative migrate CLI and shipped runtime grants.
