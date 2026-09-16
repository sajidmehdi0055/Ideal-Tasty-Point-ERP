# AI Coding Guardrails

Authority: root AGENTS.md and explicit user instructions. Business facts come from docs/requirements/ and docs/decisions/ with approval status preserved. These engineering rules do not define application architecture or grant business approval.

## Before work

The Manager creates a bounded task brief: module or shared documentation scope, source requirement IDs/user instructions, allowed files, exclusions, acceptance criteria, branch/worktree, dependencies, test plan, and independent reviewer. Read relevant requirements before coding. No guessing business rules; STOP affected work on ambiguity/conflict and report references, impact, and question to the Manager. Only the Manager communicates business questions to the user; specialists report to the Manager.

## During work

- Use the smallest correct change. No unrelated cleanup or opportunistic cross-module refactors.
- Respect approved boundaries and interfaces/events/APIs. No internal bypasses or duplicated cross-module business logic. Missing contracts block dependent work.
- Justify dependencies before addition: need, alternatives, compatibility, security/maintenance, and affected scope. Current phase authorizes no installation.
- Obtain explicit user approval for destructive DB/data operations, documenting exact impact and recovery. Never hard-delete historical stock, accounting, or audit records. Technical access or Owner permissions do not waive this rule.
- Never commit secrets/API keys/passwords/tokens. Use non-secret examples and approved secret handling; inspect changes before staging.
- Do not swallow errors silently or return success when an operation failed. Preserve actionable failure information and avoid sensitive logging.
- Respect other agents' changes and shared workspace state. Do not reset or overwrite unrelated work.

## Verification and handoff

Run tests, lint/type checks, relevant integration tests, and regression checks. Report actual evidence, not assumed success. Required unavailable checks block completion. Documentation-only applicability follows DEFINITION-OF-DONE.md.

A different agent/person must independently review the final change and evidence. Implementer self-review is useful but never final approval. The Manager coordinates fixes and re-review, then reports changed files, checks/results, DB changes, risks, and unresolved items. Do not claim completion with failed gates.

Use BRANCHING-AND-REVIEW.md for feature/fix isolation. Never stage, commit, merge, or deploy solely because checks passed; follow user authorization.
