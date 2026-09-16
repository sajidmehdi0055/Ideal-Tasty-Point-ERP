# Definition of Done

A feature/fix is NOT complete until every applicable gate below is satisfied. The Manager owns completion; the implementer cannot approve their own final review.

1. Requirement traceability: approved requirement IDs or explicit user instruction references, acceptance criteria, module scope, permitted files, exclusions, and decisions are recorded. No unresolved business ambiguity affects the delivered scope.
2. Scope and design: smallest correct change, approved module contracts, no duplicate cross-module business logic, no opportunistic refactors, and justified dependencies.
3. Data/security: DB changes and data impact are reported; destructive operations have explicit approval and recovery planning. Historical stock/accounting/audit records are never hard-deleted. No committed secrets or fake success/error suppression.
4. Tests: relevant behavior tests, lint/type checks, and relevant integration tests have actually run successfully. Include failure/permission paths where affected. Record commands/checks, environment, results, and limitations.
5. Regression: validate affected existing workflows and contracts against the baseline; record results. Required unavailable checks remain BLOCKED; do not mark the feature complete.
6. Independent review: a different agent/person reviews the final change and evidence. Record reviewer, scope, findings, resolution, and review of fixes. No reviewer means completion is blocked.
7. Documentation: requirements traceability, decisions, contracts, and operational guidance reflect the change. Do not silently change unresolved requirements. Preserve history and approval status.
8. Handoff: report files changed, checks and results, DB changes or none, independent review, risks, and unresolved items. Completion does not authorize a commit, merge, or deployment.

## Documentation-only applicability

For a pure documentation task with no application/toolchain, application tests, lint/type checks, and integration tests may be recorded as NOT APPLICABLE with a specific reason and independent reviewer agreement. Mandatory documentation checks still include source/requirement consistency, links, required files, scope, independent review, and preservation of protected files. An existing required check cannot be waived merely because it fails or is inconvenient. Never fabricate pass results or install an unapproved framework just to obtain checks.

## Completion evidence template

- Task/module scope and requirement/instruction references:
- Files created/modified:
- Tests/checks actually run and results:
- Not-applicable checks with reasons, or blocked checks:
- Regression evidence:
- Independent reviewer, findings, and final outcome:
- DB/schema/data changes and approvals, or none:
- Documentation updated:
- Risks and unresolved items (with scope impact):
- Git branch/worktree and status; commit/merge authorization:
