# Current Handoff — ARCH-001 (Architecture + Security Approved)

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
