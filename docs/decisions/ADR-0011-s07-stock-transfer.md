# ADR-0011: S-07 Stock Transfer (two-step: send → receive)

Date: 2026-09-27
Status: **APPROVED — owner decisions 2026-09-27** (answered in the Cowork Manager session for S-07; technical design by the Manager within those decisions)
Scope: Inventory S-07. Partially closes B-04 (dispatch, physical receipt, in-transit stock and short/damaged receipt for location-to-location transfers) and implements the direction of INV-22 / roadmap §4.6 (Store → Upper Kitchen responsibility transfer, receiving side confirms, variance trackable). Builds on ADR-0008 (locations, ledger) and ADR-0009 (ledger rules). Does not close B-05 (returns, general negative stock), B-06, B-07, B-09, B-11; production consumption (D-03/D-11) is not modelled.

## Owner decisions (2026-09-27)

- **O-01 — Slice.** S-07 = Stock Transfer between stock locations (chosen over Physical Count, Expiry on Receiving and Reorder Levels).
- **O-02 — Two-step flow.** The sending side records the transfer ("Send"): stock leaves the source location at once and is *in transit*. The receiving side confirms ("Receive"): only then does the destination balance increase.
- **O-03 — Short/damaged receipt.** The receiver enters the quantity actually received per line. The difference (sent − received) is recorded as a transfer *variance* with a mandatory reason; it does not come back to any location (it is visible on the transfer as a loss/shortage).
- **O-04 — Unit.** Transfer quantities are entered in the item's Base UOM (same as opening/adjustment). Brand/pack are not part of stock identity, so they are not captured on a transfer.
- **O-05 — Correction.** While a transfer is not yet received, Owner or Manager may cancel it with a mandatory reason; the full sent quantity goes back to the source location. After receipt a transfer is final; mistakes are corrected with a reverse transfer or a reasoned ADJUSTMENT.

## Technical decisions

- **D-01 Lifecycle.** `SENT` → `RECEIVED` (receive) or `SENT` → `CANCELLED` (cancel). Both are final. `status_reason` is required exactly for `CANCELLED`.
- **D-02 Tables.** `stock_transfer` (system `transfer_number` `TRF-000001`, `from_location_id`, `to_location_id`, status, `status_reason`), `stock_transfer_line` (item, `sent_quantity` in Base UOM, link to its `TRANSFER_OUT` movement), `stock_transfer_settlement` (exactly one per line, kind `RECEIVE` or `CANCEL`: `received_quantity`, `variance_quantity = sent − received`, `variance_reason`, link to the `TRANSFER_IN` / `TRANSFER_RETURN` movement), `stock_transfer_audit`. Lines and settlements are insert-only; only the header status changes. No `branch_id` column: the branch is inherited from the source location, and a trigger requires the destination to be in the same branch (ADR-0009 D-01 pattern).
- **D-03 Ledger.** Three new `stock_movement` types, all without reason: `TRANSFER_OUT` (negative, source, at send), `TRANSFER_IN` (positive, destination, at receive, only when received > 0), `TRANSFER_RETURN` (positive, source, at cancel). No existing ledger row changes. The existing ledger trigger keeps applying: balance never below zero at the source, and "opening must be the first entry" — so a `TRANSFER_IN` may be the first stock at a destination (same as a receipt, ADR-0009 O-07), after which an opening entry is refused there.
- **D-04 In transit is derived, not stored.** In-transit quantity = `sent_quantity` of lines of `SENT` transfers. Variance is stored on the settlement row. Nothing is double-counted: the variance never has a ledger movement because the quantity already left the source at send.
- **D-05 Concurrency.** Send locks both locations `FOR SHARE` and takes the per item+location advisory lock (sorted by item) for the source before checking balances; receive/cancel lock the transfer row `FOR UPDATE` first, so a receive and a cancel of the same transfer serialise and exactly one wins. The ledger trigger re-checks the balance as the final guard.
- **D-06 Database backstops.** Triggers reject: header identity changes; any change to a final transfer; invalid status transitions; `RECEIVED`/`CANCELLED` without a matching settlement on every line; destination in another branch or equal to the source; lines added outside the transaction that created the transfer, or whose item is in another branch; a line or settlement whose movement is not the matching movement (type, item, location, quantity); settlements on a transfer that is not `SENT`, of mixed kinds, or with received > sent; UPDATE/DELETE/TRUNCATE of lines, settlements and audit rows even for the schema owner. Commit-time (deferred) checks: every `TRANSFER_*` movement is linked to exactly one transfer line/settlement, and every transfer has at least one line.
- **D-07 Location deactivation.** A location that is the source or destination of a `SENT` transfer cannot be deactivated (`409 LOCATION_HAS_PENDING_TRANSFERS`, with a database trigger as backstop), so in-transit stock can always be received or returned.
- **D-08 APIs (Owner/Manager, branch-scoped).** `POST /api/inventory/transfers` (send), `GET /api/inventory/transfers` (optional `?status=`), `GET /api/inventory/transfers/:id`, `POST /api/inventory/transfers/:id/receive`, `POST /api/inventory/transfers/:id/cancel`. Max 100 lines per transfer, each item at most once.

## DEFAULT / ASSUMED (owner may revise; chosen as the stricter option so it can be relaxed later without breaking data)

- **A-01** Any active location of the branch may send to any other active location of the same branch (no route restriction invented; freezer↔parent included).
- **A-02** Inactive item or location cannot be used on a new transfer (409). An item deactivated while in transit can still be received or cancelled, so stock is never stranded.
- **A-03** Received quantity may not exceed the sent quantity (`400 RECEIVED_EXCEEDS_SENT`); received 0 is allowed (all lost/damaged) with a reason. Excess on arrival is a separate ADJUSTMENT at the destination.
- **A-04** Receive covers every line of the transfer in one action (no partial receiving across several days).
- **A-05** No user-supplied transfer date: send/receive/cancel times are server time (no backdating). A date field can be added later.
- **A-06** Owner and Manager may send, receive and cancel; the same person may send and receive (no segregation rule until B-09 defines a Store Keeper / kitchen role).
- **A-07** Transfer numbers use one global sequence (`TRF-000001`); gaps after a failed transaction are normal.
- **A-08** No notes, demand/requisition link, vehicle/person carrying, or expected time on the transfer in this slice (additive later).

## Out of scope

Demand/requisition from kitchens (INV-24), production consumption and batch issue sheets, cross-branch transfers, partial receipts over time, transfer approval, Store Keeper / kitchen roles and the permission matrix (B-09), expiry/lots on transfers, valuation, frontend screens.

Supersedes: none. Amends ADR-0008 D-05 additively (pending transfers also block deactivation). Related: ADR-0008, ADR-0009, ADR-0010.
