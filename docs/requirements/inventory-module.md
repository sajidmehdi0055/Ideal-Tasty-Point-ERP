# Inventory & Store Management - Requirements Draft

Version: 0.2 | Consolidated: 2026-09-16
Status: Discussion consolidated; INV-11 and the controlled-merge principle are approved in ADR-0001. Remaining draft scope is not blanket implementation approval.
Source: ChatGPT conversation "my softwere", ID 6a9a84c5-1918-83ee-b304-ec53a66ee1b6, read through its oldest available turn. Source IDs below identify user turns, not assistant proposals. Prior screenshots were not used as evidence for requirements.

## 1. Reading and approval rules

- CONFIRMED: the user explicitly requested or agreed to the stated need.
- CURRENT: the user described existing operations; this alone does not approve a new software policy.
- PROPOSED: the former assistant suggested the behavior without clear user confirmation.
- OPEN: a business choice remains unanswered, ambiguous, or contradictory.

Do not promote proposals to confirmed requirements, interpret example numbers as configuration, or infer approval from silence. Later user clarifications take precedence over earlier assistant summaries. Requirements below capture the existing discussion without restarting discovery. Application coding is not authorized by this document.

## 2. Purpose and delivery boundary

CONFIRMED: build an integrated ERP, proceed one module at a time, and begin with Inventory & Store. The business currently has one branch and plans additional branches. Shared information must support connected modules rather than repeated entry.

Inventory scope for review: item identification, units/packing/brands, locations, stock receipts and issues, demand and replenishment, expiry settings, physical counting, variance, permissions, and history.

Production/WIP, recipes, purchasing/accounts, POS/KDS, and staff consumption have inventory interfaces described below. Their complete implementation is not automatically included in the first Inventory release. Exact first-release boundary remains OPEN (D-01).

Sources: bbb21036-464f-4456-8243-541d4c570fd3; 3367f103-f7a2-4951-95e5-3463c8efd669; bbb216d6-ff5c-47b7-bf25-6d6111303935.

## 3. Existing business and locations

| ID | Status | Requirement / fact |
|---|---|---|
| INV-01 | CURRENT | Two stores: main store and a separate rented store due to space constraints. Store Keeper receives goods and puts them in their appropriate location; manages stock IN and OUT. |
| INV-02 | CURRENT | Upper kitchen prepares/produces items; lower/live kitchen finishes, assembles, fries, or serves them. Separate supply staff serve the two kitchens. |
| INV-03 | CONFIRMED | Identify freezers individually to make stock location easier to find. There are currently 21 operating freezers; numbering convention and entry detail are not finalized. |
| INV-04 | CURRENT | Candela handles purchases, customer records, inventory, expenses, and reports; Mahir online software is also used. Production records and software sales are partly reconciled manually. |
| INV-05 | CONFIRMED | Keep daily operations simple; avoid unnecessary data entry and repeated manual/computer entry. |

Sources: d65c5963-2923-4006-937f-d6262eebe2b4; 38eff3da-1f8b-417c-b17e-ff785cec5f01; 4d12a9db-5ad7-4eda-ac26-5f6f10d82c4b; ea3f861f-6580-4c54-8df8-a43e17f9a8d4; bbb218c3-3d14-4005-8e1c-4b827b600244; bbb21b90-8d45-45bf-866a-4aa1cf58178a; d3eae344-7449-4b31-afb6-61e743f6f0d5.

## 4. Item master, measurement, and permissions

| ID | Status | Requirement / fact |
|---|---|---|
| INV-06 | CONFIRMED | Every item has its appropriate measurement unit. Support the different pack sizes in which the same item is purchased; conversion values must be explicitly maintained, not guessed. |
| INV-07 | CONFIRMED | Brand identity must be retained and visible when selecting/issuing stock, because brands can have different purchase costs. |
| INV-08 | CURRENT | Owners generally select purchases/brands. Store Keeper may change the selected brand after verbally consulting an owner. Exact new-system brand-master permission is OPEN. |
| INV-09 | CURRENT | Duplicate products have occurred because the same item was entered in Urdu and English. |
| INV-10 | PROPOSED | Unique item identity, Urdu/English aliases, structured brand/pack fields, and possible-duplicate warnings. Controlled merge for duplicates is now approved under INV-11 / ADR-0001; the other suggestions in this row remain PROPOSED. |
| INV-11 | CONFIRMED | Owners and Managers may create and adjust product/item master records. Only an Owner may deactivate/archive a product. A product with any purchase, inventory, recipe, production, accounting, or sales history must NEVER be hard-deleted. Historical records must remain intact and auditable. Duplicate items must use a controlled merge process, not destructive deletion. See ADR-0001; do not infer additional deletion behavior. |
| INV-12 | CONFIRMED | Distinguish raw materials, WIP/semi-finished items, finished/selling products, and direct purchase-and-sale items. WIP is a usable inventory item with cost. |
| INV-13 | CURRENT | Items are searched/selected by name; barcode scanning is not currently used. Optional barcode/QR support is only a proposal, not a first-release requirement. |

