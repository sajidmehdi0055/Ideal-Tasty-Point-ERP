# ADR-0006: Item Code Uniqueness, Format, and S-01 Authorization Boundary

Date: 2026-09-17
Status: **APPROVED — owner-selected 2026-09-17**
Scope: Item Master (S-01). Resolves O-01 (item code uniqueness scope) and O-02 (item code format). Approves injected AuthContext pattern for S-01 authorization boundary.
Approval source: Explicit owner instruction on 2026-09-17 in the S-01 pre-implementation review.

## Approved decisions

### O-01 — Item code global uniqueness

Item codes are **globally unique across the entire ERP**. They are not branch-scoped.

Database constraint: `UNIQUE(item_code)` on the `item_master` table.

`branch_id` remains stored on each Item Master record for tenant/branch awareness and data scoping, but the `item_code` value itself is unique across all branches and all time.

**Rationale (owner-stated):** An item code must unambiguously identify one item anywhere in the ERP, regardless of which branch created it or uses it. Two branches must not hold records with the same item code.

### O-02 — Item code format and generation

Format: `ITM-` prefix followed by a zero-padded 6-digit sequential number.

Examples: `ITM-000001`, `ITM-000002`, `ITM-000003`

Generation rules (all approved):
- Generated automatically by the system at item creation time
- Users cannot manually supply, edit, or override `item_code`
- No code reuse — once issued, a code is permanently associated with that item (even if the item is archived)
- Uniqueness must be permanent — no sequence reset or recycling
- Sequence must be safe under concurrent item creation (race-condition-free)
- Must NOT derive the next code by counting rows (`COUNT(*)`) or finding maximum (`MAX(item_code)`) — both are unsafe under concurrency
- Design must remain compatible with future multi-branch operation

**Approved implementation approach (technical choice within approved stack):**
Use a PostgreSQL sequence (`CREATE SEQUENCE item_code_seq START 1`) and generate the formatted code server-side at INSERT time via `lpad(nextval('item_code_seq')::text, 6, '0')`. PostgreSQL sequences are atomic, gapless-under-normal-use, and safe under concurrent transactions. This approach requires no application-level locking and remains compatible with future branch expansion (the global sequence guarantees no branch collision).

### O-03 — S-01 Authorization boundary (injected AuthContext)

The approved approach for S-01 authorization enforcement is an **injected authorization context** (`AuthContext`), not a full JWT/session implementation.

Definition:
```
AuthContext = { userId: string; role: 'OWNER' | 'MANAGER' | string; branchId: string }
```

- S-01 API middleware reads an `AuthContext` from a well-defined interface
- In the S-01 slice, the context is provided by a minimal middleware that reads from a request header (e.g., for tests: `X-Auth-Context`) or a test injection mechanism
- The `AuthContext` interface is the stable contract — real JWT middleware will be plugged in when the auth/session slice is implemented, without changing S-01 domain code
- This satisfies "Authorization enforced at API level" (ADR-0005) without implementing or locking the future auth/session architecture
- No shared secret, no real token issuance, no session store in S-01

**What this does NOT do:**
- Does not implement login, logout, or token issuance (future auth slice)
- Does not implement session/device tracking (future auth slice)
- Does not implement refresh tokens, 2FA, or lockout (future auth slice)
- Does not constrain the future JWT library or session store choice

## Consequences and limits

This ADR resolves all known pre-coding blockers for S-01. It does NOT decide:
- The exact sequence behavior on rollback (PostgreSQL sequences may leave gaps on transaction rollback — this is acceptable and does not violate uniqueness; gaps are not code reuse)
- Item code for sequences beyond 999,999 (6 digits) — expand the padding if needed; the format is extensible
- Item code display/search in the UI (frontend slice)
- Whether item code is exposed in the API response as-is or with additional formatting (technical choice)

## Relation to approved acceptance criteria

| AC | Impact |
|---|---|
| AC-01 | `item_code` is system-generated, verified in test assertion; user cannot supply it |
| AC-01 | `branch_id` on record does NOT scope item_code uniqueness |
| AC-11 | `AuthContext` role is recorded in audit trail as `actor_role` |
| AC-12 | `AuthContext` role checked at API middleware level; 403 for unlisted roles |

## Validation

Consistent with: ADR-0002 (system-generated Item ID/Code), ADR-0003 (Item ID/Code is mandatory), ADR-0004 (TypeScript + PostgreSQL), ADR-0005 (API-level authorization enforcement, specific JWT library deferred). No business rule invented. No row-count or MAX-based sequence used.

