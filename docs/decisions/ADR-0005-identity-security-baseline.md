# ADR-0005: Identity and Security Baseline

Date: 2026-09-17
Status: **APPROVED — owner-selected 2026-09-17**
Scope: All ERP modules, all clients (PWA, POS, Rider App, Waiter App, Web Admin, future apps).
Sources: Explicit owner instruction on 2026-09-17; AGENTS.md guardrails; ADR-0001/0004; inventory-module.md section 10.
Approval source: Explicit owner instruction on 2026-09-17 providing the complete identity/security baseline.

## Approved identity and security rules

These rules are binding for every module, slice, and client. No implementation may deviate without a new approved ADR.

### User identity

| Rule | Status |
|---|---|
| Every staff user has a separate individual account | APPROVED |
| Shared staff logins are not allowed | APPROVED |
| Internal staff identities and customer identities are logically separated | APPROVED |
| Rider, Waiter, Customer, Owner/Manager and future apps have different identity scopes | APPROVED |
| All scopes use the same central authorization model | APPROVED |
| The three Owners have equal Super Admin authority but separate individual identities | APPROVED |

### Access control

| Rule | Status |
|---|---|
| Role-based access control (RBAC) | APPROVED |
| Per-user permission overrides where required | APPROVED |
| Branch-scoped access; branch switching must re-check access permissions | APPROVED |
| Least-privilege access model | APPROVED |
| Authorization enforced at API/backend level, not only by hiding UI controls | APPROVED |
| Permission rules centrally enforced across POS, PWA, Web, Rider App, Waiter App and future clients | APPROVED |
| Inactive/left employees must have access revoked immediately | APPROVED |

### Session and device

| Rule | Status |
|---|---|
| Session/device tracking | APPROVED |
| Failed-login and lockout controls | APPROVED |
| Password reset/recovery process | APPROVED |
| Optional 2FA for Owners/Admins | APPROVED |
| Critical actions may require re-authentication or explicit confirmation | APPROVED |

### Offline and high-risk actions

| Rule | Status |
|---|---|
| Offline mode may cache permissions for necessary operational actions | APPROVED |
| High-risk administrative/security actions must NOT be allowed offline unless an explicitly approved offline-safe workflow exists | APPROVED |
| Where separation of duties is required, the same user must not automatically self-approve a sensitive action | APPROVED |

### Sensitive actions and audit

| Rule | Status |
|---|---|
| Sensitive actions use explicit approval workflows | APPROVED |
| Full audit trail for sensitive actions | APPROVED |
| Security logs retained separately from ordinary application logs where appropriate | APPROVED |

### Secret and credential handling

| Rule | Status |
|---|---|
| Secrets and passwords stored securely; no plaintext secrets anywhere | APPROVED |
| Complies with AGENTS.md guardrail 8: no secrets committed to git | APPROVED |

## Consequences and limits

This approves the identity and security policy baseline. It does NOT decide:

- The specific JWT library, session store implementation, or 2FA library (implementation choices within approved stack)
- Exact lockout thresholds (e.g., number of failed attempts, lockout duration) — these are operational configuration values requiring owner input at implementation time; no value is assumed
- Exact password complexity policy — requires owner input at implementation time; no policy is invented
- The exact audit log schema or retention duration — technical design within approved audit obligation; retention period requires owner decision if regulatory requirements apply
- Exact permission matrix for every role/action combination — this is B-09 in inventory-open-decisions.md, to be resolved before affected slices
- The 2FA implementation method (TOTP app, SMS OTP, email OTP) — requires owner preference at implementation time

## Relation to S-01

S-01 (Item Master) requires:
- Owner and Manager roles can create/edit items (INV-11, ADR-0001)
- No other role may create/edit items in S-01
- Authorization enforced at API level (this ADR)
- Audit trail for item master create/edit actions (ADR-0001, this ADR)
- Session-based access; offline item creation is NOT a permitted offline action unless explicitly approved

These S-01 identity requirements are now satisfied by this approved baseline. The remaining S-01 blocker is technical architecture setup (ADR-0004 now approved) — no business identity blocker remains for S-01.

## Validation

Consistent with: ADR-0001 (history/audit), ADR-0002 (S-01 scope), ADR-0003 (mandatory fields/type), ADR-0004 (JWT + RBAC + PWA offline). Consistent with AGENTS.md guardrail 8 (no secrets in git). Independent security review required before any identity/auth code is merged.

