# Inventory Acceptance Criteria and Requirements Audit

Date: 2026-09-17 (updated). Status: readiness draft for review, NOT implementation authorization.
Authority: inventory-module.md v0.2, ADR-0001, ADR-0002 (B-01 CLOSED), ADR-0003 (B-02 CLOSED), root AGENTS.md, and the owner's readiness task. The task requests coverage, not automatic approval of previously suggested behavior. A = explicit approved/confirmed principle; C = current practice only; P = proposal; O = unresolved detail; F = future integration. A principle can be approved while its release inclusion or detailed workflow remains blocked.

## Complete source audit

| Source | Classification and disposition |
|---|---|
| INV-01, INV-02 | C: two stores, two kitchens, responsibilities. Location and transfer workflow details need approval. |
| INV-03 | A: individually identify freezers; labels/detail O. |
| INV-04 | C/F: Candela/Mahir usage, not import authorization. |
| INV-05 | A: simple operations/no repeated entry; measurable workflow review required. |
| INV-06 | A: units and multiple packs with explicit conversions; precision/change policy O. |
| INV-07 | A: brand identity visible during selection/issue. |
| INV-08, INV-09 | C: brand consultation and duplicate incidents; permissions/detection O. |
| INV-10 | P: identifiers/aliases/duplicate warning; controlled merge A through ADR-0001 only. |
| INV-11 | A: create/adjust, owner-only archive, history preservation, controlled merge. |
| INV-12 | A: raw/WIP/finished/direct-sale distinctions; WIP cost principle A, costing implementation O/F. |
| INV-13 | C: name search; barcode/QR P/F. |
| INV-14, INV-15 | C: target stock/shortage lists; automated minimum/target/reorder P. |
| INV-16, INV-17 | C: receipt checks/invoice timing; digital posting/returns P/O. |
| INV-18 | A/F: rate differences and supplier comparison; outside proposed first Inventory scope. |
| INV-19 | C: supplier payment modes; A/F: owner approval for supplier payment. |
| INV-20, INV-21 | C/F: joint kitchen demand, batch recipes/issues, no routine approval currently. |
| INV-22 | A: responsibility transfers Store to Upper Kitchen on issue; not consumption. |
| INV-23, INV-24 | C: counted kitchen transfers; digital workflow P, partial/in-transit handling O. |
| INV-25 | A: item-specific mandatory/nonmandatory expiry; settings/permissions O. |
| INV-26, INV-27 | C: FIFO effort and omitted supplier lots; configurable lots/FEFO/alerts P. |
| INV-28 | A: item-specific WIP treatment; C: shelf-life/storage examples; exact policy O/F. |
| INV-29, INV-30 | C: monthly count and current adjustments; future policy O. |
| INV-31 | P: variance then authorized adjustment, approvers O. |
| INV-32, INV-33 | C: almost-daily lower-kitchen counts and daily closing waste; new workflow O/F. |
| INV-34 | A/F: partial production and unused material carry-forward, not Inventory production engine. |
| INV-35, INV-36 | C: leftovers; QC release/reporting P; costing O. |

Source section 9 confirmed production behavior (chef completion/edit restriction, recipes and owner approval of cost-changing recipes, size-wise pizza output) remains Production/F. KDS consumption timing, replacement linkage, hold/reheat controls remain P/O/F. Section 10: equal Owner authority and separate identities are confirmed; detailed audit fields/other permissions proposed/open. D-01 through D-11 are mapped in ../engineering/inventory-open-decisions.md. No original requirement is edited by this package.

## Approved-principle acceptance tests

These are test specifications, not executed tests. Use approved test fixtures; examples never set production policy. Each test includes its source and any blocking decision (B IDs in the decision register).

