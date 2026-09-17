# Current Handoff — S-01-IMPL-001 (Inventory S-01 Backend Implementation Verified)

Date: 2026-09-18. Branch: feat/inv-s01-item-master. Base: 663662e.
Authority: current explicit S-01 implementation instruction; ADR-0001..0006; INV-11/12; approved AC-01/02/11 and applicable PC-09 (see docs/engineering/inventory-s01-implementation.md for full traceability).
Roles: Claude Code = primary implementation agent (this record). Codex = next independent reviewer (not yet run). Google Antigravity = third-priority fallback/review; was the original implementer of the backend/ source under review here and is stopped/not modifying the repository during this record.

## Scope of this record

Covers: (1) correcting a `backend/package.json` manifest inconsistency discovered during independent review (drifted to a stale/foreign version mismatching `package-lock.json`, installed `node_modules`, `backend/README.md`, and the implemented source — see git diff for the single-file fix), and (2) full technical verification of the pre-existing Inventory S-01 Item Master backend (`backend/`) against a real PostgreSQL instance. No business rule, requirement, or ADR was changed. No S-01 scope expansion. Files touched by Claude Code in this record: `backend/package.json` only (dependency/script correction). All other `backend/` source, tests, and migration were pre-existing and unmodified.

## Environment used for verification

