# Identity and Security Architecture Baseline

Date: 2026-09-17. Status: APPROVED baseline; technical design details pending per-slice implementation planning.
Authority: ADR-0005 (owner-approved 2026-09-17), ADR-0004 (approved stack), ADR-0001 (audit obligations), AGENTS.md.
Scope: All ERP modules and all client surfaces.

## Approved identity model

```
Central Auth Service (backend)
│
├── Staff Identity Scope
│   ├── Owner (3 individuals, equal Super Admin, separate accounts)
│   ├── Manager
│   ├── Store Keeper
│   ├── Kitchen Head (Upper / Lower)
│   ├── Supply Staff
│   └── [Future staff roles]
│
├── Customer Identity Scope (logically separate)
│   └── [Future — POS/delivery customer accounts]
│
└── External App Scope (future)
    ├── Rider App identity
    ├── Waiter App identity
    └── [Other future scopes]
```

Staff and customer identities are **logically separated** — they share the same central auth infrastructure but have distinct identity spaces, credential stores, and permission models. No staff account can be used as a customer account or vice versa.

## Access control model

### Role-based access control (RBAC)

Every staff user is assigned one or more roles. Each role carries a set of permissions over resources and actions. Permissions are additive (union of all role permissions) unless an explicit per-user override denies a specific permission.

```
User → Roles[] → Permissions[] (additive)
              └── Per-user override (explicit grant or deny)
```

### Branch-scoped access

Every resource access is checked against the user's permitted branch(es). A user with access to Branch A cannot read or write Branch B data unless explicitly granted branch-level access. Branch switching at the client triggers a server-side re-authorization check — the cached token alone is not sufficient.

```
Request → JWT token → Branch claim → Server re-checks branch permission
```

### Least-privilege

Users receive only the minimum permissions required for their role. Temporary elevated access (e.g., a Store Keeper asking an Owner to override a brand) follows an explicit approval workflow, not a blanket role upgrade.

### Authorization enforcement level

Authorization is **always enforced at the API/backend level**. Hiding UI controls is a usability aid, not a security boundary. A request without valid authorization must be rejected at the API layer regardless of how it was constructed.

### Central permission enforcement

The same permission rules apply across all clients:
- PWA (web, installable)
- POS terminal
- Web Admin
- Rider App (future)
- Waiter App (future)
- Any future client

No client-specific permission bypass is permitted.

## Session and token model

### JWT with refresh tokens (approved per ADR-0004)

```
Login → Access Token (short-lived, e.g., 15 min) + Refresh Token (long-lived, stored securely)
      → Access Token used for API calls
      → Refresh Token used to get new Access Token without re-login
      → Refresh Token rotated on each use
      → Both tokens revoked on logout or access revocation
```

### Session/device tracking

The system tracks active sessions per user and per device/browser. Owners and Admins can view and terminate active sessions. Inactive/left employees must have access revoked immediately. A centralized revocation/session-control mechanism must immediately invalidate active sessions and access/refresh tokens, and backend/API authorization must enforce that invalidation without waiting for normal token or session expiry. An unexpired token is not sufficient to retain access after revocation. This requirement selects no additional implementation technology. Offline permission snapshots do not override this requirement; the detailed offline enforcement design must demonstrate consistency with immediate revocation before affected offline workflows are implemented, without assuming that a disconnected device has received a revocation update.

### Lockout and failed login

Failed login attempts are counted per user account. After a defined threshold (exact value to be configured — not invented here), the account is locked and the user must follow the approved recovery process. Lockout events are written to security logs.

### Password reset and recovery

A secure password reset/recovery process is required. The exact delivery mechanism (email OTP, admin-assisted reset) requires owner configuration preference at implementation time. No default mechanism is assumed.

### 2FA (optional for Owners/Admins)

Owners and Admins may enable two-factor authentication. The 2FA method (TOTP app, SMS OTP, or email OTP) requires owner preference before implementation. 2FA is optional but strongly recommended for Owner accounts given their Super Admin authority.

### Re-authentication for critical actions

Critical actions MAY require re-authentication or explicit confirmation. A mandatory challenge for a particular action requires a separate explicit approved decision; no blanket requirement or mandatory action list is established here.

## Offline permission model

