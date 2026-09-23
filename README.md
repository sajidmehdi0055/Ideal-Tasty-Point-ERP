# Ideal Tasty Point ERP

A connected restaurant ERP for Ideal Tasty Point, covering inventory, purchasing, kitchen production, sales, delivery, accounts, and staff management through a manager-led specialist-agent workflow.

## Current status

Inventory Slice S-01 (Item Master) is merged to main and verified. Inventory Slice S-02 (UOM, Brand & Pack Variant Masters) is implemented and self-verified on `feat/inv-s02-uom-brand-pack`, awaiting independent review before merge. S-02 adds UOM Master (seeded + custom, case-insensitive duplicate protection), Brand Master (global standalone catalog), Pack Variant (item+brand+pack-UOM+conversion, own identity), and migrates `item_master.base_uom` from free text to a foreign key — with a safety refinement that never guesses a unit type for an unrecognized legacy value. See [backend setup](backend/README.md), [S-01 traceability](docs/engineering/inventory-s01-implementation.md), and [S-02 traceability](docs/engineering/inventory-s02-implementation.md).

Development proceeds module by module. The TypeScript/Fastify/PostgreSQL backend uses an injected trusted AuthContext; a full login/session system and UI are not implemented. No stock operations, Supplier/Purchasing, or other ERP modules are included. Current evidence is recorded in docs/engineering/CURRENT-HANDOFF.md.

## Structure

- AGENTS.md: Manager responsibilities, delegation, QA/review, and documentation rules.
- docs/requirements/inventory-module.md: Inventory & Store requirements, source references, integration boundaries, open decisions, and draft acceptance scenarios.
- backend/: isolated Inventory backend (S-01 + S-02), plain SQL migrations, local PostgreSQL Compose file and tests.
- docs/architecture/: approved architecture records and conceptual module-boundary drafts.
- docs/decisions/: decision-record guidance and unresolved consistency observations.

Engineering guardrails and completion/review rules are in docs/engineering/. Later slices need separate scope approval. This task does not authorize merging the S-02 feature branch into main.
