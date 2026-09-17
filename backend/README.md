# Inventory S-01 backend

Only Item Master create/edit is implemented. No UI, login/session system, Redis, stock operations, brand administration or cross-module APIs.

## Foundation

Node.js 24, strict TypeScript, Fastify, Zod, pg, dotenv; plain SQL migrations executed by node-pg-migrate; Vitest and Fastify inject; ESLint with TypeScript ESLint. Exact resolved versions are in package-lock.json. Dependencies were installed without lifecycle scripts. No ORM, CORS plugin or in-memory database emulator is needed. Node 24 already existed on the workstation.

Dependency rationale: Fastify is the approved HTTP server, Zod validates untrusted data, pg supplies PostgreSQL transactions, dotenv handles local configuration, node-pg-migrate tracks plain SQL changes. Vitest tests behavior and real PostgreSQL; ESLint/TypeScript check code; tsx supplies the development runner. No production frontend/session dependencies are introduced.

## Local development and migrations

Run commands from backend/. Use Node 24 and `npm ci --ignore-scripts`.

1. Supply a local `POSTGRES_PASSWORD`, then `docker compose up -d postgres`. Compose binds PostgreSQL only to loopback and contains no default password. Docker is optional if a compatible local PostgreSQL instance already exists; it is not installed automatically.
2. Provision an empty development database and a dedicated runtime login using your local PostgreSQL administrator. Keep administrator/migration credentials separate from API credentials. Do not use a superuser or table owner for the API.
3. Set `DATABASE_URL` to the migration-owner connection for `npm run migrate:check`, then `npm run migrate`. These commands default to up migrations only. Never apply to a production or existing business database without a separate migration approval.
4. As owner, grant the dedicated runtime login privileges with `psql ... -v runtime_role=YOUR_RUNTIME_ROLE -f scripts/runtime-grants.sql`. The login must not inherit elevated memberships, own schema/tables, or have sequence UPDATE privilege. The grant file does not create accounts or passwords.
5. Set API `DATABASE_URL` to the runtime login (see .env.example), then `npm run dev` or `npm run build` and `npm start`.

The standalone server binds to 127.0.0.1 and intentionally denies mutations with 401 until a trusted AuthContext provider is composed into `buildApp`. This is a backend slice, not a deployable public authentication system. Tests inject trusted contexts directly. There is no X-Auth-Context/header-to-role shortcut. A future trusted authentication adapter can provide current user/role/authorized branch without coupling domain logic to JWT or sessions.

## API contract

- `POST /api/inventory/items`: returns 201 and the persisted item after item and audit transaction commit.
- `PATCH /api/inventory/items/:id`: returns 200 and the updated item; at least one editable field required. ID is a system-generated UUID.

Create body (PATCH accepts a nonempty subset):

```json
{
  "item_name": "Example item",
  "primary_item_type": "RAW_MATERIAL",
  "base_uom": "kg",
  "brand": "Generic / No Brand"
}
```

Types: RAW_MATERIAL, WIP_SEMI_FINISHED, FINISHED_SELLING_PRODUCT, DIRECT_PURCHASE_SALE. Exactly one string value, never an array. Name/unit/brand must be nonblank text; units and brand are values, not new catalog-management workflows. Whitespace at edges is trimmed. Null, missing create fields and unknown properties are rejected. Code, ID, branch, timestamps and active state cannot be supplied or edited through this API.

Only OWNER or MANAGER in the trusted AuthContext may mutate. branch_id derives exclusively from its authorized branchId. Update selects by both ID and branch; an absent or different-branch item returns the same 404. Responses include item_code, branch_id, active=true on creation and timestamps. 400 indicates invalid input, 401 missing/invalid context, 403 other roles; 500 reports failure without exposing SQL/credentials. No audit-read permission or read/list endpoint is invented; create/edit responses return the stored result.

## Data and audit

`item_master`, `inventory_audit`, and global `item_code_seq` are the only domain objects. A trigger generates ITM-000001-style codes; padding grows beyond six digits without truncation. UNIQUE(item_code) is global; branch_id is separate. Sequence allocation is concurrent-safe and may leave gaps after rollback. There is no sequence reset/recycling tool. IDs/code/branch/creation time are immutable; no delete/archive endpoint.

Create and edit append actor, role, branch, action, before/after snapshots and timestamp in the same transaction. Edit locks the row before merging changed fields. Audit UPDATE/DELETE/TRUNCATE triggers reject mutation; runtime grants exclude destructive actions and sequence reset. Database superusers/owners remain an administrative trust boundary and must never be application credentials. This is application/database immutability, not external tamper-evident archival infrastructure.

The down migration intentionally fails instead of deleting history. Correct deployed schema/data using an independently reviewed forward migration. Test schemas/data are isolated and retained; no existing business data is reset.

## Verification

```text
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run build
```

Integration tests require TEST_DATABASE_URL for an isolated test PostgreSQL database with administrative schema/role creation rights. They create unique schemas and a restricted runtime role, never truncate/drop existing business objects. No mock counts as PostgreSQL verification; missing test database fails visibly. Supply TEST_DATABASE_URL as an environment variable (test scripts do not read .env automatically). See tests/integration for precise checks and CURRENT-HANDOFF for actual results. Do not use a production connection.
