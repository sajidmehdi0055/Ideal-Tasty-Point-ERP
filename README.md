# Ideal Tasty Point ERP

A connected restaurant ERP for Ideal Tasty Point, covering inventory, purchasing, kitchen production, sales, delivery, accounts, and staff management through a manager-led specialist-agent workflow.

## Current status

Inventory Slice S-01 backend implementation is authorized under ADR-0002/0003/0006 and the owner's current implementation instruction. It covers Item Master create/edit, single primary type, mandatory fields, generated codes, branch-aware authorization and immutable audit records. See [backend setup](backend/README.md) and [S-01 traceability](docs/engineering/inventory-s01-implementation.md).

Development proceeds module by module. The TypeScript/Fastify/PostgreSQL backend uses an injected trusted AuthContext; a full login/session system and UI are not implemented in S-01. No stock operations or other ERP modules are included. Implementation is under verification; current evidence is recorded in docs/engineering/CURRENT-HANDOFF.md.

## Structure

- AGENTS.md: Manager responsibilities, delegation, QA/review, and documentation rules.
- docs/requirements/inventory-module.md: Inventory & Store requirements, source references, integration boundaries, open decisions, and draft acceptance scenarios.
- backend/: isolated S-01 backend, plain SQL migration, local PostgreSQL Compose file and tests.
- docs/architecture/: approved architecture records and conceptual module-boundary drafts.
- docs/decisions/: decision-record guidance and unresolved consistency observations.

Engineering guardrails and completion/review rules are in docs/engineering/. Later slices need separate scope approval. This task does not authorize merging the feature branch into main.
