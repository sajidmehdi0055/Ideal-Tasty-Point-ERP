# Decision Records

Record business and architecture decisions with source evidence. A proposal is not approval. Explicit user instructions and approved requirements remain sources of truth alongside approved decisions; report unresolved conflicts to the Manager without silently changing requirements.

Use ADR-0001-short-title.md and subsequent unique numbers for new records. Inventory question IDs D-01 through D-11 track discussion questions, not ADRs; resolved portions link to approved records.

## Record template

- ID and title:
- Date and status: Proposed / Approved / Rejected / Superseded
- Module scope:
- Requirement IDs and exact source references:
- Context and unresolved question:
- Options and consequences:
- Decision and rationale:
- Business approval evidence (user instruction/turn reference), when required:
- Technical review and authorized decision evidence:
- Affected contracts/data, migration and recovery implications:
- Validation and documentation actions:
- Supersedes / superseded by:

Never invent approval or resolve a business conflict on the user's behalf. Preserve prior approved records; a changed decision gets a new record with reciprocal supersession references. Proposed records do not authorize implementation. Do not store secrets or sensitive production data here.

## Consistency observations - 2026-09-16

The previously reported INV-11 / D-06 deletion compatibility issue is resolved by the explicit user-approved rule recorded in ADR-0001-product-archive-and-history.md. Inventory requirements now reflect that rule. Merge authority/process details and unrelated brand permissions are not inferred.

Other existing open items, including D-03 transfer/production posting, remain unresolved. These engineering documents do not approve them or assign module boundaries.
