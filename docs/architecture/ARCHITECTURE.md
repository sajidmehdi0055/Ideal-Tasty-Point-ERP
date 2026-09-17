# Architecture Record

Status: **Approved technology stack** (ADR-0004, 2026-09-17). Detailed component design pending per-slice implementation authorization.

This file records approved architecture decisions and organizes future detailed design. It does not authorize application coding — each slice requires separate explicit authorization. Business authority comes from explicit user instructions, approved requirements, and recorded decisions.

## Approved technology stack (ADR-0004)

| Layer | Approved choice |
|---|---|
| Frontend | React (Vite) + Tailwind CSS + PWA (service worker + IndexedDB) |
| Backend | Node.js + Fastify (TypeScript) |
| Primary database | PostgreSQL |
| Session/cache/pub-sub | Redis |
| API style | REST + OpenAPI spec + WebSocket (Socket.io) |
| Language | TypeScript throughout (frontend + backend) |
| Deployment | Hybrid — Docker Compose (dev/staging) + cloud/local production |
| Multi-branch | Shared PostgreSQL database with branch_id / tenant-aware separation |
| Offline strategy | Critical operations local-first; automatic sync on reconnect; full offline NOT required |
| Client strategy | PWA first; native mobile apps may be introduced later where required |

See docs/decisions/ADR-0004-technical-architecture-proposal.md for full decision record.

## Approved identity and security baseline (ADR-0005)

JWT with refresh tokens; RBAC + per-user overrides; branch-scoped access; least-privilege; API-level enforcement; separate staff/customer identity scopes; audit trail; security log separation; no plaintext secrets; offline permission cache for operational actions only; high-risk actions blocked offline.

See docs/architecture/identity-security-baseline.md and docs/decisions/ADR-0005-identity-security-baseline.md.

## This file organizes future architecture decisions

## Required sections for a future architecture proposal

- Scope and requirement IDs; business constraints and exclusions.
- Proposed components and responsibilities, with rationale and alternatives.
- Module boundaries and approved contracts, linked to MODULE-BOUNDARIES.md.
- Data ownership, transaction consistency, history preservation, and correction mechanisms.
- Security, access, secrets, error handling, and auditability.
- Integration, compatibility, migration, recovery, and operational considerations.
- Tests, integration/regression strategy, risks, and unresolved decisions.
- Decision references, reviewer, approval evidence, and effective date.

All actual content is pending approved architecture. Agents must not convert discussion examples into architectural commitments. Missing ownership or interface decisions block dependent implementation and must be escalated to the Manager.

See ../engineering/AI-CODING-GUARDRAILS.md and ../decisions/README.md.
