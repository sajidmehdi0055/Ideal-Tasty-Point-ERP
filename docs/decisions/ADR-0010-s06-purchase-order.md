# ADR-0010: S-06 Purchase Order

Date: 2026-09-27
Status: **APPROVED — owner decisions 2026-09-27** (answered in the Cowork Manager session for S-06; technical design by the Manager within those decisions)
Scope: Inventory/Purchasing S-06. Partially addresses INV-16/INV-17 (ordered vs received, partial and excess receipt) and the "PO vs receiving" direction (roadmap §5.6). Builds on S-03 (Supplier, Purchase Record) and ADR-0009 (Goods Receiving). Does not close B-04, B-05 (returns), B-07, B-09, B-11; invoice-pending receipt and rejected quantities stay open.

## Owner decisions (2026-09-27)

- **O-01 — No approval step.** Owner or Manager creates a Purchase Order; on save it is final and open for receiving (status `ISSUED`). No draft/approval workflow in this slice.
- **O-02 — Receipt link is optional.** A goods receipt may be made against a PO, and direct receiving without a PO (S-05) continues unchanged (e.g. urgent cash purchases).
- **O-03 — Partial and excess receiving.** One PO may be received through many receipts. Receiving more than the ordered quantity is allowed; the system shows the excess (and the pending quantity).
- **O-04 — Rate.** The PO line rate is optional (an estimate, may be blank). The receipt line rate stays mandatory and is the actual bill rate (S-05 rule); only receipts create purchase records / rate history.
- **O-05 — Edit.** A PO may be edited (supplier, order date, lines, quantities, rates) only while no receipt has been made against it; every edit is audited. After the first receipt it cannot be edited.
- **O-06 — Completion.** A PO becomes `RECEIVED` automatically when every line has received at least its ordered quantity. If the remaining goods will not come, the PO can be closed manually (`CLOSED`, short-closed).
- **O-07 — Cancel and Close.** Owner and Manager may cancel (only while no receipt exists) or close a PO, with a mandatory reason; both are audited.

## Technical decisions

- **D-01 Lifecycle.** `ISSUED` (no receipts) → `PARTIALLY_RECEIVED` / `RECEIVED` (set by the receipt transaction) ; `ISSUED` → `CANCELLED` (cancel) ; `PARTIALLY_RECEIVED` → `CLOSED` (close) or `RECEIVED` (receipt). `RECEIVED`, `CLOSED`, `CANCELLED` are final. A PO with no receipts is cancelled, not closed; a PO with receipts is closed, not cancelled. `status_reason` is required exactly for `CLOSED`/`CANCELLED`.
- **D-02 Tables.** `purchase_order` (system `po_number` `PO-000001` from a sequence, `branch_id`, supplier, `order_date`, status, `status_reason`, `revision`), `purchase_order_line` (item, brand, pack variant, `ordered_quantity` in packs, optional `rate`, `revision`), `purchase_order_audit`. The PO carries `branch_id` itself because it has no branch-owned parent (the supplier is global); every line's item must be in the PO's branch.
- **D-03 Edit without deleting history.** Lines are insert-only and immutable. An edit that changes lines inserts a complete new line set with `revision + 1` and bumps `purchase_order.revision`; earlier revisions remain in the table (and in the audit before/after snapshot). Only lines of the current revision are shown and can be received against. No DELETE grant is needed.
- **D-04 Received quantity is derived, not stored.** received = sum of `goods_receipt_line.pack_quantity` linked to the PO line; pending = max(ordered − received, 0); excess = max(received − ordered, 0); all in PostgreSQL NUMERIC. Quantities are compared in the PO line's pack unit.
- **D-05 Receipt link.** `goods_receipt.purchase_order_id` and `goods_receipt_line.purchase_order_line_id` (both nullable, additive columns). The receipt transaction locks the PO row `FOR UPDATE`, validates, writes the receipt exactly as in S-05 (purchase records + RECEIPT stock movements), then recomputes and stores the PO status and writes a `RECEIPT` PO audit row. Edits, cancel and close lock the same row, so they serialise with receipts.
- **D-06 Database backstops.** Triggers reject: changes to PO identity (`id`, `po_number`, `branch_id`, `created_at`); any change to a final PO; editing supplier/date/revision once receipts exist; invalid status transitions; revision jumps; PO lines that are not for the current revision of an `ISSUED` PO, whose item is in another branch, or whose pack variant does not match item+brand; receipt headers against a PO that is not open, has another supplier or another branch; receipt lines whose PO line is not a current line of the receipt's PO with the same item/brand/pack variant (and PO lines on a direct receipt). UPDATE/DELETE/TRUNCATE of PO lines and audit rows are rejected even for the schema owner; DELETE/TRUNCATE of POs are rejected.
- **D-07 APIs (Owner/Manager, branch-scoped).** `POST /api/inventory/purchase-orders`, `GET /api/inventory/purchase-orders` (optional `?status=`), `GET /api/inventory/purchase-orders/:id` (lines with received/pending/excess, linked receipts), `PATCH /api/inventory/purchase-orders/:id`, `POST /api/inventory/purchase-orders/:id/cancel`, `POST /api/inventory/purchase-orders/:id/close`. `POST /api/inventory/receipts` accepts optional `purchase_order_id` and per-line `purchase_order_line_id`. Max 100 lines per PO.

## DEFAULT / ASSUMED (owner may revise; chosen as the stricter option so it can be relaxed later without breaking data)

- **A-01** Order date: today or earlier on the Asia/Karachi business date (backdating allowed), never future. A receipt against a PO cannot be dated before the PO's order date (`409 RECEIPT_BEFORE_ORDER`).
- **A-02** Inactive supplier, item or pack variant cannot be used on a new or edited PO (409), same as ADR-0009 A-02.
- **A-03** Every line of a PO-linked receipt must reference a current line of that PO with the same item, brand and pack variant; an item that is not on the PO (or a different brand/pack) is received through a separate direct receipt. A PO line appears at most once per receipt, and one pack variant at most once per PO.
- **A-04** The receipt supplier must be the PO supplier. The PO has no delivery location; the receipt chooses any active location of the branch (ADR-0009 A-03).
- **A-05** A `RECEIVED` PO takes no further receipts; goods arriving later go through direct receiving.
- **A-06** PO numbers use one global sequence (`PO-000001`, like `ITM-000001`); gaps after a failed transaction are normal.
- **A-07** No expected delivery date, notes, payment terms or delivery location on the PO in this slice (can be added later as additive fields).

## Out of scope

Approval workflow, Store Keeper role, invoice-pending receipts, rejected/returned quantities, supplier returns, supplier ledger/payments, PO printing/sending, expiry/lots, reorder suggestions, costing/valuation, frontend screens.

Supersedes: none. Amends ADR-0009 only additively (optional PO link on receipts; direct receipts unchanged). Related: ADR-0007, ADR-0008, ADR-0009.