Unit/pack examples from discussion illustrate variability only. No production unit factors or pack sizes are approved configuration here. In particular, mass-to-volume conversion must not be inferred.

Sources: bbb21150-08dc-46cb-b8e0-f4b1b4285d58; bbb21339-9cea-4778-907f-c58572a556d9; bbb21baf-c989-4101-9363-b42b6c90031b; bbb21b91-3b8f-4272-b6f9-16f193d11287; bbb21bff-b361-47ac-aca9-6f448f24600a; bbb21634-e719-4c86-861a-5813c51540ec; bbb21eab-9fa6-4373-bd4e-f0520af5899c; bbb2152b-9bf1-473e-b0d1-a15bb5e867bf; bbb216f9-3f7e-4861-8d34-9c935effc5b4.

## 5. Replenishment, purchasing, and receipt interface

| ID | Status | Requirement / fact |
|---|---|---|
| INV-14 | CURRENT | Desired stock levels exist. Store Keeper prepares a shortage list and stock is replenished. No dedicated purchaser: Owner or Store Keeper calls distributors/suppliers. |
| INV-15 | PROPOSED | Configurable minimum/target/reorder levels and suggested purchase quantities; exact formula, store-level settings, and thresholds remain OPEN. |
| INV-16 | CURRENT | Receiving includes manual quantity and quality checks and comparison of order versus received goods. Goods normally arrive with an invoice, but an invoice can arrive later. |
| INV-17 | PROPOSED | Record ordered, received, short/excess, and rejected quantities; permit receipt with invoice pending. Posting rules, partial receipts, and returns need decisions. |
| INV-18 | CONFIRMED | Show purchase-rate differences and support supplier comparison to assist owner decisions. A mandatory rate-approval gate was not clearly agreed. |
| INV-19 | CURRENT / CONFIRMED | Cash, COD, and credit supplier dealings exist. Supplier payment requires owner approval. Full supplier ledger/payment functionality belongs to Purchase & Accounts integration. |

Sources: 5c385da6-20e0-43f0-b555-c02569a349fe; 7b125083-45e8-49db-b935-cf8f6e7bf33d; 68338613-73e9-4d9c-be96-4f6ca7cb5379; 4c3e9c87-c7f6-400e-8aef-5d52c00060ed; 16acfa7a-75a7-4401-8be2-9119d3d5afba; d87385bf-ab3a-4047-bc27-2eb02f43e5b0; 470442b3-4d9f-4f47-a795-236f5333a420; 3e63d8f3-df50-4c7d-8d7e-6d53496468ed.

## 6. Demand, issue, and responsibility transfer

| ID | Status | Requirement / fact |
|---|---|---|
| INV-20 | CURRENT | Upper and lower kitchen heads jointly decide demand. Store Keeper currently receives verbal demand and uses printed batch ingredient sheets, then records issues in the computer. |
| INV-21 | CURRENT | Standard batch recipes exist (including a 200-piece samosa batch example). Supplies are usually issued together in the morning or previous night; additional issues occur during the day. Routine batch issues currently require no separate approval. |
| INV-22 | CONFIRMED | On Store issue to Upper Kitchen, responsibility leaves Store Keeper and transfers to Upper Kitchen management. This is transfer of responsibility/stock, not automatically final consumption. |
| INV-23 | CURRENT | Dedicated supply staff count/write goods taken from Upper Kitchen; receiving at Lower Kitchen includes counting. |
| INV-24 | PROPOSED | Digital demand from batch quantities, calculated ingredients, actual issue confirmation, shortage visibility, additional issues, and issued/delivered/received identities. Partial receipt, discrepancy handling, and in-transit responsibility remain OPEN. |

Do not collapse production completion and physical receipt into one event: early assistant wording placed completed output directly into live stock, while later discussion described an Upper Kitchen issue and Lower Kitchen receipt. Exact posting points require D-03.

Sources: bbb2163c-efc6-4f89-9ad6-a9feee39a77c; bbb21eeb-fdac-4bb2-84d0-5d868adf25a1; d94594c4-f76c-4b35-82d9-cee7f98b3e49; bbb212b8-4296-46b9-8941-e73a1e2f940e; bbb2106b-65e0-41e5-b0d0-0eecd8b8b766; bbb21114-586a-4a39-82eb-c4cf9d0c2409.

## 7. Expiry, lots, and storage

