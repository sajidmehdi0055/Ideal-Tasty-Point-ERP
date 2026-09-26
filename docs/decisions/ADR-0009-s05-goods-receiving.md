# ADR-0009: S-05 Goods Receiving (direct, without Purchase Order)

Date: 2026-09-27
Status: **APPROVED — owner decisions 2026-09-27** (answered in the Cowork Manager session; technical design by the Manager within those decisions)
Scope: Inventory S-05. Partially addresses INV-17 and B-05 (receipt finality/correction only). Does not close B-04, B-06, B-07, B-09, B-11. Builds on ADR-0007 (Pack Variant), S-03 Purchase Record and ADR-0008 (stock ledger).

## Owner decisions (2026-09-27)

- **O-01 — No PO in this slice.** S-05 is direct goods receiving. Purchase Order is the next slice (S-06). No PO column/table is created now (no speculative schema); the design only avoids blocking a later PO link.
- **O-02 — One entry, two effects.** Receiving records supplier, item, brand, pack variant, quantity, rate and date once; it creates the S-03 purchase record (rate history) and increases stock in the S-04 ledger in the same transaction.
- **O-03 — Receipt date.** Today or earlier (backdating allowed), never in the future; and not before the item's opening stock date at that location.
- **O-04 — Correction.** A receipt is never edited or deleted. A wrong quantity is corrected with an S-04 ADJUSTMENT carrying a reason (Owner/Manager).
- **O-05 — Expiry.** No expiry capture in S-05 (B-07 remains open; expiry slice follows). Until then, goods of expiry-required items are received without an expiry date — a documented gap.
- **O-06 — Multi-line receipts.** One receipt (one supplier delivery/bill) may carry many lines; all lines are saved together or none.
- **O-07 — Receipt may be the first stock.** If no opening stock exists for an item+location, a receipt may create the first stock. An opening entry is then only allowed while no other entry exists (opening must be first).
- **O-08 — Supplier bill number.** Optional free-text field on the receipt.

## Technical decisions

- **D-01 Tables.** `goods_receipt` (supplier, location, `receipt_date`, optional `supplier_bill_no`) and `goods_receipt_line` (item, brand, pack variant, `pack_quantity`, `conversion_factor` snapshot, `base_quantity`, `rate`, and unique links to the created `purchase_record` and `stock_movement`). Branch is inherited from the location (no redundant `branch_id`), and every line's item must be in the caller's branch.
- **D-02 Ledger.** New `stock_movement.movement_type = 'RECEIPT'` (positive, no reason). No existing ledger row is changed. The ledger trigger now: rejects an OPENING when any entry already exists; allows an ADJUSTMENT when any earlier entry (opening or receipt) exists; keeps the non-negative balance rule and the per item+location advisory lock.
- **D-03 Quantities.** `base_quantity = round(pack_quantity × conversion_factor, 6)` computed in PostgreSQL NUMERIC. The factor is snapshotted on the line because Pack Variant factors are editable later. A base quantity that rounds to 0 or exceeds NUMERIC(18,6) is rejected (`400 INVALID_QUANTITY`). `rate` is per pack, as in S-03.
- **D-04 Purchase record.** Each line creates one `purchase_record` with `purchase_date = receipt_date`, `quantity = pack_quantity`, same rate — so S-03 lists and Rate Comparison include received purchases automatically. Purchase records stay immutable.
- **D-05 Concurrency.** Location/supplier/pack variant rows are locked `FOR SHARE`; item+location advisory locks are taken in sorted item order (no deadlock between receipts with lines in different order); the database trigger re-checks the ledger rules.
- **D-06 Create-only.** No PATCH/DELETE routes; runtime role has INSERT-only grants on receipt tables; UPDATE/DELETE/TRUNCATE triggers reject changes even for the schema owner. `goods_receipt_audit` stores the full receipt (incl. lines); each created purchase record and stock movement also gets its own existing audit row.
- **D-07 APIs.** `POST /api/inventory/receipts`, `GET /api/inventory/receipts` (branch-scoped summaries), `GET /api/inventory/receipts/:id`. Owner/Manager only (existing pattern). Max 100 lines per receipt.

## DEFAULT / ASSUMED (owner may revise)

- **A-01** Receipt date rules use the **Asia/Karachi** business date (a receipt at 01:00 local time is that local day). NOTE: the older standalone S-03 `POST /purchases` still validates "not future" in UTC — a known inconsistency for 00:00–05:00 PKT, left for a later fix.
- **A-02** Inactive supplier, location, item or pack variant cannot be used for a new receipt (409).
- **A-03** Any active location of the branch may receive goods (no location-type restriction invented).
- **A-04** Rate is mandatory on every line (O-02). Invoice-pending receiving (INV-17, PROPOSED) is out of scope.

## Out of scope

Purchase Orders (S-06), rejected/short/excess quantities, invoices/payments/supplier ledger, expiry/lots, transfers/issues, counts, costing/valuation, frontend screens, Store Keeper role.

Supersedes: none. Amends ADR-0008 D-03 (adjustment prerequisite is now "any earlier entry", opening must be first). Related: ADR-0007, ADR-0008.