The PWA caches a permission snapshot for operational actions that are explicitly permitted offline. The cache is:
- Scoped to the user's roles and branch permissions at the time of last sync
- Refreshed on every successful server connection
- Not expandable offline — a user cannot gain new permissions while offline
- Read-only for permission data — no offline permission escalation

**High-risk administrative and security actions are blocked offline** unless an explicit offline-safe workflow is approved for that specific action. No action is assumed offline-safe by default.

Examples of actions that must NOT be permitted offline without explicit approval:
- Archiving or merging product records
- Revoking another user's access
- Approving supplier payments
- Any action requiring separation-of-duties approval

## Separation of duties

Where separation of duties is required, the same user must not automatically self-approve. This is not a blanket initiator/approver separation rule for all sensitive actions. Apply action-specific requirements only when explicitly approved.

### Product Archive

Only an Owner may deactivate/archive a product (ADR-0001). This authority does not establish a second-person approval requirement. Preserve historical records and the approved prohibition on hard-deleting products with history.

### Stock Adjustment

OPEN BUSINESS DECISION: the exact approval/authority rule for stock adjustments remains unresolved (inventory-module.md D-04; inventory-open-decisions.md B-06/B-09). Do not assign an approver or impose initiator/approver separation by assumption. Resolve this before implementing the affected adjustment workflow.

Other approved action-specific authorities, including Owner approval of cost-changing recipe changes and supplier payments, remain as recorded in inventory-module.md section 9 and INV-19. These authority statements alone do not create a universal second-person rule. The remaining per-action role matrix is B-09, to be resolved before affected slices.

## Audit and security logging

### Sensitive action audit trail

Every sensitive action records:
- Actor (user ID + role at time of action)
- Timestamp
- Action type and resource
- Previous and new values (for corrections/modifications)
- Branch context
- Approval chain (where applicable)
- Source (client type: PWA, POS, Rider App, etc.)

Sensitive actions include at minimum: item master create/edit/archive, stock adjustments, permission changes, user account create/revoke, password resets, 2FA changes, merge operations.

### Security log separation

Security events (failed logins, lockouts, token revocations, permission denials, 2FA events) are retained in a separate security log from ordinary application logs. This allows security review without exposure of application operational data and vice versa. Access to security logs requires appropriate authorization.

### Secret handling

- All secrets, passwords, and tokens are stored using approved secure storage (hashed passwords using a strong adaptive algorithm such as bcrypt/argon2; secrets in environment variables or approved secret management, never in source code or git)
- AGENTS.md guardrail 8 applies: no secrets committed to git, ever
- Non-secret example values (e.g., `.env.example`) may be committed

## Client identity scopes

| Client | Identity scope | Notes |
|---|---|---|
| PWA (staff) | Staff scope | Primary interface for Owners, Managers, Store Keepers, Kitchen Heads |
| POS terminal | Staff scope (cashier role) | Branch-scoped; offline permission cache for transaction operations |
| Web Admin | Staff scope (Owner/Admin) | High-privilege actions; 2FA strongly recommended |
| Rider App | Rider scope (future) | Separate identity scope; limited permissions; no access to staff data |
| Waiter App | Staff scope (waiter role, future) | Branch-scoped; order-taking permissions only |
| Customer App | Customer scope (future) | Logically separate from staff; no staff permissions |

## What this document does NOT decide

- JWT library, session store library, or 2FA library choice (implementation decision within approved stack)
- Exact lockout threshold values (operational configuration — requires owner preference)
- Password complexity rules (operational configuration — requires owner preference)
- Exact audit log schema or retention duration (technical design; retention period may require regulatory review)
- Full role/action permission matrix (B-09 — open decision)
- 2FA delivery method (owner preference)
- Customer identity implementation details (future module)

## Consistency with approved decisions

| ADR | Alignment |
|---|---|
| ADR-0001 | Audit trail for all sensitive actions; history preserved |
| ADR-0002 | S-01 scope only: Owner/Manager create/edit items; API-level enforcement |
| ADR-0003 | Mandatory field validation enforced at API level, not only frontend |
| ADR-0004 | JWT + RBAC on Fastify backend; PWA offline permission cache; Redis for session speed |
| ADR-0005 | This document implements the approved baseline |

