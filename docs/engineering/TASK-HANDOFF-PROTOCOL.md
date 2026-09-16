# Task Handoff Protocol

## Flow

Owner -> Manager reads approved requirements -> bounded task brief -> specialist work -> evidence handoff to Manager -> QA -> independent review -> corrections and re-verification -> Manager report to owner.

Architecture/interface work precedes dependent implementation when necessary. QA may design tests early but final checks target the integrated candidate. Specialists report to Manager; they do not ask the owner to coordinate technical work.

## Required task brief

- Task ID, objective, current branch/worktree, base revision.
- Module or shared documentation scope; approved requirement/decision or explicit instruction references.
- Acceptance criteria, allowed files, exclusions, approved contracts, dependencies.
- Actual implementer, QA, and independent reviewer identities.
- Required tests/checks, data/security impact, separate approvals needed.

Read relevant requirements before coding. A brief cannot override business rules or expand approved architecture. Missing prerequisites block dependent work.

## Required fields in EVERY handoff

- Task ID and actual agent identity/role.
- Current branch and worktree; base revision and exact candidate revision or uncommitted file/diff snapshot.
- Task scope, requirement references, acceptance criteria addressed, exclusions.
- Files changed (created/modified/deleted), or explicitly none.
- Tests/checks actually run: commands/method, environment, result, evidence; distinguish PASSED, FAILED, NOT RUN, BLOCKED, and justified NOT APPLICABLE.
- DB/data changes, dependencies, and approvals, or explicitly none.
- Unresolved risks, questions, blockers, and independent review status.
- Next recommended action and its authorization requirements.

Never claim unrun tests passed or self-approve final work. A blocker report is also a handoff and uses these fields.

## States and escalation

Proposed -> Ready (approved scope/prerequisites) -> In progress -> QA -> Independent review -> Ready for owner handoff. Findings return to implementation and affected QA/review. Required unavailable checks or reviewer mean BLOCKED, not complete.

STOP affected work if requirements conflict, a business rule is unclear, contracts/boundaries are missing, scope must expand, workspace changes conflict, or an operation lacks required approval. Preserve files; send evidence and impact to Manager. Manager asks owner only for unresolved business choices, records the decision, and reissues the task before resuming. Unaffected independent work may continue. No resets/discards of others' work.

Manager maintains CURRENT-HANDOFF.md after material transitions with the required fields. Preserve prior decision/evidence references in task records as work progresses; do not erase approval history. New sessions read AGENTS.md, CURRENT-HANDOFF.md, and relevant requirements/decisions. Commit, merge, push, and deployment require their own authorization; task completion alone is not permission.
