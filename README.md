# Ideal Tasty Point ERP

A connected restaurant ERP for Ideal Tasty Point, covering inventory, purchasing, kitchen production, sales, delivery, accounts, and staff management through a manager-led specialist-agent workflow.

## Current status

Inventory Slices S-01 (Item Master), S-02 (UOM, Brand & Pack Variant Masters), and S-03 (Supplier Master, Purchase Record, Rate Comparison) are all merged to main and verified. S-03 adds Supplier Master (global standalone catalog, Owner-only deactivate), Purchase Record (immutable rate/history record, no edit/void path, branch-isolated through its referenced item), and a read-only Rate Comparison endpoint (current/previous/average-of-last-3 rate, per-Base-UOM rate, percentage change, per-supplier breakdown). See [backend setup](backend/README.md), [S-01 traceability](docs/engineering/inventory-s01-implementation.md), [S-02 traceability](docs/engineering/inventory-s02-implementation.md), and [S-03 traceability](docs/engineering/inventory-s03-implementation.md).

A parallel frontend UI foundation (ERP shell, sidebar, Item Master create/edit/list) exists on `feat/ui-foundation-item-master`, reconciled with this main and pending independent review before merge.

Development proceeds module by module. The TypeScript/Fastify/PostgreSQL backend uses an injected trusted AuthContext; a full login/session system and UI are not implemented. No stock operations, Purchase Orders/GRN/Supplier Ledger/Payments, or other ERP modules are included. Current evidence is recorded in docs/engineering/CURRENT-HANDOFF.md.

## Structure

- AGENTS.md: Manager responsibilities, delegation, QA/review, and documentation rules.
- docs/requirements/inventory-module.md: Inventory & Store requirements, source references, integration boundaries, open decisions, and draft acceptance scenarios.
- backend/: isolated Inventory backend (S-01 + S-02 + S-03), plain SQL migrations, local PostgreSQL Compose file and tests.
- docs/architecture/: approved architecture records and conceptual module-boundary drafts.
- docs/decisions/: decision-record guidance and unresolved consistency observations.

Engineering guardrails and completion/review rules are in docs/engineering/. Later slices need separate scope approval.
