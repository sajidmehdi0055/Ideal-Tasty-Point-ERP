# ADR-0004: Technical Architecture — Approved Decision

Date: 2026-09-17
Status: **APPROVED — owner-selected 2026-09-17**
Scope: Full ERP application architecture. Affects all modules: Inventory, Purchasing, Production, POS/KDS, Accounts, HR, Delivery.
Sources: inventory-module.md v0.2, ADR-0001/0002/0003, AGENTS.md, inventory-module-boundary.md, inventory-implementation-plan.md.
Supersedes: earlier PROPOSAL status of this same document.
Approval source: Explicit owner instruction on 2026-09-17 selecting Option B with specific approved variants for each sub-decision.

## Approved Architecture: Option B — Balanced Modular Stack

All seven architecture sub-decisions are now approved and closed.

### Approved Stack

| Layer | Approved choice | Notes |
|---|---|---|
| **Frontend** | React (Vite) + Tailwind CSS + PWA | Service worker + IndexedDB; installable on tablets and desktops |
| **Backend** | Node.js + Fastify (TypeScript) | Separate backend service; OpenAPI generation; plugin-based |
| **Database** | PostgreSQL (primary) + Redis (sessions/cache/pub-sub) | Proven integrity; Redis for real-time and session speed |
| **Auth** | Custom JWT with refresh tokens + RBAC | Stateless; works across branches/devices; offline permission caching |
| **API style** | REST with OpenAPI spec + WebSocket (Socket.io) | Documentation, testing, real-time POS/KDS |
| **Language** | TypeScript throughout (frontend + backend) | One language; shared validation schemas |
| **Deployment** | Hybrid — Docker Compose (dev/staging) + cloud/local production | Reproducible; portable; branch-scalable |

### Approved Sub-Decisions (all closed)

| # | Decision | Approved answer |
|---|---|---|
| 1 | Architecture option | **Option B — Balanced Modular Stack** |
| 2 | Database engine | **PostgreSQL** |
| 3 | Deployment model | **Hybrid** — Docker Compose for dev/staging; cloud VPS or on-premise for production |
| 4 | Offline/internet strategy | **Critical operations local-first with automatic sync on reconnect.** Full ERP offline NOT required. High-risk admin actions blocked offline unless explicitly approved offline-safe workflow exists. |
| 5 | Backend language | **TypeScript** |
| 6 | Client strategy | **PWA first.** Native mobile apps may be introduced later where genuinely required. |
| 7 | Multi-branch data model | **Shared PostgreSQL database with branch_id / tenant-aware separation** |

## Context (preserved from proposal)

Ideal Tasty Point needs a connected restaurant ERP built module-by-module, starting with Inventory & Store (S-01: Item Master). The architecture must serve:

- **Current operations**: one branch, two stores, two kitchens (upper/lower), 21 freezers, five POS counters, Store Keeper, kitchen heads, supply staff, three owners
- **Future growth**: additional branches, central versus independent purchasing
- **Environment**: Windows 11 development, hybrid deployment; Pakistani internet reliability varies
- **Users**: restaurant staff preferring Urdu, simple daily operations (INV-05), Owner/Manager/Store Keeper roles
- **Real-time needs**: POS order flow, KDS kitchen display, rider dispatch
- **Data integrity**: audit trail mandatory (ADR-0001), no hard-delete of historical records, controlled merge
- **Development**: AI-agent-assisted multi-agent workflow, module isolation, independent review

## Consequences and limits

This approves the technology selection for the ERP. It does NOT approve:
- Application coding (requires slice-by-slice authorization per inventory-implementation-plan.md)
- Specific ORM, query builder, or database migration tool (implementation choice within approved stack)
- Specific UI component library beyond React + Tailwind (implementation choice)
- Test framework specifics (Vitest/Playwright recommended but not mandated here)
- Hosting provider, server specifications, or SSL/domain configuration
- Any business rules, permissions, thresholds, or workflows — those come from approved requirements only
- File/folder structure (technical design within approved architecture)

Identity and security baseline is recorded separately in ADR-0005 and docs/architecture/identity-security-baseline.md.

## Windows 11 installation requirements (authorized to install when coding begins)

These may be installed ONLY after explicit per-slice coding authorization:

| Software | Purpose | License |
|---|---|---|
| Node.js LTS (v20+) | TypeScript/JS runtime | Free (MIT) |
| Docker Desktop | Containers for PostgreSQL, Redis, app services | Free (small business) |
| Git | Already installed | Free (GPL) |
| Visual Studio Code | Editor + AI/TypeScript extensions | Free (MIT) |
| PostgreSQL (via Docker) | Primary database | Free (PostgreSQL License) |
| Redis (via Docker) | Session cache + real-time pub/sub | Free (BSD) |

## Deferred until implementation authorization

- CI/CD pipeline (GitHub Actions)
- Production SSL certificates and domain
- Monitoring/logging stack
- Email/SMS notification service
- Payment gateway integration
- Candela/Mahir import tooling (needs D-10 approval)
- Native mobile app tooling (if required later)
- Load testing tools
- Backup automation scripts

## Option comparison (preserved for reference)

Options A and C were presented and reviewed. Option B was selected by the owner. See git history for the original proposal text.

## Validation

Requirements consistency: approved offline strategy aligns with INV-05 (simple operations) and POS/KDS real-time needs. Branch_id separation supports confirmed future branch growth. TypeScript stack is compatible with AI-agent multi-agent workflow. Independent architecture review required before dependent implementation begins.
