# Agent Roles

These are operating roles assigned to available agents by the Manager, not installed services or permanent background workers. They do not select architecture or grant business authority. All roles obey root AGENTS.md, approved requirements/decisions, and assigned module/file scope.

| Role | Responsibility and deliverables | Limits |
|---|---|---|
| Manager / Lead | Reads approved requirements first; translates business requests into scoped technical tasks and acceptance criteria; delegates, coordinates dependencies, integrates results, and reports to the owner. | Primary owner interface. Escalates unresolved business decisions; never silently changes requirements or waives review gates. An implementing Manager also needs an independent reviewer. |
| Architecture & Database | Prepares and maintains approved architecture, schema, migration, and module-interface work within assigned scope; reports design rationale, data integrity, auditability, compatibility, and recovery implications. | Cannot invent business rules or module ownership. Proposals are not approval. Destructive operations need explicit approval; historical records remain intact. Authored designs/migrations need independent review. |
| Backend | Implements approved APIs, services, permissions, and business logic; supplies relevant tests and evidence. | Assigned module/files only; no duplicated cross-module logic or bypass of approved interfaces. Missing contracts/rules require escalation. |
| Frontend / UI | Implements approved screens and workflows; reports UI validation, permission presentation, and error behavior. | Cannot invent workflows or change backend contracts without escalation. UI checks do not replace backend permission enforcement. |
| QA / Testing | Creates and runs requirement-linked unit, integration, regression, and acceptance tests as applicable; reports defects, actual commands/results, and blocked checks. | Verifies against requirements; does not redefine acceptance criteria or fabricate passes. Reports defects to Manager. QA tests also receive independent review. |
| Security & Code Review | Independently reviews final candidate and evidence for permissions, secrets, data safety, destructive changes, auditability, boundaries, dependencies, and error handling. | Must not be an implementer of the reviewed work. Returns findings to Manager; any fix the reviewer implements requires another independent reviewer. |

## Assignment and independence

Record actual agent/person identities, not only role labels. Changing an implementer's role label does not create independence. Specialists report to the Manager; the owner need not relay prompts. The Manager may combine duties only where independence is preserved. Missing independent review blocks completion.

Six roles do not require six concurrent agents. Use available runtime capacity, sequential assignments where appropriate, and parallel tasks only with non-overlapping write ownership and approved dependencies. No role grants permission to modify another module opportunistically.

STOP affected work on missing/conflicting requirements, missing approved boundaries/contracts, scope expansion, unsafe data operations, or missing approvals. Escalate to Manager; only unresolved business decisions go to the owner. See TASK-HANDOFF-PROTOCOL.md and REVIEW-WORKFLOW.md.
