# ADR-0003: Item Master Mandatory Fields and Primary Type Rule

Date: 2026-09-17
Status: Approved business decision
Scope: Item Master required fields and type classification; resolves B-02 for S-01 scope.
Approval source: Explicit owner instruction in the implementation-readiness task on 2026-09-17.

## Approved decision

An Item Master record cannot be saved without:

- Item Name
- Primary Item Type (exactly one)
- Base Unit of Measure
- Brand value/status: actual Brand for branded items, or explicit "Generic / No Brand" for non-branded items
- System-generated Item ID/Code

Active status defaults automatically for a newly created item.

### Primary Item Type rule

Each Item Master record must have exactly ONE Primary Item Type. Approved types:

- Raw Material
- WIP / Semi-Finished
- Finished / Selling Product
- Direct Purchase & Sale Item

Multiple Primary Item Types on one record are not allowed. If future requirements need additional operational behavior, that is treated as a secondary capability/flag decision rather than assigning multiple primary types.

## Consequences and limits

This resolves B-02 for S-01 scope: required fields, single-type rule, and approved type values are settled for Item Master create/edit. The following B-02 sub-questions remain open for later slices: brand maintenance permissions beyond initial create/edit, UOM precision/rounding policy, conversion edit rules for already-used conversions, and duplicate-warning matching behavior. These do not block S-01.

No schema, field types, UI layout, or validation implementation is selected. The "Generic / No Brand" representation (null, sentinel value, or flag) is a technical design choice within the approved architecture. Base Unit of Measure values (the actual unit catalog) can be supplied during implementation per D-10 (fixture data). Default active status implementation is a technical design choice.

Validation: acceptance criteria AC-01 and AC-02 must reflect these approved rules. Implementation must enforce all five mandatory fields and the single-type constraint.