| ID | Status | Requirement / fact |
|---|---|---|
| INV-25 | CONFIRMED | Expiry entry is item-specific: mandatory for some items and not mandatory for others. Exact optional/not-applicable settings and who may change them need definition. |
| INV-26 | CURRENT | Staff attempt FIFO. Supplier batch fields exist in Candela but are not entered because one delivery can contain multiple lots and entry takes time. |
| INV-27 | PROPOSED | Item-configurable batch/lot tracking and multiple lots per receipt; FEFO suggestions and configurable expiry alerts. No mandatory lot policy or alert-day values are approved. |
| INV-28 | CURRENT / CONFIRMED | WIP items differ in shelf life (one, two, or three days were examples) and storage location/method, including freezer and shelf. Retain item-specific treatment; actual item policies are still required. |

No universal shelf life, safe holding time, reheating rule, or reuse permission is defined by this document. Current operational descriptions are not an approved food-safety policy.

Sources: bbb211c2-3a24-4226-89b6-1aea14a416ec; bbb218e0-faa4-49c7-86af-b29215fdea46; bbb21aed-e853-45ce-9d1e-5cd696b32201.

## 8. Physical counts, wastage, and reconciliation

| ID | Status | Requirement / fact |
|---|---|---|
| INV-29 | CURRENT | Full Store physical audit occurs at month end; every item is counted and compared with system quantities. Store is accountable for differences. |
| INV-30 | CURRENT | Physical quantities currently adjust stock; later investigation can identify an entry error or damaged/expired stock. |
| INV-31 | PROPOSED | Preserve original count and variance, then use a reasoned authorized adjustment rather than silently overwriting stock. Approver, count cutoff, and correction workflow remain OPEN. |
| INV-32 | CURRENT | Lower Kitchen stock is counted/weighed almost daily: countable items by count, other items by weight. Upper Kitchen does not currently have the same detailed daily closing. |
| INV-33 | CURRENT | Section heads report/enter daily wastage at closing. Production, software sales, remaining raw/unfried or cooked pieces, and wastage are reconciled. |
| INV-34 | CONFIRMED | Support partial batches and remaining raw/prepared material carried forward for subsequent production. Do not assume the whole standard batch is consumed or produced. |
| INV-35 | CURRENT | Usable leftovers are carried forward; spoiled items are discarded. Fresh versus carried-forward labels and QC release controls were proposed, not fully approved. |
| INV-36 | PROPOSED | Quantity/value variance reports, location stock, movement history, expiry visibility, and wastage by reason. Exact reporting and costing rules need finalization. |

Draft reconciliation model for review: expected closing = opening + receipts/transfers in + production output - transfers out - recorded consumption - wastage +/- authorized adjustments. Physical variance = physical closing - expected closing. This is not a finalized posting design: one event must not deduct stock twice through both sale and recipe consumption.

Sources: bbb21ed9-43ed-4f96-87d5-ea64d3bccadf; bbb214b6-2219-4470-ae21-88678d99d54f; bbb21688-b627-4ba9-a9c7-e8e4c02d0b6e; bbb2146c-3d2c-45db-836a-028accb26004; bbb21f87-be39-4b4a-8833-30446a58ea67; bbb21f75-4fad-4c5a-9f11-18fc5a07c705; bbb21cbc-1505-4f7b-914e-c974440a6e00; bbb2166b-5940-4a09-ac67-e72b53ca5b10.

## 9. Future module interfaces already discussed

### Production, WIP, and recipes

CONFIRMED: WIP such as dough, fillings, and sauces is inventory with accumulated material cost. Chef records actual output and confirms Complete/OK; the chef must not edit a completed entry. Correction authority/procedure remains OPEN. Per-item and batch recipes are used; kitchen heads can change recipes, but cost-changing recipe changes require owner approval. Recipe versioning and historical-cost preservation were proposed.

CONFIRMED pizza example: dough maker records actual dough weight, then prepared pans by Medium/Large/XL size; sizes have standard dough weights. Pans move downstairs and toppings are added there on order. Topping quantities are fixed and weighed operationally. Actual per-order gram entry is not established as a requirement.

CURRENT: KDS supports Ready to Serve and delivery handover; portion differences emerge at closing. PROPOSED: standard recipe consumption at Ready to Serve. Confirm precise consumption timing, reversal rules, and costing before implementing this interface.

CURRENT: burnt/unusable pizza is wastage; a correct but wrong-variant pizza may be used for a matching order; replacements get another token. PROPOSED: link replacement to the original order without double-counting sales, while retaining actual consumption. Holding/reuse rules remain unresolved.

Sources: bbb2152b-9bf1-473e-b0d1-a15bb5e867bf; bbb21984-cfbb-48b1-a40b-3cd944e93fea; bbb21e3b-2472-4fca-a808-639bb843fe30; bbb219ba-ba04-4fb3-ba9c-2f7f6f869ec5; bbb215d1-bd47-4b45-94f2-53d1a8345335; bbb21c72-c1df-42e8-9149-75d88bd93610; bbb21b97-5fc6-492f-8ef4-0d5343c73756; bbb21264-9826-4fe7-b594-a47f2cc3e8c9; bbb213a3-2fe1-4e62-9a69-999423d1bb98; bbb2170b-d2c6-477a-82f2-f792e8a1e422; bbb21fea-3a5d-40cd-a516-8469ccc32154.

