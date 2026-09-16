# Branching and Independent Review

## Required workflow

1. Before each feature/fix, inspect Git status and preserve existing work. The Manager records module scope, requirement references, allowed files, acceptance criteria, and a reviewer distinct from the implementer.
2. Use a separate Git branch for every feature/fix; use an isolated worktree on that branch when feasible, especially for concurrent agents. A worktree is not a substitute for a separate branch. Suggested names: feature/<scope>-<task> or fix/<scope>-<task>.
3. No feature development directly on master/main. No mixing unrelated features or moving another agent's changes into a task. Obtain explicit scope authorization for any cross-module change.
4. Implement the smallest correct change and run required checks from DEFINITION-OF-DONE.md.
5. An independent reviewer examines the final diff/new files, requirement traceability, boundaries, data/security implications, tests, and regression evidence. Record reviewer identity and findings. The implementer cannot be their own final reviewer.
6. Fix findings and have changed parts re-reviewed. Any blocking finding or missing required check prevents completion/merge readiness.
7. Report files, test results, DB changes, risks, open items, and Git status to the Manager. Commit and merge only when authorized; no force push or destructive history rewrite without explicit authorization.

## Unborn repository bootstrap

Until the first authorized baseline commit, the repository has no commits; its foundation files may be untracked or explicitly staged for review. This user-requested guardrail documentation setup may be prepared in the existing checkout without an implicit initial commit, staging, branch switch, or worktree creation. This is a documentation bootstrap exception only, not permission for feature development on master/main.

Before the first feature/fix, request authorization for an initial baseline commit if still absent. After an authorized baseline exists, create the dedicated branch/worktree before feature work. If a safe baseline or isolation cannot be established, STOP feature work and report the blocker; never create a commit just to satisfy tooling.

## Review evidence and untracked files

Ordinary git diff and git diff --stat exclude untracked files. Review newly created files explicitly and report git status --untracked-files=all alongside the diff summary. Do not stage files, including intent-to-add, merely to make statistics appear. Independent review does not authorize a commit.
