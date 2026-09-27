# AI-S01 — AI Foundation: implementation traceability

Branch: `feat/ai-s01-foundation` (from main `a6660e5`; main `ec7833d` with S-07 merged into the branch in AI-S01-SYNC-001: ADR renumbered 0011 → 0012, migration renamed to `202609270004_ai_s01_audit_log`, shared files `app.ts`/`server.ts`/`runtime-grants.sql`/tests/READMEs/handoff reconciled). Decision: [ADR-0012](../decisions/ADR-0012-ai-s01-foundation.md). Architecture guide: [AI_ARCHITECTURE.md](../architecture/AI_ARCHITECTURE.md).

## Owner decisions

- AI-O-01 Phase 1 read-only (write approval = contract/interface only; PO-draft write tool → AI-S02).
- AI-O-02 Cloud providers built but OFF by default (`AI_CLOUD_ENABLED=false`).

## Files

- New: `backend/src/ai/` — `config.ts`, `types.ts`, `providers/{http,openai-compatible,anthropic,factory}.ts`, `tools/{tool,inventory-tools}.ts`, `gateway.ts`, `routes.ts`, `module.ts`, `audit.ts`, `rate-limit.ts`, `system-prompt.ts`, `knowledge.ts`.
- New migration: `backend/migrations/202609270004_ai_s01_audit_log.sql` (additive; down migration refuses).
- Changed: `backend/src/app.ts` (services built once and shared with AI tools; optional `ai` option; AI routes), `backend/src/server.ts` (loads AI config, Pg audit sink), `backend/src/auth/context.ts` (additive `requireAuthenticated`), `backend/scripts/runtime-grants.sql` (INSERT on `ai_audit_log`), `backend/.env.example` (placeholders only).
- Tests: `tests/helpers/ai-fakes.ts`; unit `ai-config`, `ai-providers`, `ai-gateway`, `ai-api`, `ai-inventory-tools`; integration `ai-postgres`; migration-list assertions in `item-postgres` and `uom-brand-pack-postgres` extended by the new migration.
- Docs: ADR-0012, AI_ARCHITECTURE.md, this file, backend/README.md, root README.md, CURRENT-HANDOFF.md.

## Requirement → evidence

| Requirement | Evidence |
|---|---|
| ERP works when AI disabled/misconfigured/offline | `ai-api.test.ts` "ERP keeps working without AI", provider outage test; `loadAiConfig` never throws |
| Provider replaceable by configuration | `ai-api.test.ts` "provider replaced by configuration only"; `ai-providers.test.ts` factory |
| Local model first; cloud gated | `ai-config.test.ts` |
| No secrets exposed | status/outage/cloud tests assert keys, URLs and provider bodies absent |
| Server-side permission on every tool call | `ai-gateway.test.ts` hidden + denied tools, 403 for roles without tools; `ai-inventory-tools.test.ts` service guard still enforced |
| Branch isolation through existing services | `ai-postgres.test.ts` branch A vs B |
| Tool parameter validation / unknown tools | `ai-gateway.test.ts`, `ai-inventory-tools.test.ts` |
| WRITE requires approval, never executed | `ai-gateway.test.ts` write disabled/enabled |
| Audit append-only, insert-only grant, fail-closed | `ai-postgres.test.ts`, `ai-gateway.test.ts` |
| No paid API in tests | all providers faked (`FakeProvider`, `fakeFetch`) |

## Verification (Cowork VM, Node 24.21.0, embedded PostgreSQL 17.10)

Initial (IMPL-001): typecheck/lint/build PASS, unit 458/458, integration 100/100 (baseline before AI-S01: 401/96).

After AI-S01-QA-001 corrections (FIX-001): typecheck/lint/build PASS, unit 481/481, integration 101/101.

## AI-S01-QA-001 (independent QA subagent) — findings and fixes

Verdict FAIL (0 BLOCKER, 1 MAJOR, 6 MINOR, 4 NOTE); all test claims reproduced (458/100).

| Finding | Fix |
|---|---|
| MAJOR-1 CURRENT-HANDOFF history deleted | AI-S01 section put on top; all earlier sections restored verbatim below |
| MINOR-2 fallback failure audited against primary | `FailedModelCall` carries the provider tried last; CHAT row shows fallback provider and `fallback_used: true` |
| MINOR-3 missing audit rows (over-limit calls, 403/429) | over-limit calls audited as `TOOL_CALL_LIMIT` and answered; >32 dropped and counted; 403 → `DENIED`, 429 → `RATE_LIMITED` CHAT rows (outcome added to CHECK) |
| MINOR-4 NUL in model text → 500 | `cleanAuditText` strips control characters from tool names/param keys/values; PG integration test |
| MINOR-5 `status?check=true` ungated | same role gate + rate limit as chat; provider details hidden from users without AI access |
| MINOR-6 cloud gate by name only | `isOnPremisesUrl` guard on `AI_LOCAL_BASE_URL` when cloud disabled |
| MINOR-7 whitespace-only history | history content trimmed, `min(1)` |
| NOTE-8 | unique generated tool-call ids; Anthropic `is_error` on failed tool results; truncated (token-limit) tool calls rejected; no overall deadline documented |
| NOTE-9 | docs: `AI_MAX_TOOL_ROUNDS` counts model calls; fallback wording in D-03 |
| NOTE-10 | tests added for fallback-failure audit, fail-closed on provider-error path, status gating, refused-request audit |
| NOTE-11 | forged assistant turns in client history documented as own-session only |

AI-S01-QA-002 (focused re-review of the fixes): all findings FIXED except MINOR-4 PARTIAL → new N-1 (lone UTF-16 surrogates break jsonb audit insert); verdict PASS. N-1 fixed in FIX-002 (`cleanAuditText` replaces lone surrogates with U+FFFD after length capping; unit + PG tests); N-3 doc wording fixed; N-2 noted (migration edited while unmerged and never applied to a persistent DB — if any kept test schema applied the earlier version, recreate it).

## After sync with main ec7833d (AI-S01-SYNC-001)

typecheck/lint/build PASS, unit 520/520, integration 112/112.

## Deferred

Write tools + approval storage (AI-S02), frontend AI Assistant screen (Figma proposal first), persisted conversations, complexity-based cloud routing, shared rate limiter for multi-process deployment, RAG tools, stock-transfer AI tools (S-07 landed after AI-S01 was scoped), tools for modules that do not exist yet.
