# Inventory Conceptual Data Model Draft

Date: 2026-09-17. Status: DRAFT, not an approved schema. No engine, tables, API, runtime, field types, migration or persistence pattern is chosen. Sources: inventory-module.md, ADR-0001, inventory-acceptance-criteria.md. B references resolve to inventory-open-decisions.md.

The following entities and relationships are design candidates requested for readiness analysis. A candidate is not a new business requirement. Identity is conceptual; internal key format is a later technical choice. Required fields, uniqueness and cardinalities are OPEN unless explicitly sourced.

| Candidate | Conceptual information / relationship | Approval limits / OPEN DECISION |
|---|---|---|
| Item | Product identity with mandatory fields per ADR-0003: Item Name, Primary Item Type (exactly one of: Raw Material, WIP/Semi-Finished, Finished/Selling Product, Direct Purchase & Sale Item), Base UOM, Brand value/status (actual brand or explicit "Generic / No Brand"), and system-generated Item ID/Code. Active status defaults automatically for new items. Master authority and archived state per ADR-0001. | Multi-type classification resolved: single Primary Item Type only (ADR-0003). Future operational behavior uses secondary capabilities/flags. Duplicate matching remains open for later slices. No history-free delete or reactivation field/workflow inferred. |
| Brand | Identifies the actual selected/issued brand (INV-07); associated with item stock identification | Item-to-brand representation/cardinality and maintenance rights B-02; do not assume one brand per item. |
| UnitOfMeasure | Named measure used by an item and stock quantities (INV-06) | Dimensions, allowed units, precision/rounding and maintenance rights B-02. |
| PackSize / Conversion | Explicit pack-to-unit factor for the relevant item/pack (INV-06); an item supports multiple packs | Factor validity, used-conversion edits, historical interpretation and effective versions B-02. No cross-item/global conversion assumed. |
| StockLocation | Identifiable store/kitchen/freezer context (INV-01..03) | Hierarchy, stock granularity, labels and opening procedure B-03. Not every physical place necessarily holds a separate balance. |
| StockBalance | Candidate representation of a quantity by approved item/location dimensions | Whether stored or derived is later technical design; brand/lot/unit dimensions and opening balances B-02/03/07. Valued balance B-10. |
| StockMovement | Evidence of approved quantity-changing action and involved item/location(s) | Types, time semantics, correction/reversal, negative stock, backdating B-04/05. No assumed ledger/event architecture or automatic consumption. |
| StockIssue | Candidate grouping of an issue and its item quantities; relates to approved movements and responsibility evidence | Separate document versus movement representation is technical design; dispatch/receipt/partial handling B-04. Store-to-Upper responsibility at issue is confirmed. |
| PhysicalCount | Candidate count session and item/location observations compared to the approved book snapshot | Cutoff, concurrent movement handling, enter/verify roles and reopen B-06. Session/line split is conceptual only. |
| StockAdjustment | Candidate evidence relating a physical variance or approved correction to quantity changes | Whether separate entity, reasons, authorization and posting B-05/06; never overwrite away historical evidence. |
| Expiry / Lot | Expiry information required or optional per item (INV-25); lot identity only if approved | Granularity across receipts/stock, multiple dates, mandatory/optional lot scope, expired issue behavior B-07. Expiry does not require a supplier lot. |
| ReorderPolicy | Candidate per-scope minimum/target/reorder settings (INV-15 proposal) | Entire inclusion, dimensions, thresholds and formula B-11. Not an approved purchasing automation. |
| AuditRecord | Evidence needed to keep permitted changes and historical references auditable (ADR-0001, AGENTS) | Business audit detail/access B-09; storage design later. No invented retention duration. |
| Merge evidence (representation OPEN) | Traceable association of duplicates handled through an approved controlled process | Authority, survivor mapping, incompatible dimensions and quantity/history reconciliation B-08; not permission to rewrite historical values or remove referenced identities. |

## Conceptual relationships to validate

- Items have pack/conversion options and selected units. Brands must remain distinguishable in selection and issue; exact catalog variant structure is OPEN.
- Approved movements reference item and relevant location context. Balances must reconcile to approved stock evidence; the calculation/persistence design is not selected.
- An issue may group quantities and responsibility evidence. No invented one-to-one relation between issue and receipt, or status machine.
- Counts observe quantities in an approved location/cutoff; any authorized adjustment retains its originating evidence. Automatic approval or overwrite is not implied.
- Expiry/lot data attaches at an approved stock/receipt granularity. No universal lot entity requirement.
- Archive and merge retain historical references from every applicable module. Integration contracts needed to verify those references remain OPEN.
- User/role references come from the later approved identity design. Inventory does not become an HR or authentication module.

## Integrity obligations versus undecided design

Confirmed: Owner/Manager master creation and adjustment; Owner-only archive; history-bearing items cannot be hard-deleted; historical records remain intact and auditable; duplicate handling is controlled merge. AGENTS also prohibits hard-deleting stock/accounting/audit history.

Required technical review must demonstrate these obligations, approved conversion accuracy, and consistency of accepted stock operations. Transaction strategy, concurrency protection, repeat-request handling, key design and correction representation are architecture choices to document before dependent implementation; they are not decided in this conceptual model. Business policies for corrections, rounding, negative stock and merge outcomes require owner answers first.

No SQL, schema migration, executable code or database change accompanies this draft.
