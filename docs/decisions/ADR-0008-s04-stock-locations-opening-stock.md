# ADR-0008: S-04 Stock Locations and Opening Stock (quantity-only)

Date: 2026-09-26
Status: **APPROVED — owner decisions 2026-09-26** (owner answered the four S-04 scoping questions in the Cowork Manager session)
Scope: Inventory S-04. Partially closes B-03 (location granularity) and closes B-10 for the first stock release (quantity-only). Does not close B-04, B-05 (beyond the opening-correction rule below), B-06, B-07, B-09 or B-11.

## Owner decisions (2026-09-26)

- **O-01 — Slice order.** S-04 = Stock Location master + opening stock + current balance, before Goods Receiving. Receiving, issue/transfer, counts, expiry/lots and reorder remain later slices.
- **O-02 — Location granularity (B-03, partial).** Every freezer is its own stock location, placed under one STORE or KITCHEN parent. Main store, rented store, Upper kitchen and Lower kitchen are top-level locations. Actual names are data, entered by users, not hard-coded.
- **O-03 — Opening stock correction.** An opening entry is never edited or deleted. A wrong opening is corrected by a separate ADJUSTMENT entry with a mandatory reason, made by Owner or Manager; everything stays in the audit trail.
- **O-04 — Valuation (B-10).** The first stock release is quantity-only. No Rs value, no costing method; costing remains an owner financial-policy decision (roadmap §6).

## Technical decisions (Manager, within the owner decisions)

- **D-01** `stock_location` is branch-owned (`branch_id`), types `STORE | KITCHEN | FREEZER`. FREEZER ⇔ has `parent_id`; parent must be an active STORE/KITCHEN in the same branch (composite FK `(parent_id, branch_id)` + insert trigger + repository check). Name unique per branch, case-insensitive/trimmed. Type and parent are immutable after creation; name is editable by Owner/Manager; `active` changes are Owner-only (same rule as Supplier/UOM/Brand).
- **D-02** Stock is an append-only ledger `stock_movement` (`OPENING | ADJUSTMENT`), quantities `NUMERIC(18,6)` in the item's Base UOM, transported as decimal strings. Balance = `SUM(quantity_delta)` per item + location; no stored balance column to drift. No `branch_id` column: ownership comes from item and location, which a trigger requires to match.
- **D-03** Exactly one OPENING per item + location (partial unique index). ADJUSTMENT requires an existing OPENING and may be positive or negative, never zero.
- **D-04 — DEFAULT / ASSUMED, owner may revise:** a balance may not go below zero in this slice (a physical quantity cannot be negative). This is not the general negative-stock policy for issues/sales, which stays open under B-05.
- **D-05 — DEFAULT / ASSUMED, owner may revise:** a location that still holds stock, or has active freezers under it, cannot be deactivated; a freezer cannot be reactivated under an inactive parent. This prevents stock from becoming invisible.
- **D-06** Concurrency: writers for one item+location are serialised by a transaction-scoped advisory lock taken both in the repository and in the `stock_movement` insert trigger; location rows are locked `FOR SHARE` by stock writes and `FOR UPDATE` by deactivation. The database trigger re-checks branch match, opening-first and non-negative balance as the final guard.
- **D-07** Append-only enforcement: no UPDATE/DELETE route; runtime role has INSERT-only column grants on `stock_movement`; `BEFORE UPDATE/DELETE/TRUNCATE` triggers reject changes even from the schema owner. One audit table per entity (`stock_location_audit`, `stock_movement_audit`), same immutable pattern as ADR-0007 D-03.
- **D-08** Opening quantity is entered in Base UOM only; entry by pack (Pack Variant conversion) is a later UI/receiving concern. No user-supplied movement date (server `created_at` only), so no backdating question arises in this slice.

## Explicitly not decided here

Goods receiving and its finality/invoice rules, transfers and in-transit/variance (B-04), general negative stock/backdating/returns (B-05), counts (B-06), expiry/lots (B-07), full permission matrix incl. Store Keeper role (B-09), reorder (B-11), valuation/costing (B-10 beyond "quantity-only first").

Supersedes: none. Related: ADR-0001, ADR-0006, ADR-0007.
