# Ideal Tasty Point ERP

A connected restaurant ERP for Ideal Tasty Point, covering inventory, purchasing, kitchen production, sales, delivery, accounts, and staff management through a manager-led specialist-agent workflow.

## Current status

Documentation/setup phase only. The existing Git repository is verified. Previously discussed Inventory & Store requirements are consolidated in docs/requirements/inventory-module.md, with confirmed needs, current practices, proposals, and unresolved decisions clearly distinguished. The consolidated document is a draft awaiting review, not blanket implementation approval.

Development will proceed module by module, beginning with Inventory & Store. No application code, database schema, or technology stack has been created or selected. No commit has been made by this setup task.

## Structure

- AGENTS.md: Manager responsibilities, delegation, QA/review, and documentation rules.
- docs/requirements/inventory-module.md: Inventory & Store requirements, source references, integration boundaries, open decisions, and draft acceptance scenarios.
- docs/architecture/: architecture and module-boundary frameworks; actual architecture is pending approval.
- docs/decisions/: decision-record guidance and unresolved consistency observations.

Engineering guardrails and completion/review rules are in docs/engineering/. Git does not track empty directories. The next step is to resolve only the outstanding business decisions and approve a bounded implementation scope.
