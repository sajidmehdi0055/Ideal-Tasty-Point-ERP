# AI-S01 — AI Foundation: implementation traceability

Branch: `feat/ai-s01-foundation` (from main `a6660e5`). Decision: [ADR-0011](../decisions/ADR-0011-ai-s01-foundation.md). Architecture guide: [AI_ARCHITECTURE.md](../architecture/AI_ARCHITECTURE.md).

## Owner decisions

- AI-O-01 Phase 1 read-only (write approval = contract/interface only; PO-draft write tool → AI-S02).
- AI-O-02 Cloud providers built but OFF by default (`AI_CLOUD_ENABLED=false`).

## Files

- New: `backend/src/ai/` — `config.ts`, `types.ts`, `providers/{http,openai-compatible,anthropic,factory}.ts`, `tools/{tool,inventory-tools}.ts`, `gateway.ts`, `routes.ts`, `module.ts`, `audit.ts`, `rate-limit.ts`, `system-prompt.ts`, `knowledge.ts`.
- New migration: `backend/migrations/202609270003_ai_s01_audit_log.sql` (additive; down migration refuses).
- Changed: `backend/src/app.ts` (services built once and shared with AI tools; optional `ai` option; AI routes), `backend/src/server.ts` (loads AI config, Pg audit sink), `backend/src/auth/context.ts` (additive `requireAuthenticated`), `backend/scripts/runtime-grants.sql` (INSERT on `ai_audit_log`), `backend/.env.example` (placeholders only).
- Tests: `tests/helpers/ai-fakes.ts`; unit `ai-config`, `ai-providers`, `ai-gateway`, `ai-api`, `ai-inventory-tools`; integration `ai-postgres`; migration-list assertions in `item-postgres` and `uom-brand-pack-postgres` extended by the new migration.
- Docs: ADR-0011, AI_ARCHITECTURE.md, this file, backend/README.md, root README.md, CURRENT-HANDOFF.md.

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

typecheck PASS, lint PASS, build PASS, unit 458/458, integration 100/100 (baseline before AI-S01: 401/96).

## Deferred

Write tools + approval storage (AI-S02), frontend AI Assistant screen (Figma proposal first), persisted conversations, complexity-based cloud routing, shared rate limiter for multi-process deployment, RAG tools, tools for modules that do not exist yet.