- Docker Desktop 29.8.0 (WSL2 backend, Ubuntu WSL distro) newly installed on this Windows 11 workstation by the owner for this verification.
- `docker compose -f backend/compose.yaml up -d postgres` → container `ideal-tasty-point-s01-dev-postgres-1`, image `postgres:17` (actual server: PostgreSQL 17.11), bound to `127.0.0.1:5432` only, reported `healthy`.
- Database `erp_local` (created by compose) used for `DATABASE_URL`/`migrate:check`; database `erp_test` (created manually via `psql` inside the container, matching `.env.example`'s documented convention) used for `TEST_DATABASE_URL`. Both accessed via the `postgres` superuser for local, disposable, loopback-only verification — never a production or shared connection.
- No dedicated runtime role was provisioned for this record (not required for `migrate:check`/`test:integration`; `scripts/runtime-grants.sql` remains the documented path for actually running `npm run dev`, out of scope here).

## package.json correction

Before: `backend/package.json` contained an inconsistent, older dependency/script set (fastify ^4.28.1, zod ^3.23.8, pg-mem, @fastify/cors, split `@typescript-eslint/*` packages, missing `test:unit`/`test:integration`/`migrate:check` scripts) that matched neither `package-lock.json` nor the installed `node_modules` nor the implemented source (e.g. `src/inventory/domain/item.ts` uses `z.uuid()`, valid only in Zod v4).

After: `backend/package.json` restored to match `package-lock.json`'s root manifest exactly (dotenv ^17.4.2, fastify ^5.12.5, pg ^8.23.0, zod ^4.6.5; devDependencies @types/node ^22.20.3, @types/pg ^8.23.1, eslint ^10.10.0, node-pg-migrate ^9.0.0, tsx ^4.23.13, typescript ~5.9.3, typescript-eslint ^8.70.0, vitest ^5.0.1); scripts restored to `typecheck` (runs both `tsconfig.json` and `tsconfig.test.json`), `lint` (lints `src` and `tests`), `test:unit`, `test:integration`, `migrate`, `migrate:check` — all using `node --env-file-if-exists=.env node_modules/node-pg-migrate/bin/node-pg-migrate.js`, no shell-specific `$VAR` syntax, verified Windows/PowerShell-compatible. `npm ci --ignore-scripts` confirms package.json/package-lock.json/node_modules are in sync (exit 0, 0 vulnerabilities).

## Verification results (all executed, not assumed)

| Check | Command | Result |
|---|---|---|
| Dependency reconciliation | `npm ci --ignore-scripts` | PASS — 221 packages, 0 vulnerabilities |
| Typecheck | `npm run typecheck` | PASS — `tsc --noEmit` (src) and `tsc -p tsconfig.test.json` (tests) both clean |
| Lint | `npm run lint` | PASS — ESLint over `src` and `tests`, 0 issues |
| Unit tests | `npm run test:unit` | PASS — 82/82 tests (Fastify inject, mocked repository) |
| Migration dry-run | `DATABASE_URL=...erp_local npm run migrate:check` | PASS — real PostgreSQL 17.11, single migration `202609170001_inventory_s01` planned cleanly, dry-run only |
| Integration tests | `TEST_DATABASE_URL=...erp_test npm run test:integration` | PASS — 11/11 tests against real PostgreSQL 17.11 (no mock/pg-mem). Covers: migration idempotency, atomic create/edit with audit snapshots, 24-way concurrent cross-branch item_code uniqueness, row-locked concurrent edits preserving disjoint fields, cross-branch update denial, manual item_code/identity mutation rejection at the DB layer, mandatory-field/single-type DB constraints, audit UPDATE/DELETE/TRUNCATE rejection even from the schema-owner connection, restricted runtime-role privilege limits (sequence reset, trigger disable, truncate, delete all denied), transactional rollback on audit-insert failure without recycling the consumed code, and six-digit-boundary code growth |
| Build | `npm run build` | PASS — `tsc` clean |

No check was reported PASS without executing to completion. No PostgreSQL check was substituted with pg-mem or another in-memory emulator.

## S-01 acceptance-criteria coverage (evidence-backed)

AC-01 (mandatory fields, both roles), AC-02 (exactly one Primary Item Type) — unit + integration tests. O-01 (global item_code uniqueness independent of branch_id) — 24-way concurrent integration test. O-02 (ITM-###### sequence, no manual override, no COUNT/MAX) — migration trigger + integration tests (manual insert/edit rejection, six-digit growth). O-03 (injected AuthContext only, no client-controlled header) — unit tests (spoofed header rejection, service-level bypass attempts). INV-11/PC-09 (Owner/Manager only, other roles/blank context denied) — unit tests. AC-11 (immutable append-only audit, same-transaction atomicity, rollback on audit failure) — integration tests. branch_id awareness (update scoped by id+branch, cross-branch 404, audit branch match) — integration tests. Out of scope and not implemented, per ADR-0002: archive/deactivate, stock, transfers, purchasing, expiry/lots, production, POS/KDS, costing, reorder, Redis, full auth/session, customer/rider/waiter apps — confirmed absent from `backend/src`.

## Security/authorization review (source-level, by implementer; independent review still required)

Parameterized queries throughout `pg-item-repository.ts`/`item-audit.ts` (no string-built SQL) — no SQL injection surface found. `requireItemEditor` re-validates role/context on every request independent of transport; no header-derived trust path exists in `src/`. Row-level `FOR UPDATE` lock on edit prevents lost updates under concurrency (verified). Sequence-based code generation avoids COUNT/MAX races (verified under load). DB triggers enforce audit/identity immutability even against the schema-owner connection (verified), and runtime-role grants exclude destructive privileges (verified). Error handler logs only error name, never SQL/connection-string detail (verified by unit test asserting no secret leakage in 500 responses). This is the implementer's own review and does not substitute for Codex's independent pass.

## Remaining issues / blockers

None found in this verification pass. Outstanding, pre-existing, out-of-scope items unrelated to this record: the architecture/security-baseline "overall consistency FAIL" findings from ARCH-001 below remain unresolved and are not S-01 blockers (S-01's own identity/security requirements were already satisfied per ADR-0005 §"Relation to S-01"). No dedicated runtime DB role was created in this session (not required for the checks run); required before any real `npm run dev` usage.

## Next recommended action

Independent review by Codex, per the project's agent priority order. Do not merge to main. Do not stage/commit beyond the bounded S-01 file set until that review completes, unless the owner directs otherwise.

---

## Historical handoff records

### ARCH-001 — Architecture Proposal (prior state)

Date: 2026-09-17 (updated). Branch: docs/architecture-decision-proposal.
Base revision: 5ed0690 (Merge branch 'docs/inventory-implementation-readiness').
Candidate: five architecture/security documentation files including this handoff; nothing staged. This correction task changes only identity-security-baseline.md and CURRENT-HANDOFF.md.
State: previous independent documentation review FAIL. Three owner-authorized consistency issues corrected and independently re-reviewed: scoped corrections PASS in requirements, architecture and security. Overall baseline consistency FAIL in all three reviews due to remaining outside-scope findings. No implementation authorization.

## Task scope and identities

Owner provided explicit approved architecture decisions (Option B) and a complete identity/security baseline. Root Manager applied these decisions to the relevant documents. The prior review identified wording beyond approved business authority; this correction is limited to the three explicitly authorized findings. No technology installed. No application code written.

Allowed files created (this update):
- docs/decisions/ADR-0005-identity-security-baseline.md
- docs/architecture/identity-security-baseline.md

Allowed files modified (this update):
- docs/decisions/ADR-0004-technical-architecture-proposal.md — status changed from PROPOSAL to APPROVED; all 7 sub-decisions recorded
- docs/architecture/ARCHITECTURE.md — approved stack and security baseline sections added
- docs/engineering/CURRENT-HANDOFF.md — this evidence record

Exclusions: existing approved requirements (inventory-module.md), ADR-0001/0002/0003, root AGENTS.md, README, inventory readiness documents, application code, framework/runtime/database/dependencies. DB/data changes: none. Installs: none. Git staging/commit: not authorized yet.

## Approved decisions summary

### Architecture (ADR-0004 — APPROVED)
- Option B: React (Vite) + Tailwind + PWA / Fastify (Node.js/TypeScript) / PostgreSQL + Redis / REST + OpenAPI + WebSocket
- Deployment: Hybrid (Docker Compose dev/staging + cloud/local production)
- Offline: Critical operations local-first with auto-sync; full offline NOT required
- Multi-branch: Shared PostgreSQL with branch_id tenant separation
- Client: PWA first; native mobile later if genuinely required

### Identity/Security (ADR-0005 — APPROVED)
- Individual accounts; no shared logins; RBAC + per-user overrides
- Branch-scoped access; branch switch re-checks permissions
- JWT with refresh tokens; session/device tracking; lockout controls; optional 2FA for Owners/Admins
- API-level enforcement; least privilege; separation of duties
- Offline: permission cache for operational actions; high-risk actions blocked offline
- Audit trail for sensitive actions; security logs separate from app logs
- No plaintext secrets; separate staff and customer identity scopes

## S-01 blocker status

| Previous blocker | Status now |
|---|---|
| Approved technical architecture | ✅ CLOSED — ADR-0004 approved |
| Identity/security design | ADR-0005 policy approved; scoped corrections PASS; overall consistency FAIL due to remaining findings |
| B-09 permission matrix (S-01 portion) | ⚠️ Low risk — Owner/Manager create/edit settled via INV-11/ADR-0001/ADR-0005. Full matrix (B-09) needed before later slices. |

S-01 readiness is not asserted. Architecture selection remains approved; overall security/documentation consistency has unresolved findings outside this correction scope.

## Checks and risks

Protected files verified unchanged: inventory-module.md, ADR-0001/0002/0003, AGENTS.md, README. Whitespace check: PASS (pre-existing CRLF on ARCHITECTURE.md is not new). Previous independent review: FAIL (baseline_review). Three corrections applied by root Manager: immediate centralized session/token invalidation without expiry delay; action-specific separation of duties with Owner-only archive and OPEN stock-adjustment authority; conditional MAY re-authentication wording. Fresh independent reviews completed on the corrected candidate: requirements_review (requirements), architecture_review (architecture), baseline_review (security). Each returned scoped corrections PASS and overall consistency FAIL. Reviewers made no edits. Remaining findings are recorded below; they are outside the authorized corrections.

Application tests/lint/type checks: NOT APPLICABLE — documentation only; agreed by all three independent reviewers. Local git diff --check passed; tracked requirements and ADR-0001/0002/0003, AGENTS.md and README.md have empty diffs; staging remains empty. This task wrote only identity-security-baseline.md and this handoff; untracked ADRs are not covered by tracked diff evidence. DB/data changes: none. Dependencies: none.

Risks:
- Lockout thresholds, password policy, 2FA method, and permission matrix (B-09) remain open operational/configuration decisions before affected implementation
- Hybrid deployment specifics (provider, server specs, SSL) deferred to implementation
- Customer identity implementation is future scope

## Remaining review findings — outside this correction scope

- Identity baseline RBAC role union and per-user grant/deny precedence are asserted without distinguishing approved policy from proposed design; non-overridable Owner-only and S-01 role restrictions must remain protected.
- Brand-override example assigns an approval workflow while INV-08/D-06 remain open. Admin session-termination authority and future waiter permissions also require traceability to approved authority.
- Waiter identity scope differs between the identity diagram, client table and ADR-0005 wording; do not resolve that scope by assumption.
- ADR-0004 describes auth as stateless without distinguishing token format from required centralized revocation/session enforcement.
- ARCHITECTURE.md still says all architecture content is pending despite the approved stack above.
- ADR-0005's S-01 readiness wording needs reconciliation with unresolved overall consistency findings; approval of the baseline is not evidence that every detailed design statement passed review.

Stock-adjustment approval/authority remains an OPEN BUSINESS DECISION (D-04/B-06/B-09). Broader brand and per-action permissions remain open for their affected capabilities. No new authority, approval workflow or technology was selected in this correction.

## Next recommended action

Fresh reviews completed; report scoped PASS and overall FAIL separately. Wait for owner direction on remaining outside-scope findings and approval before any subsequent staging/commit. Do not stage, commit, merge, push, install or start coding in this task.

Proposed commit message:

```
docs: approve architecture and security baseline (ADR-0004/0005)

- ADR-0004: Option B approved (React/Vite/Fastify/PostgreSQL/Redis/PWA/TypeScript)
- ADR-0005: Identity and security baseline approved
- identity-security-baseline.md: detailed security architecture document
- ARCHITECTURE.md: approved stack and security summary added
- CURRENT-HANDOFF.md: evidence record for architecture approval
```

---

## Historical handoff records

### ARCH-001 — Architecture Proposal (prior state)

Date: 2026-09-17. Branch: docs/architecture-decision-proposal.
State at prior step: ADR-0004 created as PROPOSAL; CURRENT-HANDOFF.md modified. Owner selected Option B.

### INV-READY-001 — Inventory Readiness (merged)

Branch: docs/inventory-implementation-readiness → merged at 5ed0690.
Commit 9bbadb4: readiness specification with B-01/B-02 closure. 8 files.

### WF-001 — Multi-Agent Workflow Documentation (merged)

Branch: docs/multi-agent-workflow → merged at 64f0af2.
Commit 5728edb: 4 workflow docs + AGENTS.md references.