### Other interfaces

- Purchase & Accounts: receiving, invoice pending, supplier balances, owner-approved payments, rate comparisons, stock valuation. Valuation method is not decided.
- POS/KDS: direct-sale versus produced items, availability, consumption, refunds/replacements/complimentary events; prevent duplicate deductions. Five counters and connected sections belong to the wider ERP.
- Staff consumption: staff food is cooked separately and food/tea are provided by the restaurant. Its inventory/accounting posting was proposed and needs definition, not a customer sale assumption.
- Assets: freezer IDs relate to storage; machinery maintenance, QR codes, temperature logs, and service schedules are separate future scope.
- Branches: future branch support is confirmed; central warehouse versus independent branch purchasing remains undecided.

Staff source: bbb211d2-5a7e-4d75-b8c7-9e61e89df093; bbb21a7f-5bdc-4499-8b5f-db6e1e65d0e8.

## 10. Roles and audit requirements

Three owners have equal authority with separate identities (source bbb218c2-3e77-4514-99ee-f267edba7faf). Owner/Manager item-master permissions follow INV-11; do not confuse the restaurant Manager with the AI development Manager.

Proposed audit record: actor, time, source document, item/brand/unit, quantity, source/destination, previous/new values for corrections, reason, and approver when approval applies. Do not invent approvals for routine issues. Stock-adjustment, master merge, brand editing, expiry settings, and posted-entry correction permissions remain open.

## 11. Unresolved decisions - ask only when needed

| ID | Decision still needed |
|---|---|
| D-01 | First Inventory release boundary: which receipt/demand/transfer/count features are included, and which production/purchase interfaces are deferred? |
| D-02 | Who performs, enters, and verifies lower-kitchen daily counts? This was the last unanswered inventory question before setup discussion. |
| D-03 | Exact production completion, dispatch, in-transit, and receipt posting points; responsibility for missing/damaged goods and partial transfers. |
| D-04 | Count cutoff and movements during counting; variance approval, reasons, later corrections, and whether approved closing can reopen. |
| D-05 | Stock valuation method and handling of differing brands/rates, invoice-pending costs, and historical costs. |
| D-06 | Archive/history-preservation and controlled-merge principles RESOLVED by ADR-0001. Merge authority/process details and brand-master changes versus selecting another brand remain unspecified; do not invent them. |
| D-07 | Negative-stock behavior, backdated entries, cancelled issues, unused-material returns, and supplier-return handling. These were not established in discussion. |
| D-08 | Item-specific expiry/shelf-life settings, expired-stock issue controls, lot requirements, alert timing, and who manages settings. |
| D-09 | Reorder parameters and location scope; rate-alert thresholds and whether rate changes require approval or only visibility. |
| D-10 | Item/unit/pack/brand catalog, store/freezer labels, opening stock date/quantities, and any Candela/Mahir import scope. |
| D-11 | Exact production/KDS consumption and reversal behavior, completed-production correction authority, and recipe version policy. |

No need to ask all questions at once. Resolve the decisions that block the next bounded scope; retain later-module questions for their phase.

## 12. Draft acceptance scenarios for later QA

These are review scenarios, not executed software tests or blanket scope approval.

1. INV-06/07: receive a known pack/brand and issue a smaller configured unit; quantity conversion and brand identification remain correct. Missing conversion is not guessed.
2. INV-11 / ADR-0001: Owners and Managers can create/adjust masters; only an Owner can deactivate/archive. Products with any listed history cannot be hard-deleted, and history stays intact and auditable. Duplicate handling uses controlled merge without destructive deletion; unspecified process details require clarification.
3. INV-25: a mandatory-expiry item cannot complete receipt without the required value; nonmandatory items follow their approved settings.
4. INV-22: store issue moves the issued quantity/responsibility to Upper Kitchen without treating transfer as final consumption.
5. INV-34: partial production adds only actual output; unused material is retained without creating a fictitious full batch or loss.
6. INV-29/32: store monthly and kitchen daily counts show book versus physical quantities; adjustment behavior follows D-04 and retains the original evidence.
7. Production interface: chef cannot edit a completed entry; corrections follow the approved authority and retain history.
8. D-03/11: transfer, production, sale, and KDS events do not double-count stock or consumption; approved reversals preserve traceability.

## 13. Documentation review and next step

Review this draft against source user statements, preserving the status labels and unresolved decisions. Approve a bounded Inventory scope before implementation. Do not treat earlier assistant feature lists, hypothetical examples, or technology suggestions as user-approved rules.
