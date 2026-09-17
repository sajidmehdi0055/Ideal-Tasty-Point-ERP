# Multi-Agent Operating Model

Authority: root AGENTS.md. This document is the single source of truth for how the Manager scales and names specialist agents, and for the project's external-tool priority order. It does not restate or relax the independence, handoff, review, branching, or completion rules already defined in AGENT-ROLES.md, TASK-HANDOFF-PROTOCOL.md, REVIEW-WORKFLOW.md, BRANCHING-AND-REVIEW.md, and DEFINITION-OF-DONE.md — those remain binding and are linked below rather than duplicated.

## Operating principle

The owner interacts only with the Manager Agent (AGENTS.md, top policy). The Manager decomposes owner requests into bounded task briefs (AI-CODING-GUARDRAILS.md) and assigns them to as many specialist agents as materially improve quality, speed, or independence — never more. Agent count is a means to an end, not a target.

## Dynamic agent scaling

The Manager classifies each task's size before assigning agents:

| Task size | Typical example | Agent count |
|---|---|---|
| Small | One-file fix, single clarification, routine doc update | 1–2 |
| Medium | One bounded module slice (e.g. one S-0x acceptance-criteria set) | 3–6 |
| Large | A full module or multi-slice feature | 7–10 |
| Complex | Cross-module integration, major architectural change | 10–15+, only when genuinely useful |

Do not create agents merely to raise the count. A small task run by two agents (implementer + independent reviewer) is normal and sufficient; scale up only when the work genuinely splits into independent, non-overlapping streams (see AGENT-ROLES.md, "Six roles do not require six concurrent agents").

## Specialist roles

AGENT-ROLES.md defines the six core roles (Manager/Lead, Architecture & Database, Backend, Frontend/UI, QA/Testing, Security & Code Review) and the independence/assignment rules that apply to every agent regardless of title — those rules govern here unchanged. The following additional role labels may be used when a task genuinely calls for that specific specialization; the Manager assigns only the roles a task needs and may combine duties only where independence is preserved:

| Role | When to use |
|---|---|
| Requirements Analyst | Consolidating or clarifying raw business input into traceable requirement text (not approving it) |
| Business Rules Analyst | Extracting/cataloguing existing confirmed rules from source discussion; never inventing rules |
| Solution Architect | Cross-module technical design spanning more than one module boundary |
| Database Architect | Schema/migration design beyond a single module's Architecture & Database duties |
| Backend Engineer | Module domain/service/API implementation (an instance of the Backend role) |
| API Engineer | REST/OpenAPI contract design or cross-module API surface work |
| Frontend Engineer | An instance of the Frontend/UI role for a specific screen/workflow |
| PWA Engineer | Service worker, offline caching, installability work |
| Offline/Sync Engineer | Local-first data and reconnect-sync logic (ADR-0004 offline strategy) |
| PostgreSQL Specialist | Sequence/concurrency/locking/constraint design beyond routine schema work |
| Docker/DevOps Engineer | Compose/container/local-environment setup and CI wiring |
| Security Engineer | Threat modeling and control design (distinct from the final Security & Code Review gate) |
| Authorization/RBAC Engineer | Permission model and enforcement-boundary implementation |
| Migration Engineer | Data/schema migration authoring and rollback-safety review |
| Unit Test Engineer | An instance of the QA/Testing role focused on unit-level coverage |
| Integration Test Engineer | An instance of the QA/Testing role focused on real-dependency (e.g. real PostgreSQL) integration coverage |
| QA Engineer | General instance of the QA/Testing role |
| Performance Engineer | Load/latency/throughput analysis when a task's acceptance criteria require it |
| Code Reviewer | An instance of the Security & Code Review role focused on correctness/quality |
| Security Reviewer | An instance of the Security & Code Review role focused on security findings |
| Documentation Agent | Requirements/ADR/handoff documentation upkeep |
| Git/Release Agent | Branch/worktree hygiene, commit/push coordination under Manager authorization |
| UI/UX Agent | Usability/workflow-simplicity review (e.g. AC-12-style checks) |
| Reporting/Analytics Agent | Read-only reporting/analytics feature work, once a module authorizes it |
| Data Migration Agent | One-time data import/backfill work, always under the destructive-operation approval rule |

## Parallel work and Git coordination

Parallel assignment is encouraged only where safe: non-overlapping file/module ownership and no shared write target. Multiple agents must not edit the same file or subsystem concurrently without explicit Manager coordination. Branch/worktree isolation, independent-reviewer assignment, and the no-force-push/no-history-rewrite/no-unauthorized-merge rules are defined in BRANCHING-AND-REVIEW.md and apply to every agent the Manager creates.

## Independent QA and review

A major coding task requires separate implementation, QA/testing, code review, and security review agents; the implementer is never the final approver of their own work (AGENT-ROLES.md, REVIEW-WORKFLOW.md, DEFINITION-OF-DONE.md). "The implementer reports it passes" is preliminary evidence only — the Manager requires actual executed test/review evidence before treating a check as PASSED, per TASK-HANDOFF-PROTOCOL.md.

## Escalation policy

The Manager resolves routine matters internally without asking the owner, including: routine code fixes, lint/formatting, normal dependency/package reconciliation, safe refactoring within approved scope, routine Git operations on feature branches, normal Docker/local test-environment setup, and minor technical implementation choices.

The Manager escalates to the owner only when a decision is materially important:

- New or changed business rules
- Scope changes beyond an approved task brief
- Security policy changes
- Architecture changes
- Destructive database/data actions
- Production deployment
- Merge to main
- Force push or history rewrite
- Branch deletion
- Data loss risk
- Financial/accounting behavior changes
- Permissions/authority changes
- Requirements ambiguity that materially affects delivered behavior

This aligns with, and does not relax, AGENTS.md guardrails 2, 7, and 13.

## Agent Execution Report

At the completion of a multi-agent task, the Manager gives the owner one consolidated Agent Execution Report covering: (1) Manager task summary, (2) agents used, (3) role of each agent, (4) work completed by each, (5) tests performed, (6) independent reviews performed, (7) conflicts/disagreements and how resolved, (8) files changed, (9) Git status, (10) remaining risks/issues, (11) final consolidated result, (12) recommended next step. This is the multi-agent-specific shape of the handoff fields already required by TASK-HANDOFF-PROTOCOL.md — it does not replace that protocol's per-agent handoff requirements, which still apply to each specialist's individual report to the Manager.

## External tool priority

For this project, in order:

1. **Claude Code** — primary manager-led implementation and multi-agent coordination platform.
2. **Codex** — second priority for independent review, architecture input, debugging, and backup implementation.
3. **Google Antigravity** — third priority for fallback implementation, review, or additional capacity.

This priority order governs which tool the Manager reaches for first; it never reduces reviewer independence. If Claude Code implements a change, the independent reviewer must be a genuinely separate agent or tool (e.g. Codex, or a fresh Claude Code subagent with no prior context of the implementation) — never the same implementing session or an agent that merely carries a different role label. The independence rule in AGENT-ROLES.md and REVIEW-WORKFLOW.md governs over tool preference whenever the two would conflict.
