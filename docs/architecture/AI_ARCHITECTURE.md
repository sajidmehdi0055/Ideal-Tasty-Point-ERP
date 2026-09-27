# AI Architecture (AI-S01)

Decision record: [ADR-0011](../decisions/ADR-0011-ai-s01-foundation.md). Code: `backend/src/ai/`.

The AI layer is optional. With `AI_ENABLED=false` (the default), or if AI is misconfigured or its model server is down, every ERP endpoint behaves exactly as before. The AI endpoints then answer `503`.

## 1. Layers

```
Frontend (future AI Assistant screen)
   │  POST /api/ai/chat, GET /api/ai/status   (same AuthContextProvider as every route)
   ▼
ai/routes.ts ── body validation (zod), 401/503
   ▼
ai/gateway.ts (AiGateway) ── rate limit, system prompt, tool loop, limits, audit (fail-closed)
   ├── AiProvider (primary, optional fallback)   ai/providers/*
   │      ├── openai-compatible  → local model server (Ollama / LM Studio / llama.cpp / vLLM) or OpenAI
   │      └── anthropic          → Claude (Messages API)
   └── AiToolRegistry                             ai/tools/*
          └── inventory tools → existing services (StockService, PurchaseOrderService, …)
                                  → existing repositories → PostgreSQL (branch-scoped)
```

The model never gets SQL, shell, file or network access. It can only ask for a registered tool by name; the backend decides whether to run it.

## 2. Providers

- Interface `AiProvider` (`ai/types.ts`): `chat(request)` (one model turn; with no tools it is plain generate/chat), `healthCheck()`, `name`, `model`.
- Adapters use Node's built-in `fetch` (no SDK dependency). Errors are mapped to stable codes (`PROVIDER_UNAVAILABLE`, `PROVIDER_TIMEOUT`, `PROVIDER_RATE_LIMITED`, `PROVIDER_AUTH_FAILED`, `PROVIDER_BAD_REQUEST`, `PROVIDER_BAD_RESPONSE`); provider bodies and keys are never returned or logged.
- Fallback: used for a model call whose primary attempt fails with a retryable error (unavailable, timeout, 429, malformed reply), in any round of the request. Once used, the rest of that request stays on the fallback. Auth failures and bad requests are not retried.
- A reply cut off by the token limit (`finish_reason: length` / `stop_reason: max_tokens`) that contains tool calls is rejected, never executed.
- Cloud gate: `openai` and `anthropic` are cloud providers. Using one (as primary or fallback) without `AI_CLOUD_ENABLED=true` makes the AI state `MISCONFIGURED` (owner decision AI-O-02). With cloud disabled, `AI_LOCAL_BASE_URL` must also point to this computer or the LAN (loopback, 10.x / 172.16–31.x / 192.168.x, link-local, IPv6 ULA, `localhost`, a single-label name like `restaurant-pc`, or `*.local` / `*.lan`).

### Local small model

Any server that exposes the OpenAI Chat Completions API with tool calling works. Example with Ollama on the restaurant PC/server:

```
AI_ENABLED=true
AI_PRIMARY_PROVIDER=local
AI_LOCAL_BASE_URL=http://127.0.0.1:11434/v1
AI_LOCAL_MODEL=<a tool-calling instruct model you have pulled>
```

The model name is configuration only. Choose an instruct model that supports tool/function calling; small models (roughly 3–8B) are enough because the ERP does all calculations. Check with `GET /api/ai/status?check=true`.

### Cloud (optional)

```
AI_CLOUD_ENABLED=true
AI_FALLBACK_PROVIDER=anthropic          # or openai, or make it the primary
AI_ANTHROPIC_API_KEY=...                # only in the local .env, never in Git
AI_ANTHROPIC_MODEL=...
```

Keys live only on the backend. The frontend never calls a provider directly.

## 3. Tools

Each tool (`ai/tools/tool.ts`) has: unique `name`, `description`, strict zod `input` schema (sent to the model as JSON Schema), `mode` (`READ`/`WRITE`), `authorize(auth)` (reuses an existing ERP guard) and `execute` (READ) or `propose` (WRITE).

Phase 1 tools (`ai/tools/inventory-tools.ts`, all READ, Owner/Manager, branch-scoped by the existing services):

| Tool | Existing service call |
|---|---|
| `inventory_list_stock_locations` | `StockLocationService.list` |
| `inventory_get_stock_balances` | `StockService.listBalances` (+ optional name/code filter) |
| `inventory_get_stock_movements` | `StockService.listMovements` |
| `inventory_list_suppliers` | `SupplierService.list` (+ optional name filter) |
| `inventory_list_pack_variants` | `PackVariantService.list` |
| `inventory_compare_purchase_rates` | `PurchaseRecordService.rateComparison` |
| `inventory_get_purchase_history` | `PurchaseRecordService.list` |
| `inventory_list_purchase_orders` | `PurchaseOrderService.list` |
| `inventory_get_purchase_order` | `PurchaseOrderService.get` |
| `inventory_list_goods_receipts` | `GoodsReceiptService.list` |

The tool layer only filters and limits lists (default 50, max 200 rows, with `total_matching`/`truncated`). It never recalculates anything; NUMERIC values stay decimal strings.

Not available yet because the ERP has no such data or rule: low-stock alerts (no reorder level), days of stock / consumption rate (no issue/consumption movements), sales, POS, cash, wastage, HR, attendance.

### How to add a tool

