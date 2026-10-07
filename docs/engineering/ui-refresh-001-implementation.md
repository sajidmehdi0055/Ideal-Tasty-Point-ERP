# UI-REFRESH-001 — Direction A visual refresh (frontend implementation)

Date: 2026-10-07. Track: PARALLEL TRACK (frontend only — no backend, API, migration, auth, business-rule or npm dependency change).
Branch: `feat/ui-refresh-001` (from main d77ac09 == origin/main), worktree `Ideal-Tasty-Point-ERP-ui-refresh-001`.
Authority: owner approved the design on 2026-10-07 (Figma file `N9KkqXIQuvCUj9NVAj6Cx4`, section `122:12606` "APPROVED 2026-10-07 — UI-REFRESH-001") and gave the UI-REFRESH-001 task brief (tokens, font, shared components, DataTable features, formats, screens, quality gates). Same-provider review limitation applies (Codex/Antigravity paused, GOV-MANAGER-SUBAGENT-001).

## What changed

### Tokens and font (`frontend/src/styles/index.css`, `frontend/src/assets/fonts/manrope/`)

- All `--itp-*` names and `@theme inline` mappings kept; Light and Dark values replaced with the approved table. Mapping of existing names: `*-50` = badge background, `*-600` / `*-700` = text colour.
- Added: `--itp-sidebar-indicator`, row heights (`h-row-comfortable` 48, `h-row-compact` 36, `h-row-header` 40), `px-gutter` 28, `--radius-dialog` 16; control radius 9, card 14.
- Derived (not in the approved table; technical choice, listed in the CSS header): action-hover `#2a3bb8` / `#4a5ae6`, action-disabled `#8f99e7` / `#35408a`, focus-soft `#d6dbfa` / `#26306a`, danger-solid `#c0262d` (both themes, white text 5.90:1), danger-solid-hover `#a31f25`.
- Contrast (WCAG AA 4.5:1) checked for text/badge/action pairs in both themes; all pass except white on the Light *disabled* button (2.67:1 — disabled controls are exempt).
- Manrope variable woff2 (latin + latin-ext, weights 200–800) vendored from `@fontsource-variable/manrope@5.3.0` (obtained with `npm pack` outside the repo, not a dependency), SIL OFL 1.1 (`OFL.txt`), `@font-face` with `font-display: swap`, system sans-serif fallback. No CDN. Number columns use `tabular-nums`.

### Format helper (`frontend/src/lib/format.ts`)

`formatQuantity`, `formatSignedQuantity`, `unitLabel`, `formatDate`, `formatTime`, `formatDateTime`, `karachiDayKey`, `formatDayGroupLabel`, `groupByKarachiDay`. Exact decimal maths reuses `parseQuantity` (BigInt) from `features/stock/quantity.ts`; ≤ 3 decimals shown (half-up), full value (≤ 6) in a tooltip; thousands separator; true minus sign; Asia/Karachi via `Intl` (independent of the machine time zone). Invalid input never throws (raw value returned).

### Shared components (`frontend/src/design-system/components/`)

`PageIntro`, `SummaryTiles`, `Badge` + `ActiveStatusBadge` (`StatusBadge` kept, now on Badge), Button size `xs` + variant `danger-text`, `Tooltip` (hover + focus, Esc), `IconButton` (always a tooltip), `Modal` sizes `small` 440 / `medium` 640 (legacy `md`/`lg`/`xl` still accepted), 16 px radius, sunken footer, full-screen sheet below 768 px, focus returned to the opener, `dirty` → inline "Discard unsaved changes?" (Keep editing / Discard) on Esc / ✕ / backdrop / `requestClose`; `ToastProvider` + `useToast` (success bottom-right 380 px, auto-hide 5 s, timer stopped while hovered/focused and restarted (full 5 s) on leave; error stays until closed; no-op outside the provider); states: skeleton `LoadingState`, `EmptyState`, `ErrorState` ("Your data is safe." + Try again), new `NoAccessState`. Icons added: CircleCheck, Columns3, GripVertical.

### DataTable features (`frontend/src/design-system/data-table/`)

`useTableSettings(screenId, columns)`, `DataTable` (colgroup + sticky 40 px header), `DataRow` / `DataGroupRow` / `DataCell`, `DataTableToolbar`, `ResultCount`, `DensityToggle`, `ColumnsMenu` (locked required columns, "N hidden", "Reset to default" = widths + columns), resize handles (tooltip "Drag to resize · double-click to fit", min/max width, double-click fit, keyboard arrows), `TruncationBanner` (exact approved text), `useSlashFocus`. Storage key `itp-erp:table:<screenId>` (`{v:1, density, widths, hidden}`), all access through `safe-storage`, values validated; a stored hidden required column is ignored. Customisation (density, resize, columns) only with `(hover: hover) and (pointer: fine) and (min-width: 1024px)`; otherwise the default layout is used and stored preferences are kept.

### Screens

