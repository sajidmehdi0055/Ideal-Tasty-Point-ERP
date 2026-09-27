# Current Handoff — AI-S01-IMPL-001 (AI Foundation, on feature branch)

Date: 2026-09-27. Branch: `feat/ai-s01-foundation` (from main `a6660e5`). NOT merged. Main is unchanged at `a6660e5` (S-06 merged and pushed; the S06-MERGE-001 record is in main's history).
Authority: owner request in the Cowork Manager session to make the ERP AI-ready; owner decisions AI-O-01 (Phase 1 read-only + audit) and AI-O-02 (cloud providers built, OFF by default), recorded in ADR-0011.

## What was built

Optional AI layer, OFF by default: provider abstraction (OpenAI-compatible adapter for local model servers and OpenAI; Anthropic adapter; built-in fetch, no new dependency), AI gateway (tool loop, limits, per-user rate limit, versioned central system prompt), ten READ-only Inventory/Purchasing tools reusing existing services with the caller's AuthContext, WRITE-proposal contract (no write tool registered), append-only `ai_audit_log` (runtime INSERT only, immutability triggers, fail-closed), `GET /api/ai/status`, `POST /api/ai/chat`. Details: `docs/engineering/ai-s01-implementation.md`, `docs/architecture/AI_ARCHITECTURE.md`.

## Verification so far (implementer's own run — not independent)

Cowork VM, Node 24.21.0, embedded PostgreSQL 17.10: typecheck/lint/build PASS; unit 458/458; integration 100/100.

## Next steps

1. Independent QA/Testing subagent review (AI-S01-QA-001).
2. Owner: push the branch; Windows/Docker PostgreSQL 17 verification.
3. Owner-approved merge; post-merge verification.
4. Migration `202609270003_ai_s01_audit_log` is not applied to `erp_local`; when authorized: stop API → `npm run migrate` → re-run `scripts/runtime-grants.sql` → start.

## Carried forward (unchanged)

S-04/S-05/S-06 migrations not applied to `erp_local`; S06-QA-001 NOTEs 2–5; ADR-0010 A-01..A-07; no receiving/PO UI; no real login/session.
