# ADR-0001: Product Archiving and History Preservation

Date: 2026-09-16
Status: Approved business decision
Scope: Product/item master; Inventory INV-10, INV-11, D-06 and connected historical records.
Approval source: Explicit user instruction in the current repository-foundation task, beginning "The unresolved INV-11 / D-06 product-deletion issue is already decided. Apply this approved business rule" on 2026-09-16.

## Approved decision

- Owners and Managers may create and adjust product/item master records.
- Only an Owner may deactivate/archive a product.
- A product that has any purchase, inventory, recipe, production, accounting, or sales history must NEVER be hard-deleted.
- Historical records must remain intact and auditable.
- Duplicate items should be handled through a controlled merge process, not destructive deletion.
- Do not invent any additional deletion behavior.

## Consequences and limits

This supersedes the earlier INV-11 wording that an Owner could delete a product and resolves the deletion-versus-archive/history issue in D-06. It also approves the controlled-merge principle previously proposed in INV-10.

No hard-delete permission for history-free products is inferred. Merge authorization, detailed merge mechanics, and brand-master permissions are not decided here. No schema, API, migration, or implementation is selected or authorized. No database or historical data has been changed.

Validation: requirements and decision index must use the same approved rule; later implementation must test role restrictions, history preservation, and nondestructive duplicate handling against approved process details. Independent review is required by the repository guardrails.