1. Make sure the business logic exists in an application service (never put queries or calculations in the tool).
2. Add a `readTool({...})` entry (in the module's tools file) with a strict zod input, a clear description and `authorize` reusing that module's guard.
3. Pass the service into the tools factory in `app.ts`.
4. Add unit tests (authorization, validation, correct service call with the caller's `AuthContext`) and, if data is branch-owned, an integration test for branch isolation.

## 4. Permissions

- No second permission system. A tool is shown to the model only if `authorize(auth)` is true; every requested call is checked again on the server, and the service applies its own guard and branch filter with the caller's own `AuthContext`.
- A user with no permitted tool gets `403 AI_FORBIDDEN`. Identity and role come only from the trusted `AuthContextProvider`, never from the request body or the model.

## 5. READ / WRITE and approval

- READ tools run automatically after authorization and validation.
- WRITE tools are never executed by the gateway. They are hidden unless `AI_WRITE_ACTIONS_ENABLED=true`; then they only return a `proposed_action` and the response has `requires_approval: true`. The turn stops there.
- Phase 1 registers no WRITE tool. AI-S02 (planned): AI-proposed Purchase Order draft → preview in UI → user approves → the normal `PurchaseOrderService.create` runs with the approving user's `AuthContext` and all normal validation. That slice adds the approval storage/endpoint.

## 6. Response contract

```json
{
  "message": "…",
  "provider": "local",
  "model": "…",
  "tool_calls": [{ "name": "inventory_get_stock_balances", "mode": "READ", "status": "SUCCESS" }],
  "requires_approval": false,
  "proposed_action": null,
  "metadata": { "request_id": "…", "conversation_id": null, "prompt_version": "erp-ai-v1", "rounds": 2, "fallback_used": false, "limit_reached": false }
}
```

Request: `{ "message": "…", "conversation_id"?: uuid, "module"?: "inventory" | "purchasing" | "stock", "history"?: [{ "role": "user" | "assistant", "content": "…" }] }` (max 20 turns). Conversations are stateless: the client sends recent history.

`GET /api/ai/status` shows provider/model/flags only to users who may use the assistant (`available: true`); others get `{ enabled, state, available: false }`. `?check=true` makes a real model call, so it has the chat role gate and rate limit.

A client can put invented assistant turns into its own `history`; that only affects that user's own answer (tool/system roles are rejected, permissions and the system prompt cannot be changed).

Errors: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 AI_FORBIDDEN`, `429 AI_RATE_LIMITED`, `503 AI_DISABLED` / `AI_UNAVAILABLE` / `AI_PROVIDER_UNAVAILABLE`, `500 AI_AUDIT_FAILED`.

## 7. Audit

Table `ai_audit_log` (migration `202609270003_ai_s01_audit_log.sql`): one `CHAT` row per request (also for requests refused with 403 `DENIED` / 429 `RATE_LIMITED`) and one `TOOL_CALL` row per acknowledged tool call (also denied, invalid, unknown and over-limit `TOOL_CALL_LIMIT` ones; more than 32 calls in one model turn are dropped and counted in `details.dropped_tool_calls`) with actor, role, branch, request/conversation id, provider, model, prompt version, tool name/mode, sanitized parameters (control characters such as NUL removed), permission result, approval status, outcome, error code, duration. Message text and model answers are not stored.

Rows are append-only (triggers block UPDATE/DELETE/TRUNCATE for everyone); the runtime role has INSERT only. Review with an owner/admin connection, e.g.:

```sql
SELECT occurred_at, actor_id, event_type, tool_name, outcome, provider, model
FROM ai_audit_log WHERE branch_id = 'main' ORDER BY occurred_at DESC LIMIT 100;
```

If an audit row cannot be written the AI request fails (`AI_AUDIT_FAILED`).

## 8. Safety limits

Provider timeout per model call (`AI_REQUEST_TIMEOUT_MS`), model calls per request (`AI_MAX_TOOL_ROUNDS`, default 4, counting the final answer — so at most 3 tool rounds), 8 executed tool calls per round, 12 000 characters per tool result, per-user rate limit (`AI_RATE_LIMIT_PER_MINUTE`, in-memory per API process), message ≤ 4 000 chars, history ≤ 20 turns / 32 000 chars. Tool results are wrapped with a note that they are data, not instructions. There is no single overall deadline: worst case is `AI_MAX_TOOL_ROUNDS` model calls (+1 fallback attempt) each up to `AI_REQUEST_TIMEOUT_MS`; lower the timeout for a snappier UI.

## 9. System prompt

`backend/src/ai/system-prompt.ts`, version `SYSTEM_PROMPT_VERSION` (`erp-ai-v1`, recorded in every audit row). Change the text only together with a new version.

## 10. Knowledge / RAG (later)

`ai/knowledge.ts` defines `KnowledgeProvider` (no-op default). When SOPs, recipes and policies are available, a permission-checked READ tool will use it; the gateway does not change.

## 11. Enable / disable

- Disable: `AI_ENABLED=false` (default) and restart. Nothing else is affected.
- Enable: set the variables in section 2, apply the migration and re-run `scripts/runtime-grants.sql` (normal upgrade order: stop API → `npm run migrate` → re-run grants → start).
- Flags: `AI_TOOL_CALLING_ENABLED` (off = chat without ERP data), `AI_WRITE_ACTIONS_ENABLED` (keep false in Phase 1), `AI_CLOUD_ENABLED`.

## 12. How to add a provider

Implement `AiProvider` in `ai/providers/<name>.ts` using `postJson` (timeout + error mapping), add the name to `AI_PROVIDER_NAMES` and its settings in `config.ts` (mark it in `CLOUD_PROVIDERS` if it leaves the premises), map it in `providers/factory.ts`, and add unit tests with the fake `fetch`.
