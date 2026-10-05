# UI-STOCK-001 — Stock Locations + Stock Ledger screens (Figma design, owner-approved)

Date: 2026-10-05. Track: PARALLEL TRACK (design only — no frontend code, backend, API or migration change).
Authority: owner chose this as the next task (2026-10-03) and approved the Figma proposal as proposed, without changes (2026-10-05). Owner decision D-1 (2026-10-05): ask the DEV TRACK for an item list/search endpoint.
Backend contract: S-04 on main (ADR-0008) plus movement types from S-05 (`RECEIPT`) and S-07 (`TRANSFER_OUT` / `TRANSFER_IN` / `TRANSFER_RETURN`); main 16980d3.
Design source: Figma file `N9KkqXIQuvCUj9NVAj6Cx4`, section `110:10042` "APPROVED 2026-10-05 — Stock Locations + Stock Ledger (UI-STOCK-001)". Board `110:10045` (contract, gaps, error → UI). Local components `110:10054` (`Stock/Button`, `Stock/Badge/Status`, `Stock/Badge/Tag`, `Stock/Field`). Shell = approved ERP Shell v2 (`86:2`); colours = `ITP / Theme` (Light + Dark).

## Screens and states

| # | State | Figma (Light) |
|---|---|---|
| L1 | Stock Locations list (Owner): freezers indented under their store/kitchen; type, parent, items in stock, status; Rename / Deactivate / Activate; "Show inactive" | 111:10042 |
| L2 | New location: type first (Store / Kitchen / Freezer); Parent field only for Freezer | 113:10190 |
| L3 | Rename — 409 DUPLICATE_LOCATION_NAME inline; type and parent read-only | 113:10412 |
| L4 | Deactivate confirmation (Owner only, empty location) | 113:10622 |
| L5 | Cannot deactivate — 409 LOCATION_HAS_STOCK (also ACTIVE_CHILDREN / PENDING_TRANSFERS text) | 113:10820 |
| L6 | Empty — no locations yet | 114:10807 |
| L7 | Manager view — no Activate/Deactivate, one "Owner only" note in the toolbar | 114:11116 |
| L8 | Mobile (< 768 px) — cards, actions in ⋮ menu | 114:11444 |
| G1 | Stock Ledger — Balances tab (default): grouped by location, location filter, item text filter, zero balances hidden by default, row actions History / Adjust | 115:11118 |
| G2 | Movements tab filtered by item: date & time, type badge, location, signed change, reason | 115:11417 |
| G3 | Adjust stock (from a balance row): Increase / Decrease, quantity in base unit, reason required, "balance after saving" preview | 116:11361 |
| G4 | Opening stock — target design; blocked until the item list/search exists (G-1, D-1) | 116:11606 |
| G5 | Adjust — 409 NEGATIVE_BALANCE inline, red preview | 116:11835 |
| G6 | Empty — no stock yet | 117:11751 |
| G7 | Mobile balances | 117:12067 |

Dark twins (same frames with the `ITP / Theme` Dark mode): L1 117:12279, L2 117:12454, G1 117:12659, G2 117:12837, G3 117:12969, L8 117:13203. Sample names and quantities in the frames are illustrative only.

## Behaviour (as approved)

- Routes: `/stock/locations`, `/stock/ledger` (existing placeholder routes). Ledger tabs: Balances (default), Movements. "History" on a balance row opens Movements filtered to that item + location.
- "Items in stock" on a location = number of items with a balance above zero (client-side from `GET /stock/balances`).
- Balances: location filter uses the server filter `location_id`; item text filter is client-side; group headers show the parent path (e.g. "Main Store › Freezer 1") from the locations list.
- Adjust: `quantity_delta` = +quantity (Increase) or −quantity (Decrease), reason mandatory (≤ 500), quantity in the item's base unit with up to 6 decimals; the preview is client-side, the server 409 stays the final guard.
- Owner-only `active` changes: hidden for a Manager (not shown disabled), explained once in the toolbar.
- Times shown in Asia/Karachi; quantities shown with the base unit name returned by the API.

## Frontend contract gaps (the UI must not pretend these exist)

- **G-1** No item list/search endpoint on main (`GET /api/inventory/items` is not registered) → Opening stock cannot offer an item picker. Until the DEV TRACK endpoint (D-1) is on main, the Opening stock button is disabled with an explanation. Adjust works today (item + location come from the balance row).
- **G-2** Movements have no user, no document number (GRN / TRF) and no running balance.
- **G-3** No pagination or date filter on balances / movements.
- **G-4** Quantity only (ADR-0008 O-04); stock in transit is not part of balances (future Stock Transfers screen).
- **G-5** Reads are Owner / Manager only → other roles get the existing Access-denied state. `active` is Owner only.
- **G-6** Server time only (no backdating). Balance never below zero (D-04, DEFAULT / ASSUMED).
- **G-7** No real login / branch contract → header branch switcher and user menu remain design-only (Shell v2 rule).

## Error → UI

400 VALIDATION_ERROR → inline under the field · 400 INVALID_PARENT / 409 PARENT_INACTIVE → inline under Parent · 409 DUPLICATE_LOCATION_NAME → inline under Name · 409 LOCATION_HAS_STOCK / LOCATION_HAS_ACTIVE_CHILDREN / LOCATION_HAS_PENDING_TRANSFERS → "Cannot deactivate" dialog (L5) · 409 OPENING_ALREADY_EXISTS / STOCK_HISTORY_EXISTS → inline + "use Adjust instead" · 409 NEGATIVE_BALANCE → inline under Quantity (G5) · 409 LOCATION_INACTIVE / ITEM_INACTIVE → inline · 403 → Access denied (read) / Owner-only note · 404 → "no longer exists — refresh".

## Next

1. DEV TRACK: item list/search endpoint (D-1) in its own branch, chat and review.
2. UI-STOCK-002: frontend implementation of these screens in its own branch/worktree; Opening stock stays disabled until D-1 is merged.
