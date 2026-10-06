# UI-STOCK-003 — Opening stock dialog (G4) with item picker (frontend implementation)

Date: 2026-10-06. Track: PARALLEL TRACK (frontend only — no backend, API, migration, auth or dependency change).
Branch: `feat/ui-stock-003-opening-stock` (from main 86b417c == origin/main), worktree `Ideal-Tasty-Point-ERP-ui-stock-003`. Main bd121ce (ERP-REVIEW-FIX-002) merged into this branch on 2026-10-07 (merge 666d1d5, see the last section). Status: see [CURRENT-HANDOFF.md](CURRENT-HANDOFF.md); **not merged to main**.
Design: [ui-stock-001-stock-screens-design.md](ui-stock-001-stock-screens-design.md) G4 — Figma `N9KkqXIQuvCUj9NVAj6Cx4`, frame `116:11606` (section `110:10042`, components `110:10054`). Contract: `POST /api/inventory/stock/opening` (S-04, ADR-0008; S-05 O-07 opening-first rule) and `GET /api/inventory/items` (INV-ITEM-LIST-001), both on main. Gap G-1 is closed by INV-ITEM-LIST-001.

## Code

| File | Change |
|---|---|
| `frontend/src/features/stock/ledger/OpeningStockDialog.tsx` | New. G4 dialog: Location (active only, tree order, freezers as "Freezer 2 · Main Store" as in the frame), Item (picker), Quantity in the item's base unit, the frame's info note, Cancel / Save opening stock. Client validation as in Adjust (location, item, quantity shape ≤ 12 digits / ≤ 6 decimals, > 0). Sends `{ item_id, location_id, quantity }` — the exact strict server schema. |
| `frontend/src/features/stock/ledger/ItemPicker.tsx` | New. ARIA combobox over `GET /api/inventory/items?search=…&active=true&limit=50`: 250 ms typing pause, stale answers ignored, ↑/↓ + Enter, Esc closes only the list (not the dialog), mouse pick keeps focus, Retry on error, empty text, and the "Showing the first N matches — type more…" hint when the server sends `X-Result-Truncated: true`. Input limited to the server's 100-character `search` limit. |
| `frontend/src/features/stock/ledger/StockLedgerPage.tsx` | Opening stock button enabled (disabled state + "not available yet" text removed); opens the dialog; after saving: balances re-read and one status line "Opening stock saved — {item} at {location path}: {qty} {unit} ({time})." like Adjust. Still not shown on mobile (< 768 px, G7 has no Opening stock). |
| `frontend/src/features/stock/api.ts`, `types.ts` | `createOpening()` + `OpeningStockInput`. |
| `frontend/src/features/items/api.ts` | Uses main's `listItems(query)` → `{ items, truncated }` (ERP-REVIEW-FIX-002). `ItemListQuery` gains optional `active` / `limit` additively — sent only when set, so existing callers (Item list page) send exactly what they did before. The picker calls `listItems({ search, active: true, limit: 50 })`. |
| `frontend/src/lib/api-client.ts` | No change of its own: `apiClient.getWithHeaders()` is main's (ERP-REVIEW-FIX-002). |
| `frontend/src/design-system/components/Modal.tsx` | `size="xl"` = 520 px (the G4 frame's dialog width); `md` / `lg` unchanged. |
| Tests | New `features/stock/__tests__/OpeningStockDialog.test.tsx` (20 tests: form/location list, server search + debounce + keyboard pick (Enter with a complete form does not save), stale-answer guard, search term ≤ 100 chars, truncated hint, empty + error/Retry, Esc, client validation, happy path + status + re-read, 8 server errors, pair-error reset, not dismissible while saving, theme-token-only classes); `StockLedgerPage.test.tsx` (button now enabled); `api-client.test.ts` (+1 `getWithHeaders` header test); `features/items/__tests__/api.test.ts` (main's file) +2 tests for `active` / `limit`. |

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
- Item list page (`/items`): since ERP-REVIEW-FIX-002 (main) it uses backend search and shows the `X-Result-Truncated` notice; this branch does not change it.

## Visual check

Playwright (playwright-core in the session scratchpad, not a project dependency) + Chromium on the Vite dev server with mocked `/api` responses: Light and Dark at 1440 and 820 px — form, open picker with truncation hint, 409 STOCK_HISTORY_EXISTS inline. No horizontal page overflow at either width. Mobile (390 px) not re-checked: no Opening stock there by design (existing test).

2026-10-07 (after the merge of main): Playwright 1.63 (`playwright-core` in the session scratchpad) + system Chrome on the Vite dev server with a stateful mocked `/api` — Light + Dark at 1440 / 820 / 390 px, 42 PNGs in `Claude outputs/ui-stock-003/` (outside the repo/worktree; not committed): ledger, empty dialog, picker with truncation hint, no match, error + Retry, filled form, 409 `OPENING_ALREADY_EXISTS` inline, success status + new balance row, Adjust on that row, adjustment saved + updated balance. At 390 px only the ledger: Opening stock is hidden by design (G7). Browser checks 84/84 OK: no horizontal overflow on any shot, no page errors, no unmocked API call, pair error cleared after changing location, balances re-read after the opening save, Adjust on the new row (Main Store › Freezer 2) saves +2.5 and the row shows 15.

Keyboard in a real browser (Playwright/Chromium, review MINOR-3): with the item list open, Esc closes only the list and the dialog stays open; Enter on a highlighted option picks it without saving even when location and quantity are filled; Enter with the list closed submits the form as usual. jsdom cannot show either (no native `<dialog>` cancel on Esc; user-event's implicit submit ignores a submit button linked with `form=`), so these two are covered by this browser check, not by vitest.

## Owner demo (local, dev/test data only — never `erp_local` or real data)

**Limitation (2026-10-07):** the standalone backend on main has no AuthContext provider yet (real login, ADR-0005, pending), so every items/stock call — reads and writes — answers 401 and the ledger shows "Not signed in — sign-in is not implemented yet…". A full Opening stock → Adjust demo against the real backend is therefore not possible today; adding a dev auth shortcut is an auth change and is not authorized. The compose file's default database is `erp_local`, so the real-stack demo also needs a separate empty dev database (README step 2).

A. Real stack (shows the screens load and the 401 state) — VS Code PowerShell, commands from `backend/README.md`:

1. `cd backend` · `$env:POSTGRES_PASSWORD = '<local-only password>'` · `docker compose up -d postgres`
2. Provision an empty dev database + runtime login (README steps 2–4: `npm run migrate:check`, `npm run migrate`, `psql ... -f scripts/runtime-grants.sql`) — not `erp_local`.
3. `$env:DATABASE_URL = 'postgres://<runtime-login>:<password>@127.0.0.1:5432/<dev-db>'` · `npm run dev` (API on 127.0.0.1:3000)
4. New terminal: `cd frontend` · `npm run dev` → open http://localhost:5173/stock/ledger → expected: "Not signed in — sign-in is not implemented yet…" (401) until real login exists.

B. Full flow with mocked API (repeatable now, no backend or database):

1. `cd frontend` · `npm run dev` (keep it running).
2. New terminal: `mkdir $env:TEMP\itp-demo` · `cd $env:TEMP\itp-demo` · `npm init -y` · `npm i playwright-core` (scratch folder only — not a project dependency).
3. `Copy-Item "C:\Users\sajid mehdi\Documents\Ideal-Tasty-Point-ERP\Claude outputs\ui-stock-003\demo-ui-stock-003.mjs" .` · `node demo-ui-stock-003.mjs --headed`
4. Watch Chrome: Stock Ledger → Opening stock → pick item (search, truncation hint, no match, Retry) → location → quantity → 409 for Main Store (opening already exists) → Freezer 2 saves → new balance row 12.5 LITER → Adjust on that row (+2.5, reason) → balance 15. The terminal prints each check as OK / FAIL.

## Review fixes (UI-STOCK-003-REVIEW-001)

- MINOR-1: the Enter test now fills location and quantity first, so a form submit would really save.
- MINOR-2: items API tests cover the exact query string and the truncation header (since the merge of main: `features/items/__tests__/api.test.ts`).
- MINOR-3: stale-answer test with a delayed older search; Esc/Enter checked in Chromium (above).
- MINOR-4: the search term is cut to the server's 100-character limit (a long picked label edited by one character no longer causes a 400).

## Merge of main (bd121ce)

2026-10-07, merge commit 666d1d5 (owner-approved `git merge --no-commit --no-ff main`, then `git commit --no-edit`; local, not pushed). Rule: main's ERP-REVIEW-FIX-002 contract wins.

| File | Resolution |
|---|---|
| `frontend/src/lib/api-client.ts` (conflict) | Main's version exactly (`requestWithHeaders` / `getWithHeaders` → `{ data, headers }`); the branch's own `send()` dropped. |
| `frontend/src/features/items/api.ts` (conflict) | Main's `listItems` / `getItem` kept unchanged in behaviour; optional `active` / `limit` added to `ItemListQuery` (sent only when set); the branch's `listItemsPage` and `ItemListPage` type removed. |
| `docs/engineering/CURRENT-HANDOFF.md` (conflict) | Both entries kept in full, newest first. |
| `ItemPicker.tsx`, `OpeningStockDialog.test.tsx` | Switched to `listItems(...)`; no behaviour change (debounce, stale guard, truncated hint, 100-char cap). |
| `features/items/api.test.ts` (branch) | Removed; its 2 `active` / `limit` tests moved into main's `features/items/__tests__/api.test.ts`; its third test duplicated main's default-list test. |
| `lib/api-client.test.ts` | One header test kept; reads `result.data` (main's shape). |

Backend, migrations, auth and package files are identical to main (`git diff main -- backend` empty).
