# Review Workflow

1. Manager confirms approved scope, requirement traceability, actual implementers, and a different independent reviewer. Missing business rules or approved module contracts block dependent work.
2. Implementers make the smallest correct change and run required checks. Self-checks are preliminary evidence, never final approval.
3. QA verifies the integrated candidate against requirements with relevant unit, integration, regression, and acceptance checks, including affected failure/permission paths. Report actual results; required failed/unavailable checks block completion.
4. Security & Code Review inspects the exact final candidate, including untracked files, for requirements, boundaries, contracts, permissions, secrets, data/history safety, destructive changes, dependencies, error handling, auditability, and test quality.
5. Findings go to Manager with file/location, impact, correction, and blocking status. Manager assigns fixes; QA reruns affected checks and regressions; independent reviewer re-reviews fixes. Changes after review invalidate approval for affected portions.
6. Manager checks every applicable DEFINITION-OF-DONE.md gate and reports to owner. A reviewed task does not authorize a commit, merge, push, deployment, or production-data operation.

## Independence

Final reviewer must be a different actual agent/person from all implementers of the reviewed work. A new role label, second self-review, or Manager sign-off cannot substitute. An implementing Manager needs independent review too. Reviewers return findings instead of silently fixing; if they implement a fix, another independent reviewer must review it and the affected final work. QA and independent code/security review are complementary gates.

## Review evidence

Every review handoff follows TASK-HANDOFF-PROTOCOL.md: current branch, scope, files changed or none, checks run, unresolved risks, next recommended action, and candidate identity. Also record implementer/reviewer identities, findings/resolutions, and final outcome. Do not retain secrets in reports. Review approval applies only to the recorded candidate.

## Documentation-only applicability

For pure documentation work with no application toolchain, application unit/integration tests and lint/type checks may be NOT APPLICABLE with a specific reason and independent reviewer agreement. File/reference checks, consistency, scope/regression checks, preservation of unrelated files, and independent review remain mandatory. Do not install a framework to fabricate checks. Follow DEFINITION-OF-DONE.md; unavailable required checks cannot be waived for convenience.
