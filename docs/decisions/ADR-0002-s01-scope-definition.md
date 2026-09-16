# ADR-0002: S-01 Scope Definition

Date: 2026-09-17
Status: Approved business decision
Scope: Inventory Slice S-01 boundary; resolves B-01 for the Item Master slice.
Approval source: Explicit owner instruction in the implementation-readiness task on 2026-09-17.

## Approved decision

S-01 must include only:

- Create Item Master record
- Edit approved Item Master information
- Assign Primary Item Type
- Validate mandatory Item Master fields
- Generate/maintain system Item ID/Code
- Respect already-approved create/edit permissions (INV-11, ADR-0001)

S-01 must NOT include:

- Stock balances
- Pack conversions
- Expiry
- Lots
- Transfers
- Physical counts
- Reorder logic
- Duplicate merge operations
- Other later-slice functionality

## Consequences and limits

This resolves B-01 for the Item Master slice (S-01). Remaining slices' release inclusion is decided separately per slice. Technical architecture approval remains a separate prerequisite for any application coding. No technology stack, database, framework, or dependency is selected by this decision.

The narrow S-01 scope means that UOM pack conversions (INV-06), brand maintenance permissions (INV-08), location/stock features (B-03+), and all integration interfaces remain in later slices. S-01 delivers only the foundational Item Master with type classification and field validation.

Validation: readiness documents must reflect this approved boundary. Implementation must not expand S-01 scope without explicit authorization.

