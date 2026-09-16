# Inventory Module Boundary — Conceptual Proposal

Date: 2026-09-17. Status: DRAFT; owner/architecture approval pending (B-01). This document does not fill or supersede the unapproved global MODULE-BOUNDARIES.md framework. Sources: inventory-module.md, ADR-0001, inventory-acceptance-criteria.md, inventory-open-decisions.md. No API, event name, database engine, or deployment design is selected.

## Proposed responsibility

Inventory is the candidate owner of item/brand/unit/pack identity used for stock, location identity, stock quantity records and movements, issues/transfers, physical counts and their approved corrections, item expiry information, and stock audit evidence. This is a proposed allocation, not permission to implement all these capabilities. Master permissions, historical protection and Store-to-Upper responsibility follow confirmed rules; receipts, general transfer stages, counts, adjustments, lots and reorder behavior remain gated by their decisions.

| Candidate responsibility | Limit / approval gate |
|---|---|
| Item classification, brand visibility, units and pack conversions | AC-01..04; B-02. Shared catalog consumers must use approved access; whether identity is shared or Inventory-owned requires architecture approval. |
| Location identity and quantity balances | AC-05, PC-01; B-03. No invented warehouse hierarchy or opening-stock policy. |
| Stock receipt/issue/transfer records | AC-06, PC-02; B-04/B-05. Store-to-Upper responsibility changes at issue, not final consumption. Purchasing document approval is outside this responsibility. |
| Physical counts, variance, authorized adjustment | PC-03..05; B-06. Counts do not imply automatic stock overwrite or expense recognition. Lower closing inclusion remains B-01. |
| Item expiry; optional lot capability if approved | AC-07, PC-06; B-07. Do not impose universal lot tracking, FEFO or food-safety values. |
| Archive and controlled duplicate merge | AC-08..10; B-08. Historical records remain intact across every referencing module; no module-local shortcut can establish that a product has no history. |
| Audit evidence and permissions enforcement | AC-11, PC-09; B-09. Shared identity/security ownership and contract remain architecture decisions. |
| Minimum/target/reorder suggestions if approved | PC-07; B-11. Never create purchase commitments or payment approvals implicitly. |

## Explicit exclusions and future integration points

The following are conceptual information needs, NOT approved interfaces or implementation tasks. The eventual owning modules and contracts must be approved before dependent code.

| Future module | Information crossing the boundary, subject to approval | Inventory must NOT own |
|---|---|---|
| Purchasing | Item/unit references; approved receipt context and quantity discrepancy evidence | Suppliers, purchase orders, rate comparison/gates, supplier returns authorization or purchasing approvals. Physical stock effects still require an approved inventory policy. |
| Production / WIP | Item/location quantities, approved material issue and actual output/return information | Recipes, batches, yields, chef completion, recipe permissions, WIP costing or consumption timing. INV-12/28/34 and section 9 remain future obligations. |
| POS / KDS | Approved item references and stock-effect requests with reversal/reconciliation information | Sales, kitchen tickets, order states, replacements or choosing when a sale consumes stock. D-11 remains open. |
| Accounts | Approved stock/valuation evidence if scope includes value | Ledger, supplier payments, invoices, costing method selection or expense posting. Owner supplier-payment approval remains confirmed outside this slice. |
| HR | Approved responsible-user references where needed | Staff records, attendance, payroll or staff-meal policy. Identity integration is not designed here. |
| Delivery | Approved dispatch/return stock information if later required | Routing, drivers, delivery order lifecycle or invented dispatch consumption policy. |

## Boundary enforcement and STOP gates

- No specialist may read/write another module's internal persistence, duplicate its business rules, or infer a contract from this table. Only approved interfaces/events/APIs may cross boundaries later.
- Stock responsibility and stock quantity must not silently become recipe consumption, sales recognition or accounting expense.
- History-aware archive/merge must preserve purchase, inventory, recipe, production, accounting and sales references. Missing history visibility or merge coordination contract blocks the affected operation; do not assume absence of an integration means absence of history.
- A first Inventory slice must work only with approved fixtures/input workflows. No fake integration success, placeholder production deduction or opportunistic code for another module.
- Manager obtains approval for first-release scope and ownership; Architecture Agent documents technical contracts separately. New cross-module needs return to Manager for scoped approval.

Verification: independent architecture review is recorded in CURRENT-HANDOFF.md. This proposal alone is not an approved contract.
