# UI-STOCK-002 — Stock Locations + Stock Ledger (frontend implementation)

Date: 2026-10-06. Track: PARALLEL TRACK (frontend only — no backend, API, migration or auth change; no new npm dependency).
Branch: `feat/ui-stock-002-stock-screens` (from `docs/ui-stock-001-figma-approval` bfcf582, which is main 16980d3 + the approved design record). Status: implemented, independent QA pending/recorded in CURRENT-HANDOFF; **not merged**.
Design: [ui-stock-001-stock-screens-design.md](ui-stock-001-stock-screens-design.md) (UI-STOCK-001, Figma section `110:10042`, board `110:10045`). Contract: S-04 (ADR-0008) + movement types from S-05 / S-07 on main.

## Code

`frontend/src/features/stock/`

| File | Purpose |
|---|---|
| `types.ts`, `api.ts` | Types mirror `backend/src/inventory/domain/stock-location.ts` and `stock.ts`. `GET/POST /api/inventory/locations`, `PATCH /locations/:id`, `GET /stock/balances`, `GET /stock/movements` (only `item_id` / `location_id` are ever sent — the server query schema is strict), `POST /stock/adjustments`. `POST /stock/opening` is **not** called (G-1). |
| `quantity.ts` | Exact decimal maths with BigInt millionths (NUMERIC(18,6)); display without trailing zeros, thousands grouping, true minus sign; the same input shape as the server (≤ 12 digits, ≤ 6 decimals). |
| `locations-tree.ts` | Stores/kitchens by name, each followed by its freezers; "Main Store › Freezer 1" paths. |
| `format.ts` | Asia/Karachi date-time ("03 Oct 2026, 10:12"), page-level error text (401 / 403 / 404 / other), "(409 · CODE)" suffix used by the approved inline errors. |
| `components/` | `Tags` (`Stock/Badge/Tag`, movement-type tag, `Stock/Badge/Status`), `Checkbox`, `TextAction` (text row actions), `ActionMenu` (mobile ⋮ menu: arrows, Esc, outside tap). |
| `locations/StockLocationsPage.tsx` | L1, L6, L7, L8 + dialogs; items-in-stock count = balances above zero per location (client-side). |
| `locations/LocationFormDialog.tsx` | L2 New location (Name, Type cards, Parent only for Freezer — active stores/kitchens only) and L3 Rename (type and parent read-only). |
| `locations/DeactivateDialogs.tsx` | L4 confirmation and L5 "Cannot deactivate" for `LOCATION_HAS_STOCK` / `LOCATION_HAS_ACTIVE_CHILDREN` / `LOCATION_HAS_PENDING_TRANSFERS`. |
| `ledger/StockLedgerPage.tsx` | Tabs Balances / Movements (arrow keys), Opening stock disabled (G4), Adjust dialog, "Adjustment saved" status line. |
| `ledger/BalancesView.tsx` | G1 / G6 / G7: server location filter, client item filter, "Hide zero balances" on by default, groups in Stock Locations order with parent path, footer counts. |
| `ledger/MovementsView.tsx` | G2: newest first (server order), item chip from History, signed coloured change, type tags, "Balance now". Item names and units come from balances read with the same filter (movements carry ids only). |
| `ledger/AdjustStockDialog.tsx` | G3 / G5: Increase / Decrease, quantity in base unit, reason required (≤ 500, counter), exact client preview, 409 `NEGATIVE_BALANCE` inline. |

Other changes: `App.tsx` (routes `/stock/locations`, `/stock/ledger` → the new pages), `app/shell/nav-items.ts` (Stock items no longer `pending`), `design-system/components/Modal.tsx` (optional `icon` before the title and `size="lg"` = 480 px; existing callers unchanged), `design-system/icons` (+6 Lucide icons: CornerDownRight, MapPin, EllipsisVertical, Minus, Power, ArrowRight — lucide-static 1.48.0, ISC). Tests: `features/stock/__tests__/` (helpers, Stock Locations, Stock Ledger) + updated `App.test.tsx` and `Sidebar.test.tsx`.

## Behaviour decisions inside the approved design

- Access: both screens need Owner or Manager (same gate as Catalog Settings); other roles get the access-denied state and no API call. A 403 / 401 from the server is shown as a page error. `active` changes are Owner-only: hidden for a Manager, explained once in the toolbar (L7).
- "Show inactive" is ticked by default, as drawn in the approved L1 frame. Inactive rows are dimmed.
- Location order is alphabetical (server order) with freezers under their parent; the Figma sample order is illustrative.
- Deactivate: if the loaded data already shows stock (items in stock > 0) or an active freezer under the location, L5 opens straight away instead of an L4 text that would say "has no stock"; otherwise L4 → `PATCH {active:false}` and any of the three 409 codes opens L5. The server stays the final guard (stale data, pending transfers).
- Activate is direct (no confirmation, as in the frames); `409 PARENT_INACTIVE` → banner above the table.
- Create: client checks name 1–200 (trimmed), type chosen, parent chosen for Freezer; `409 DUPLICATE_LOCATION_NAME` → under Name; `400 INVALID_PARENT` / `409 PARENT_INACTIVE` → under Parent; `400 VALIDATION_ERROR` issues → per field. Rename with an unchanged name closes without a request.
- Adjust: no direction is pre-selected — the user must choose Increase or Decrease (the frame's "Decrease" is sample data). `quantity_delta` = `-`+quantity for Decrease. A negative preview turns red but Save is not blocked; the server's `409 NEGATIVE_BALANCE` is shown under Quantity (G5). `LOCATION_INACTIVE` / `ITEM_INACTIVE` / `OPENING_REQUIRED` / 404 → message at the top of the dialog. After saving, the balances re-read and a one-line "Adjustment saved — …" status is shown.
- Opening stock (G4, gap G-1): the button is disabled with the visible explanation "Opening stock needs an item search, which is not available yet." (linked with `aria-describedby`). The G4 dialog is not built until the item list/search endpoint (D-1, DEV TRACK `feat/inv-item-list-001`) is on main.
- Movements without an item filter (Movements tab opened directly) show an extra ITEM column; with the History chip the column is hidden as in G2.
- Mobile (< 768 px): cards with ⋮ menus (L8 / G7), segmented tabs. The ledger keeps the item search and "Hide zero balances" (not drawn in G7) and does not show Opening stock (not drawn in G7). Movement cards were not drawn; they follow the same card style.

## Contract gaps — how the UI handles them

G-1 Opening stock disabled with explanation (above). G-2 Movements show date, type, location, change and reason only — no user, document number or running balance; footer says so. G-3 No pagination / date filter: everything the server returns is shown. G-4 Quantity only; footer states stock in transit is not included. G-5 Owner / Manager reads; Owner-only `active`. G-6 Server time only; balances never go below zero (server guard). G-7 No real login / branch: header branch switcher and user menu are not rendered (unchanged Shell v2 rule). As with the other screens, a production build has no session yet, so it shows the access-denied state (pre-existing, out of scope).

## Known deviations / limitations

- The shared `Modal` keeps its plain footer (the frames show a sunken footer) so the approved UOM dialog does not change.
- Native `<select>` controls (Location filter, Parent) use the browser's option list.
- In the dev build the header's dev-identity select shortens the mobile page title (dev-only, pre-existing).
- Visual check: Playwright/Chromium against the Figma frames on the dev build with mocked API responses (Light + Dark, 1440 / 820 / 390 px).
