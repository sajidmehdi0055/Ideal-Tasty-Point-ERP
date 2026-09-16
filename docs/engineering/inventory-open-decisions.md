# Inventory Open Decisions

Date: 2026-09-17 (updated). Status: decision register, not answers. Sources: inventory-module.md v0.2, ADR-0001/0002/0003, readiness request. BLOCKING means before coding the affected slice, not that every future decision blocks Item Master. B-01 and B-02 are now CLOSED (ADR-0002, ADR-0003). Approved technical architecture remains a universal implementation gate. No coding currently authorized.

## Blocking before coding the affected capability

| ID | Source | Actual unresolved question / impact | Blocks |
|---|---|---|---|
| B-03 | INV-01/03; D-10 | What stock granularity/location hierarchy is needed (store, kitchen, freezer) and what approved opening-stock entry/correction procedure is required? | Location/balance initialization. Actual label values can be supplied later. |
| B-04 | D-03; INV-22/24 | How are dispatch, physical receipt, in-transit stock, partial receipt, loss/damage and kitchen transfer discrepancies recorded? | Movement/transfer design. Store-to-Upper responsibility already transfers at issue; do not ask that again. |
| B-05 | D-07; INV-16/17 | Negative stock, backdating, cancellation/correction, unused returns and supplier returns: what behaviors are permitted? What makes receipt final, including invoice-pending cases if included? | Stock posting and corrections. No default allow/block policy invented. |
| B-06 | D-02/04; INV-29..33 | Who counts/enters/verifies Lower Kitchen quantities if in scope? What cutoff/movements-during-count policy, variance adjustment authority/reasons and reopening/correction process apply? | Counts, closing, adjustments. Monthly Store counts, almost-daily Lower counts and daily wastage practices already recorded. |
| B-07 | D-08; INV-25..28 | Who changes expiry settings, what happens to expired stock on issue, and which lot-tracking policy (if any) is approved? How are multiple lots/expiry dates represented? | Expiry/lot posting. Mandatory/nonmandatory expiry per item is already confirmed. |
| B-08 | D-06; ADR-0001 | Who may merge, how is the survivor selected, how are incompatible units/brands/stock/history handled without loss? What effect does archive have on existing stock/open transactions? | Merge and archive workflow details. Owner-only archive and history prohibition are settled; do not reopen. |
| B-09 | section 10; D-04/06/08 | What is the remaining role/action/location permission matrix and business audit viewing/detail requirement? | Respective workflows; master/archive authority already settled. Technical audit implementation is a design decision, not a new business rule. |
| B-10 | D-05 | Is first Inventory delivery quantity-only or valued? If valued, which valuation method, invoice-pending costing and historical cost rules are approved? | Valuation only, unless first-release scope makes it mandatory. |
| B-11 | D-09; INV-15 | Is automated reorder included? If yes, define minimum/target/reorder meaning, location scope, equality thresholds and suggestion calculation. | Reorder automation only. |

## Can be decided during implementation, before affected behavior is delivered

- D-10: actual item names, freezer/store labels, pack factors, and example fixture values can be supplied after field/policy approval but before operational acceptance. Never use illustrative source numbers as defaults.
- Presentation/layout, internal identifiers, file organization and test harness choices are technical decisions within subsequently approved architecture. They must not change business behavior.
- Alert-day values can be configured later only after alert inclusion, semantics, and authority are approved; until then alerts remain proposed (B-07).
- No unresolved business behavior moves to this group merely to avoid a STOP gate.

## Future enhancement / integration decisions (unless B-01 explicitly brings them in)

- D-11: production completion/correction, recipe versioning, KDS consumption/reversal; future Production/POS integration.
- INV-18/19, D-09: supplier comparison, purchase-rate gate versus alert, invoice/payment workflow in Purchasing/Accounts.
- D-10: Candela/Mahir migration/import mapping and opening data validation, before any import is authorized.
- INV-13/27/35/36: barcode/QR, FEFO recommendations, expanded expiry alerts, carry-forward QC release and advanced reports.
- Central warehouse versus per-branch purchasing; staff-meal accounting, HR and delivery links; no inferred implementation scope.
- Food holding/reheat/shelf-life values need separately approved item policy; current practice is not a safety specification.

## Settled - do not ask again

ADR-0001: Owners/Managers create and adjust; only Owner deactivates/archives; any purchase/inventory/recipe/production/accounting/sales history prohibits product hard-delete; preserve history; controlled merge rather than destructive deletion. No extra deletion permission inferred.

ADR-0002 (B-01 CLOSED): S-01 scope approved — Item Master create/edit, Primary Item Type assignment, mandatory field validation, system Item ID/Code generation, and already-approved create/edit permissions only. Explicitly excludes stock balances, pack conversions, expiry, lots, transfers, physical counts, reorder logic, duplicate merge, and other later-slice functionality. Remaining slices' release inclusion decided separately. Technical architecture approval remains a separate gate.

ADR-0003 (B-02 CLOSED): Item Master mandatory fields settled — Item Name, Primary Item Type (exactly one of: Raw Material, WIP/Semi-Finished, Finished/Selling Product, Direct Purchase & Sale Item), Base UOM, Brand value/status (actual brand or explicit "Generic / No Brand"), and system-generated Item ID/Code. Active status defaults automatically. No multiple primary types; future operational behavior uses secondary capabilities/flags. Remaining B-02 sub-questions (brand maintenance permissions, UOM precision/rounding, used-conversion edits, duplicate-warning matching) stay open for later slices.

Units, brand identification, item-type distinctions, item-specific expiry, Store-to-Upper responsibility at issue, individual freezer identification, and partial production principle are already confirmed. Their unresolved details above do not revoke those principles.

Manager records answers with explicit approval references and updates affected criteria before handing a blocked slice to implementers. This document contains no approval or inferred answer.
