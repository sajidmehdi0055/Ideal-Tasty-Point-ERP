# INV-ITEM-LIST-001 — Item list/search and get-by-id (implementation note)

Date: 2026-10-06. Branch: `feat/inv-item-list-001` (from main 16980d3). Track: DEV TRACK, backend only.
Authority: owner task INV-ITEM-LIST-001, from owner decision D-1 (2026-10-05) on UI-STOCK-001 gap G-1: there was no GET for items, so the Opening-stock dialog (and later receiving/PO/transfer forms) could not pick an item.
Module: Inventory & Store — Item Master (S-01). Related: ADR-0006 (O-03 injected AuthContext), [inventory-s01-implementation.md](inventory-s01-implementation.md).

## Endpoints

| Endpoint | Auth | Result |
|---|---|---|
| `GET /api/inventory/items` | `requireItemEditor` (OWNER/MANAGER), same as every other inventory read | 200, JSON array of `Item` from the caller's branch only |
| `GET /api/inventory/items/:id` | same | 200 `Item`; 404 `ITEM_NOT_FOUND` for unknown **or** other-branch id (identical response); 400 malformed id |

`Item` shape is unchanged: `id, item_code, item_name, primary_item_type, base_uom, brand, branch_id, active, created_at, updated_at` (`base_uom` is the UOM name, as for create/edit). This is what `frontend/src/features/items/api.ts` `listItems()` already expects; no frontend file was changed.

### List query (strict zod, `itemListQuerySchema` in `domain/item.ts`)

| Parameter | Rule |
|---|---|
| `search` | optional; trimmed; max 100 chars; no NUL; blank → no filter. Case-insensitive substring match on `item_name` OR `item_code`, parameterized `ILIKE $2 ESCAPE '\'`; `%`, `_` and `\` in the term are escaped so they match literally. |
| `active` | optional; exactly `true` or `false` |
| `limit` | optional; digits only, 1–500; **default 200** |
| anything else | 400 `VALIDATION_ERROR` (unknown key, repeated key → array, `limit=0/501/1.5/1e2/-1`, `active=TRUE/1/yes`) |

Ordering: `item_name`, then `item_code` (codes are globally unique, so the order is total within a name).

### Cap signalling

The repository fetches `limit + 1` rows. If more than `limit` matched, the first `limit` are returned and the response carries `X-Result-Truncated: true`; otherwise the header is absent. The body is always a plain array, so the existing client keeps working. The frontend reaches `/api` same-origin through the Vite proxy and the backend has no CORS plugin, so no `Access-Control-Expose-Headers` is needed today; a future cross-origin deployment would have to expose this header.

Limits chosen (technical, not business): default 200 / max 500 keeps a single picker request small while covering a restaurant's item catalogue in one page today; a client that sees the header should narrow with `search`. No pagination cursor was added (not in scope).

## Files

| File | Change |
|---|---|
| `backend/src/inventory/domain/item.ts` | `itemListQuerySchema`, `ItemListQuery`, `ITEM_LIST_DEFAULT_LIMIT`/`ITEM_LIST_MAX_LIMIT`/`ITEM_SEARCH_MAX_LENGTH` |
| `backend/src/inventory/application/item-repository.ts` | port gains `list(query, auth)` → `{ items, truncated }` and `get(id, auth)` → `Item \| null` |
| `backend/src/inventory/application/item-service.ts` | `list` / `get`: role check first, then validation, then repository with the caller's `AuthContext`; `get` maps null → 404 `ITEM_NOT_FOUND` |
| `backend/src/inventory/persistence/pg-item-repository.ts` | branch-scoped `SELECT … WHERE im.branch_id = $1`, `escapeLikePattern`, `LIMIT limit+1` |
| `backend/src/inventory/api/item-routes.ts` | two GET routes; `X-Result-Truncated` header |
| `backend/tests/unit/item-api.test.ts` | +49 tests (401/403/spoof/blank context, query parsing accept/reject, header, 404/400, 500 without secrets, service bypass, list SQL `ORDER BY item_name, item_code` + branch filter on a mocked `Pool`) |
| `backend/tests/unit/*-api.test.ts` (10 files) | unused `ItemRepository` stand-ins gain `list`/`get: vi.fn()` (type-only; no behaviour change) |
| `backend/tests/integration/item-postgres.test.ts` | +6 real-PostgreSQL tests (branch isolation for list/get, search by name and code, literal `%`/`_`/`\`, active filter, ordering by name, limit + header). Same-name rows return in code order even without the tie-break (codes follow insertion order), so the `item_code` tie-break is proven by the unit SQL test, not here (review MINOR-1) |
| `backend/README.md` | API contract lines for the two GETs |

## Database

No migration. `item_master_branch_idx (branch_id)` already serves the branch filter. A `%term%` ILIKE cannot use a btree index; a trigram index would need the `pg_trgm` extension (a new DB dependency) and is not justified for a per-branch item catalogue of this size. Revisit if branch catalogues grow to tens of thousands of items. Runtime role already has `SELECT` on `item_master`/`uom_master` (used by edit); `scripts/runtime-grants.sql` unchanged.

## Not changed

No business rule, permission, migration, dependency, frontend file, or AI tool. `feat/ai-s01b-tool-usability` and `feat/ai-s03-transfer-tools` untouched. Actual test/review results: see [CURRENT-HANDOFF.md](CURRENT-HANDOFF.md).
