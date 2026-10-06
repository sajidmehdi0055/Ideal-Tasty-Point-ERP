# ERP-REVIEW-FIX-20261003 — scope and technical decisions

Updated 2026-10-06. Status: Codex candidate (base 889a5e2) superseded for integration by ERP-REVIEW-FIX-002 on `fix/erp-review-fixes-002` (base main 86b417c) — see the last section. The sections below are kept as the original Codex record.
Authority: owner requested "yar tum kro aor report bna dena ma claude ko day don ga" following the six-issue remediation prompt, and "carry on" on 2026-10-05. Bounded fixes/report are authorized, superseding inspection-only and the Codex pause for this task. Staging, commit, merge, deployment and operational migrations are not authorized.

## Scope and ownership

- Receipt retry safety: ADR-0009 O-02/O-04/O-08 and ADR-0010; implementer receipt_fix owns receipt API/service/repository, additive migration/grants and tests.
- AI redirect protection: AI-O-02 / ADR-0012; implementer ai_readonly_review owns transport/types/provider tests.
- Purchase dates: ADR-0009 A-01; same implementer owns calendar validation/tests.
- Item reads/UI: INV-11 / ADR-0006; implementer ui_arch_review owns item route/service/repository/interface, frontend item screens and associated tests/fakes. Reuse bounded pre-existing work without modifying source worktree.
- Manager owns architecture/decision/README/handoff documentation and integration.
- Final reviewer must be a separate QA agent with no implementation involvement, actually running required checks.

Allowed files are the scoped subsystems/tests above and documentation. Excluded: real records/credentials, live AI settings, other working copies, supplier bill uniqueness, new business permissions, valuation/expiry/POS/production, dependencies, staging/commit/merge/deploy.

## Acceptance and technical decisions

1. A stable optional Idempotency-Key identifies receipt retries, scoped to authenticated branch + user. Store parsed request fingerprint and receipt mapping atomically with stock, purchase and audit effects. Identical concurrent retries return the original receipt; changed payload conflicts; failed attempts do not poison the key. Requests without a key preserve compatibility and remain separate operations. This does not identify duplicate supplier bills.
2. Reject AI HTTP redirects for all providers/health checks rather than forwarding ERP payload to an unchecked destination. Cloud fallback remains subject to configured authorization.
3. Standalone purchase dates use Asia/Karachi consistently with receiving. Reject year zero to align with PostgreSQL calendar support.
4. Item list/detail must use existing OWNER/MANAGER authorization and server-owned branch scope. Frontend refresh/direct edit fetch persisted records; expose actual network/server errors and retry. No auth bypass or cache presented as authoritative data.
5. Run typecheck/lint/build, backend unit + real PostgreSQL integration, frontend tests, and independent final review. Missing checks are BLOCKED, never PASS. Integration writes only to isolated schemas in erp_test.

## Authentication blocker

ADR-0005 leaves password policy, lockout thresholds/duration, 2FA method and full permissions for owner decisions. The owner was asked; no answers are assumed. Real login remains PENDING; current fail-closed auth stays. Do not describe all six issues or production readiness as complete.

## Worktree/base (original Codex record, superseded — see last section)

Branch codex/erp-review-fixes, isolated worktree, base 889a5e2. During interruption main advanced to 16980d3 (AI panel); no automatic merge/rebase or overwrite of newer work. Final report must state this integration limitation and inventory every changed/untracked file.
## Review capacity update (2026-10-05)

A fresh dedicated QA spawn was rejected with "agent thread limit reached". Per-area cross-review was performed by agents who did not implement the area reviewed; nobody approves their own changes. This is same-provider cross-review, not the strict dedicated task-wide QA requested by AGENTS.md. That completion gate remains BLOCKED and is handed to Claude; no automatic waiver is inferred.
## Integration onto current main (ERP-REVIEW-FIX-002, 2026-10-06)

Authority: owner prompt in the Cowork Manager session (2026-10-06): assess the Codex handoff, compare every finding with current main 86b417c, and adapt only confirmed, missing fixes on a new isolated branch; no staging/commit/push/merge/deploy; no `erp_local`, operational migration, real data or live AI setting touched. The Codex worktree and branch `codex/erp-review-fixes` were read only and are preserved unchanged.

| Finding | On main 86b417c? | Action on `fix/erp-review-fixes-002` |
|---|---|---|
| Receipt retry/idempotency | Missing | Adopted (Codex design unchanged): optional `Idempotency-Key`, additive migration `202610030001`, grants, tests. |
| AI HTTP redirect | Missing | Adopted `redirect: 'error'`; added a real loopback HTTP test (301/302/303/307/308, both providers). |
| Standalone purchase Karachi date + year 0000 | Missing (ADR-0009 A-01 note) | Adopted. |
| Item list/get **backend** | Already on main (INV-ITEM-LIST-001: search, active, limit, `X-Result-Truncated`) | **Not** adopted — Codex's unfiltered, unlimited list would regress the main contract. |
| Item **frontend** (session cache, edit needs router state) | Faulty on main | Adopted Codex's edit-page fetch-by-id; list rewritten for main's contract (backend search, truncation notice, no cache fallback); `session-cache.ts` removed. |
| Architecture/README reconciliation (ARCHITECTURE.md, MODULE-BOUNDARIES.md, root README) | — | Not adopted: outside this bounded fix scope and partly stale (written for base 889a5e2). Recorded as a possible separate docs task. |
| Real login (ADR-0005) | Pending owner decisions | Unchanged; still fail-closed. |

Evidence and review: [erp-review-fix-002-implementation.md](../engineering/erp-review-fix-002-implementation.md).