| ID | Capability/source | Given / when / expected evidence |
|---|---|---|
| AC-01 | Item Master; INV-11, ADR-0001, ADR-0003 | Given an Owner or Manager and the five mandatory fields (Item Name, Primary Item Type, Base UOM, Brand value/status, system-generated Item ID/Code per ADR-0003), when creating/adjusting an item, the action succeeds and all values can be retrieved. Active status defaults automatically for new items. A save attempt missing any mandatory field must be rejected. Test both roles. No permission for other roles is inferred. |
| AC-02 | Item types; INV-12, ADR-0003 | Given representative Raw Material, WIP/Semi-Finished, Finished/Selling Product, and Direct Purchase & Sale Item fixtures, when retrieving their item classifications, each retains the correct single Primary Item Type. An attempt to assign multiple Primary Item Types to one record must be rejected. This does not create recipes, sales, or costing. Future operational behavior uses secondary capabilities/flags, not multiple primary types. |
| AC-03 | Brand; INV-07 | Given the same item supplied under two brands, selection and issue evidence identifies the actual chosen brand without conflating it with the other. Brand maintenance permission awaits B-02. |
| AC-04 | UOM/packs; INV-06 | Given approved fixture factor f base units/pack, q packs express q*f base units and an approved base-unit issue changes quantity consistently. Missing conversion is never guessed. Precision, rounding, and conversion edits await B-02. |
| AC-05 | Location identity; INV-03 | Given individually identified freezers, each can be distinguished in the location view without confusion. Actual labels/hierarchy and stock detail await B-03; no freezer naming convention is assumed. |
| AC-06 | Store issue; INV-22 | Given authorized issue of quantity q from Store to Upper Kitchen, responsibility for q leaves Store Keeper and goes to Upper Kitchen management at issue. Do not post final production consumption solely from that transfer. Dispatch/receipt details await B-04; this approved responsibility point is not reopened. |
| AC-07 | Expiry; INV-25 | Given one item configured mandatory and one nonmandatory, receipt completion rejects missing expiry for the mandatory item and does not require it for the nonmandatory item. Configured policy is respected independently for each item. Receipt/settings details await B-07. |
| AC-08 | Archive permissions; ADR-0001 | Owner can deactivate/archive an eligible test item under the approved eventual workflow; Manager and non-Owner cannot. Create/adjust authority remains AC-01. Archive effects on active stock/transactions await B-08; no reactivation behavior is invented. |
| AC-09 | History safety; ADR-0001 | For separate fixtures with purchase, inventory, recipe, production, accounting, and sales history, any attempted hard-delete must not remove the item or history. Existing historical links and values remain intact and auditable after allowed master changes/archive. No permission to hard-delete history-free items is inferred. |
| AC-10 | Controlled merge; ADR-0001 | Given approved duplicate identities and approved merge authorization/process, merge handles duplicates without destructive deletion or loss of historical evidence. Verify preserved references/history and reconciliation using approved B-08 rules. No automatic merge, balance summation, survivor selection, or merge role is assumed. |
| AC-11 | Auditability; ADR-0001, AGENTS | For tested master/archive/merge and approved stock actions, evidence demonstrates historical records remain intact and auditable; failed/denied actions never present fake success. Exact audit payload/access requirements await B-09; no retention period is invented. |
| AC-12 | Operational simplicity; INV-05 | Demonstrate each selected approved workflow to the owner against its acceptance script; identify any repeated entry and obtain agreement before adding it. No invented click-count/time target. |

## S-02 implementation status note (2026-09-18)

AC-04's foundation is now implemented, not merely specified: UOM Master supplies the approved units, and Pack Variant stores the approved fixture factor `f` (`conversion_factor`, NUMERIC, never float, never guessed — an unresolvable/missing conversion is rejected, not defaulted) per item+brand+pack UOM combination. The `q*f` expression itself, and any "approved base-unit issue changes quantity consistently" behavior, remain future/stock-module scope, as AC-04's original wording already stated — this note only updates which portion is now implementable versus still deferred. Full traceability: docs/engineering/inventory-s02-implementation.md, ADR-0007. AC-04's original approved wording above is unchanged.

## Required coverage not yet approved as executable behavior

The following are deliberately conditional criteria. They cannot be used to justify coding until the referenced scope/policy is approved.

| ID | Area/source | Conditional test outline and decision |
|---|---|---|
| PC-01 | Multiple stores; INV-01 | Once location scope is approved, receive/issue/count in a named location and verify another location's quantity is unaffected except an explicit approved transfer. B-03/B-04. |
| PC-02 | General transfer; INV-23/24 | Under approved dispatch, receipt, partial/short receipt, return and correction rules, verify quantities/responsibility and no duplicate posting. B-04/B-05. |
| PC-03 | Physical count; INV-29/30 | Under approved cutoff/movement rules, record physical quantity and compare with book quantity from that cutoff; preserve original evidence. B-06. |
| PC-04 | Daily Lower Kitchen closing; INV-32/33 | Under approved inclusion and staff responsibilities, count countable items and weigh measured items; reconcile using approved production/consumption inputs without rebuilding POS or Production. B-01/B-06; otherwise deferred. |
| PC-05 | Variance/adjustment; INV-31/36 | Once approved, demonstrate shortage, excess, and zero variance; apply only approved adjustment/reopening/reason rules and retain original evidence. No automatic write-off/approval policy assumed. B-06; monetary values also B-10. |
| PC-06 | Mandatory/optional lots; INV-26/27 | If approved, test mandatory missing lot rejection and optional omission plus multi-lot receipt according to approved policy. Expiry does not implicitly make lots mandatory. B-07. |
| PC-07 | Minimum/target/reorder; INV-14/15 | If approved, compare stock against configured values and show the exact approved suggestion at/below/above threshold. No target-minus-stock formula or auto-purchase approval inferred. B-11. |
| PC-08 | Duplicate prevention; INV-09/10 | If approved, test Urdu/English/name variants against approved matching/warning/block policy; verify genuinely distinct items follow that policy. No forced merge. B-02/B-08. |
| PC-09 | Remaining permissions | For each approved role/action/location assignment, test allowed and denied paths at the enforcement boundary. Do not assume Accountant/Store Keeper rights from current practice. B-09. |

## Future integration acceptance obligations

F-01: supplier comparison/rate differences and owner-approved supplier payments (INV-18/19) belong to later Purchasing/Accounts work.
F-02: partial production/WIP output preserves unused material and actual quantities (INV-12/28/34, section 9); Inventory must not fake full output. Production tests live in that future scope.
F-03: KDS/sale/reversal interactions must avoid double deduction, but timing remains D-11, not an approved Inventory rule.
No automated tests were written or run: documentation only.
