# AI-S03 — Read-only AI tools for S-07 Stock Transfers: implementation traceability

Branch: `feat/ai-s03-transfer-tools` (from verified main `5b39a3c`, main == origin/main). Decision: [ADR-0012 addendum A-1](../decisions/ADR-0012-ai-s01-foundation.md#addendum-a-1--ai-s03-stock-transfer-read-tools-2026-10-03). Business rules: [ADR-0011](../decisions/ADR-0011-s07-stock-transfer.md). Architecture guide: [AI_ARCHITECTURE.md](../architecture/AI_ARCHITECTURE.md) §3.

## Scope (owner task AI-S03, 2026-10-03)

READ-only AI tools over the existing `StockTransferService`, same Owner/Manager guard as the Phase 1 tools. Excluded: migration, new dependency, WRITE tool, frontend, system-prompt change.

## Tools

| Tool | Input (strict) | Service call |
|---|---|---|
| `inventory_list_stock_transfers` | `status?` `SENT`/`RECEIVED`/`CANCELLED`, `limit?` 1–200 (default 50) | `StockTransferService.list({ status? }, auth)` → `{ total_matching, returned, truncated, rows }` |
| `inventory_get_stock_transfer` | `stock_transfer_id` (uuid) | `StockTransferService.get(id, auth)` → transfer unchanged (lines: sent / received / variance quantity and reason as decimal strings) |

Descriptions explain `SENT` = in transit (ADR-0011 D-04), `variance_quantity` = sent − received recorded at receipt, reaching neither location (O-03), and that received/variance are null while `SENT` and for `CANCELLED`. A missing or other-branch id surfaces the service's `TRANSFER_NOT_FOUND` as a tool error.

## Files

- Changed: `backend/src/ai/tools/inventory-tools.ts` (two `readTool` entries; `stockTransfers: StockTransferService` in `InventoryToolServices`).
- `backend/src/app.ts`: no edit needed — it already builds `services.stockTransfers` once and passes the whole `services` object to `inventoryTools(services)`; the new required interface field makes the compiler enforce the wiring, and `ai-api.test.ts` proves it end to end through `buildApp`.
- `backend/src/ai/system-prompt.ts`: unchanged, `SYSTEM_PROMPT_VERSION` stays `erp-ai-v1` (rules already cover every ERP value; tool names are injected per request; meanings live in the tool descriptions).
- Tests: `tests/unit/ai-inventory-tools.test.ts`, `tests/unit/ai-api.test.ts`, `tests/integration/ai-postgres.test.ts`.
- Docs: ADR-0012 addendum A-1, AI_ARCHITECTURE.md §3 (tool table, "How to add a tool" step 3 clarified), this file, backend/README.md, README.md, CURRENT-HANDOFF.md.

## Requirement → evidence

| Requirement | Evidence |
|---|---|
| READ only, Owner/Manager guard reused | `ai-inventory-tools.test.ts` "exist as READ tools behind the Owner/Manager guard" (OWNER/MANAGER true, CASHIER/null false); service guard still 403 when called directly |
| Strict validation | `ai-inventory-tools.test.ts` "validate arguments strictly" (bad status/case, limit 0/201/2.5, unknown keys such as `branch_id`, non-uuid id) |
| Correct service call with caller's AuthContext, data unchanged | `ai-inventory-tools.test.ts` (list with/without status, get, deep-equal result; send/receive/cancel never called); `ai-api.test.ts` through `buildApp` |
| Tool list now 12 | `ai-inventory-tools.test.ts` length 12; `ai-api.test.ts` names offered to the model (12) |
| Not found is visible, no fake result | unit: rejects `TRANSFER_NOT_FOUND` 404; `ai-api.test.ts`: tool_call `ERROR`/`TRANSFER_NOT_FOUND` |
| Cross-branch isolation (real PostgreSQL, runtime grants, authoritative migrate) | `ai-postgres.test.ts` "AI-S03: stock-transfer READ tools keep branch isolation": branch A and B each see only their own transfers (list, `SENT` filter), get of the other branch's id → `TRANSFER_NOT_FOUND` without leaking its locations; variance `0.500000` and nulls returned as stored; audit rows carry the caller's actor/branch and outcome |

Mutation check (implementer): forcing the tools to use a fixed `branch-a` context made the integration and unit tests fail, then the change was reverted.

## Verification (Cowork VM, Node 24.21.0, embedded PostgreSQL 17.10)

AI-S03-IMPL-001: typecheck/lint/build PASS; unit 527/527 (15 files; main 520 + 7); integration 113/113 (8 files; main 112 + 1).
