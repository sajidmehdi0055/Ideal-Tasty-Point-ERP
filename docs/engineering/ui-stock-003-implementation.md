# UI-STOCK-003 — Opening stock dialog (G4) with item picker (frontend implementation)

Date: 2026-10-06. Track: PARALLEL TRACK (frontend only — no backend, API, migration, auth or dependency change).
Branch: `feat/ui-stock-003-opening-stock` (from main 86b417c == origin/main), worktree `Ideal-Tasty-Point-ERP-ui-stock-003`. Status: see [CURRENT-HANDOFF.md](CURRENT-HANDOFF.md); **not merged**.
Design: [ui-stock-001-stock-screens-design.md](ui-stock-001-stock-screens-design.md) G4 — Figma `N9KkqXIQuvCUj9NVAj6Cx4`, frame `116:11606` (section `110:10042`, components `110:10054`). Contract: `POST /api/inventory/stock/opening` (S-04, ADR-0008; S-05 O-07 opening-first rule) and `GET /api/inventory/items` (INV-ITEM-LIST-001), both on main. Gap G-1 is closed by INV-ITEM-LIST-001.

## Code

| File | Change |
|---|---|
| `frontend/src/features/stock/ledger/OpeningStockDialog.tsx` | New. G4 dialog: Location (active only, tree order, freezers as "Freezer 2 · Main Store" as in the frame), Item (picker), Quantity in the item's base unit, the frame's info note, Cancel / Save opening stock. Client validation as in Adjust (location, item, quantity shape ≤ 12 digits / ≤ 6 decimals, > 0). Sends `{ item_id, location_id, quantity }` — the exact strict server schema. |
| `frontend/src/features/stock/ledger/ItemPicker.tsx` | New. ARIA combobox over `GET /api/inventory/items?search=…&active=true&limit=50`: 250 ms typing pause, stale answers ignored, ↑/↓ + Enter, Esc closes only the list (not the dialog), mouse pick keeps focus, Retry on error, empty text, and the "Showing the first N matches — type more…" hint when the server sends `X-Result-Truncated: true`. Input limited to the server's 100-character `search` limit. |
| `frontend/src/features/stock/ledger/StockLedgerPage.tsx` | Opening stock button enabled (disabled state + "not available yet" text removed); opens the dialog; after saving: balances re-read and one status line "Opening stock saved — {item} at {location path}: {qty} {unit} ({time})." like Adjust. Still not shown on mobile (< 768 px, G7 has no Opening stock). |
| `frontend/src/features/stock/api.ts`, `types.ts` | `createOpening()` + `OpeningStockInput`. |
| `frontend/src/features/items/api.ts` | Stale "expected to 404" comment replaced (review NOTE-1 of INV-ITEM-LIST-001). `listItemsPage(query)` → `{ items, truncated }` with the strict query (`search`, `active`, `limit`); `listItems(query = {})` keeps its old call shape for the Item list page. |
| `frontend/src/lib/api-client.ts` | `apiClient.getWithHeaders()` — same request/error path, also returns response headers (needed for `X-Result-Truncated`). Existing methods unchanged. |
| `frontend/src/design-system/components/Modal.tsx` | `size="xl"` = 520 px (the G4 frame's dialog width); `md` / `lg` unchanged. |
| Tests | New `features/stock/__tests__/OpeningStockDialog.test.tsx` (18 tests: form/location list, server search + debounce + keyboard pick, truncated hint, empty + error/Retry, Esc, client validation, happy path + status + re-read, 8 server errors, pair-error reset, not dismissible while saving, theme-token-only classes); `StockLedgerPage.test.tsx` (button now enabled); `api-client.test.ts` (+1 header test). |

## Error → UI (from `pg-stock-repository.ts` / `stock-service.ts` / `app.ts` error handler)

| Server | UI |
|---|---|
| 409 `STOCK_HISTORY_EXISTS` | Under Item: "{item} already has stock entries at {location} — opening stock must be the first entry there. Use Adjust on its balance row instead. (409 · STOCK_HISTORY_EXISTS)" |
| 409 `OPENING_ALREADY_EXISTS` | Under Item: "Opening stock for {item} at {location} already exists. Use Adjust on its balance row instead. (409 · …)" |
| 409 `ITEM_INACTIVE` / `LOCATION_INACTIVE` | Under Item / under Location |
| 400 `VALIDATION_ERROR` | Issues on `item_id` / `location_id` / `quantity` under that field; otherwise top message |
| 404 `NOT_FOUND` (item or location missing / other branch) | Top message "The item or location no longer exists — close this dialog, refresh and choose again." |
| 401 / 403 / other | Top message from the shared stock wording (`describeStockError`) |

Changing the location or item clears a pair error. While saving, the dialog cannot be dismissed (same as Adjust).

## Decisions and deviations (Figma = source of truth)

- The frame's yellow "Not available yet" banner and the "Needs GET /api/inventory/items … D-1" hint under Item were gap notes for the blocked state; both are removed (G-1 closed). The hint under Item reads "Active items only. Type part of the name or code."
- The frame's Save button is drawn disabled (blocked state); it is enabled here, with client validation like Adjust.
- Quantity label is "Quantity (base unit)" until an item is chosen, then "Quantity (LITER)" etc. (same pattern as Adjust); the hint adds "In the item's base unit (…)" once known.
- The open item list is not drawn in the frame; it follows the existing dropdown style (theme tokens, `shadow-modal`), item name left, "code · base unit" right.
- Picker page size 50 is a technical choice (not a business rule); the server's truncation flag tells the user to type more. No business rule was added: the server alone decides opening-first / duplicates / inactive.
- No Dark twin of G4 exists in Figma; Dark was checked against the G3 Dark twin style and the `ITP / Theme` Dark mode tokens.
- Pre-existing, unchanged: the Item list page (`/items`) still calls `listItems()` without parameters, so it shows at most the server default of 200 items without a truncation hint (out of scope here).

## Visual check

Playwright (playwright-core in the session scratchpad, not a project dependency) + Chromium on the Vite dev server with mocked `/api` responses: Light and Dark at 1440 and 820 px — form, open picker with truncation hint, 409 STOCK_HISTORY_EXISTS inline. No horizontal page overflow at either width. Mobile (390 px) not re-checked: no Opening stock there by design (existing test).
