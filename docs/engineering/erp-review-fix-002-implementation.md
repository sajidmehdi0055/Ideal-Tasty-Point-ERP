# ERP-REVIEW-FIX-002 — Codex review fixes adapted onto main (implementation note)

Date: 2026-10-06. Branch: `fix/erp-review-fixes-002` (from main 86b417c == origin/main). Track: DEV TRACK (backend + Item frontend + docs).
Authority: owner prompt in the Cowork Manager session (2026-10-06): assess the Codex handoff `docs/engineering/claude-handoff-2026-10-05.md` (exists only in the Codex worktree, not on main; worktree `codex/erp-review-fixes`, base 889a5e2, uncommitted), compare every finding with current main, adapt only confirmed missing fixes on a new isolated branch. Not authorized: staging, commit, push, merge, deployment, `erp_local`, operational migrations, real data, live AI settings. Scope and per-finding disposition: [2026-10-03-erp-review-fixes.md](../decisions/2026-10-03-erp-review-fixes.md).

The Codex worktree and branch were only read; they are unchanged. Codex's "integration RUNNING" entry was not used as evidence — every check below was re-run on this candidate.

## Changes

| Area | Files | What |
|---|---|---|
| Receipt retry | `backend/migrations/202610030001_inventory_receipt_idempotency.sql` (new), `backend/scripts/runtime-grants.sql`, `goods-receipt-routes.ts`, `goods-receipt-service.ts`, `goods-receipt-repository.ts`, `pg-goods-receipt-repository.ts` | Optional `Idempotency-Key` (branch + user scope, SHA-256 of parsed body, advisory lock, mapping inserted in the same transaction as receipt/stock/purchase/audit). Contract and limits: `backend/README.md` → "Receipt retry protection". No supplier-bill uniqueness. |
| AI redirect | `backend/src/ai/providers/http.ts`, `backend/src/ai/types.ts` | `redirect: 'error'` on the single outbound AI HTTP path (both providers). |
| Purchase date | `backend/src/inventory/domain/purchase-record.ts` | Asia/Karachi "today" for standalone purchases (resolves ADR-0009 A-01 note); year 0000 rejected in the shared calendar check (also receipt/order dates). |
| Item frontend | `frontend/src/features/items/{api.ts,ItemListPage.tsx,ItemFormPage.tsx,types.ts}`, `session-cache.ts` (deleted), `frontend/src/lib/api-client.ts` (`getWithHeaders`) | Edit page loads `GET /items/:id` (refresh/direct link works, stale-response guard, Try again). List uses main's INV-ITEM-LIST-001 contract: backend `search` (debounced 300 ms, max 100 chars), `X-Result-Truncated` notice, 403 → no-access message, errors never replaced by cached data. |
| Tests | `backend/tests/unit/{ai-providers,goods-receipt-api,purchase-record-date}.test.ts`, `backend/tests/integration/{goods-receipt,item,uom-brand-pack}-postgres.test.ts`, `frontend/src/features/items/__tests__/{ItemListPage,ItemFormPage,api}.test.tsx/ts` | Codex tests adopted; added real-loopback redirect test (301/302/303/307/308 × both providers) and list/api contract tests. |
| Docs | `backend/README.md`, `docs/decisions/ADR-0009-s05-goods-receiving.md`, `docs/decisions/2026-10-03-erp-review-fixes.md` (new here), this note, `CURRENT-HANDOFF.md` | |

Not adopted from Codex: its backend item list/get (would regress main's search/active/limit/header contract), the `ItemRepository` test stand-in edits (main already has them), and the ARCHITECTURE.md / MODULE-BOUNDARIES.md / root README reconciliation (outside this bounded scope, written for base 889a5e2).

## Database impact

One additive migration (new table + 2 immutability triggers + grants SELECT/INSERT). No existing table, row, history or audit changed. Down migration refuses. Applied only to random isolated schemas in a disposable PostgreSQL 16 `erp_test` in the cloud sandbox. Deployment later (separately authorized): stop API → `npm run migrate` → re-run `scripts/runtime-grants.sql` → start → verify.

## Verification and review

See [CURRENT-HANDOFF.md](CURRENT-HANDOFF.md) (ERP-REVIEW-FIX-002 entry) for exact checks and the independent QA result. Same-provider review limitation applies (Codex/Antigravity paused, GOV-MANAGER-SUBAGENT-001).