| Screen | Changes |
|---|---|
| Shell | Light sidebar in Light theme, tinted active item + 3 px indicator (expanded and rail), header title 20/800, 28 px gutter; tooltips on all icon-only buttons. |
| Stock Ledger — Balances | PageIntro "Balances by location" + Opening stock (desktop), tiles (below), DataTable `stock-balances` (Item, Quantity, Actions — all required), location group rows with type badge, freezers indented, code under name / same line in Compact, History icon button + Adjust (xs). |
| Stock Ledger — Movements | DataTable `stock-movements` (Time, Item, Location, Type, Quantity, Reason; Item + Quantity required), grouped by Karachi day (Today / Yesterday / "Mon 05 Oct 2026"), signed coloured quantity, type badges (Opening neutral, Receipt success, Transfer in info, Transfer out neutral, Adjustment warning, Transfer return neutral). |
| Adjust stock / Opening stock dialogs | `small` (440) / `medium` (640), restyle only: API calls, validation and error mapping unchanged; `dirty` guard; success toast replaces the inline status line (R5). |
| Stock Locations | PageIntro, tiles (Locations + inactive, Stores, Kitchens, Freezers), DataTable `stock-locations` (Location + Actions required), type badges, status badges, xs actions, New/Rename `medium`, Deactivate/Cannot `small`, toasts. |
| Item Master | PageIntro, tiles (Total, Active, Inactive, Primary types — only from an untruncated, unsearched load), DataTable `items` (Item + Actions required), approved truncation banner, `unitLabel` for base unit, NoAccessState on 403, save toast from the form page. |
| Catalog Settings | PageIntro, tabs with Brands / Pack Variants marked "Pending", UOM DataTable `uom` (Unit + Actions required, stored names unchanged), UOM dialog `small` with `dirty` guard, toasts. |
| AI Assistant panel | Left edge drag 440–760 px, double-click resets to 440, width in `itp-erp:ai-panel-width`, keyboard (arrows ±16, Home/End); desktop side panel only; restyle only. |

Balances tiles: **Items in stock** = distinct items with a balance above zero in the loaded balances (location filter applies); **Locations** = active locations with a type breakdown; **Zero balances** = zero rows (neutral); **Transfers in transit** = length of `GET /api/inventory/transfers?status=SENT` (the only new call; on failure "—" + "Could not load transfers").

## Contract gaps (left out, nothing invented)

- Movements: no user, document number or running balance in the API (G-2).
- Header branch switcher and user menu (Figma) not rendered — no real login/branch yet (G-7).
- Item list: no total count, so tiles are hidden when the list is truncated and the Figma footer "Showing 8 of 124" is omitted.

## Deviations from Figma (deliberate)

- Movements toolbar search and "All types" filter, and "Show inactive" on Items/UOM, not built (not in the approved scope).
- Button `md` stays 40 px (matches inputs); table customisation incl. the density toggle hidden below 1024 px / touch.
- Inactive location rows stay dimmed (existing tested behaviour; owner-approved 2026-10-08). Tab label "UOM Master" kept. History tooltip "History" (Figma "Movement history").
- Resize line covers the header only; Items "Active" tile note avoids a purchasing rule that is not approved.

## Visual check

Playwright (playwright-core in the session scratchpad only) on the Vite dev server with mocked API: 18 scenarios × Light/Dark × 1440/1024/390 (102 screenshots), compared with the Figma frames; differences fixed in e93fcd3 (the 1024 px column overflow was fixed later in 1f8ee96, see below). No horizontal page scroll at 390; dialogs are full-screen sheets there. Two defects found and fixed in that pass: dialogs stretched to full window height on desktop, and (dev/StrictMode) dialogs closed right after opening.

## Commits

| Commit | Content |
|---|---|
| e7d41b9 | tokens, Manrope, format helper |
| 5d718ae | shared components |
| 50509a5 | shell, AI panel width, tooltips |
| 782b38c | DataTable features |
| b33e708 | Stock Locations |
| ee60eb6 | Item Master, Catalog Settings |
| 28ec9a4 | Stock Ledger |
| e93fcd3 | visual pass fixes |
| 1f8ee96 | review fixes (REVIEW-001): column widths fit the table at 1024 px, Modal native-close tests, locked-column accessible name, focus ring transition |

At 1024 px the default column widths (Items, Locations, Movements) were wider than the table, which pushed the required Actions column out of view (found by the independent review). `fitColumnWidths` now shrinks default widths toward each column's minimum when they do not fit; widths the user set are kept (inner table scroll only then). Verified in Chromium on all five list screens at 1024 and 1440.

## Owner decisions (2026-10-08)

- **Units in the Adjust / Opening stock dialogs:** use the display label (L, kg, pcs) per the format rule, not the stored code that Figma R2 draws. Done in a follow-up commit. It covers the dialog summary, preview, quantity label/hint, the NEGATIVE_BALANCE message, the Opening item-picker options, and also the Movements "Balance now" line, which still showed the stored code. Only display text changed; requests still send the stored codes as before.
- **Dimmed inactive location rows:** approved.

## Follow-up NOTEs (deliberate deviations, not built in this slice)

- **NOTE F-1:** Movements toolbar search + "All types" filter (Figma R6).
- **NOTE F-2:** "Show inactive" filter on Item Master and UOM Master (Figma). The Items API already supports `active`.

## Verification and independent review

See [CURRENT-HANDOFF.md](CURRENT-HANDOFF.md) for the check results and the QA verdict (UI-REFRESH-001-REVIEW-001).
