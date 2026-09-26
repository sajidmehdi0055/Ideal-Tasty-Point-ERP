# Current Handoff — S04-IMPL-001 (Stock Locations + Opening Stock, quantity-only)

Date: 2026-09-26. Branch: feat/inv-s04-locations-opening-stock (base: main @ 971307f). Status: implemented + self-verified; NOT merged — pending independent QA review, owner Windows/Docker re-run (recommended) and owner-approved merge.
Authority: owner decisions 2026-09-26 recorded in `docs/decisions/ADR-0008-s04-stock-locations-opening-stock.md` (slice order, freezer-level locations, correction by reasoned adjustment, quantity-only). Implemented by the Cowork Manager session.

## What was built

Backend only. Stock Location master (branch-owned STORE/KITCHEN/FREEZER, freezer under a STORE/KITCHEN parent), append-only stock ledger with OPENING and ADJUSTMENT movements in Base UOM, current balances and movement history. Full details, API table and requirement-to-test traceability: `docs/engineering/inventory-s04-implementation.md`.

Migration: `backend/migrations/202609260001_inventory_s04_locations_opening_stock.sql` (new tables only). Grants: `backend/scripts/runtime-grants.sql` extended — INSERT-only on the ledger.

## Verification (Cowork Linux VM, clean clone, Node v24.21.0, PostgreSQL 17.10 embedded)

| Check | Result |
|---|---|
| npm ci --ignore-scripts | PASS |
| typecheck / lint / build | PASS / PASS / PASS |
| test:unit | PASS — 319/319 (7 files; 268 + 51 new) |
| test:integration | PASS — 80/80 (4 files; 61 + 19 new), real authoritative migrate CLI + shipped runtime grants |

Existing tests changed (all wiring/expectation updates, see implementation doc): buildApp wiring in 9 files; migration-list assertions (2 files); the S-03 "never touches stock" test now checks `stock_movement` has no row for the purchase's item instead of "no stock table exists".

## Open / defaults to confirm

DEFAULT / ASSUMED (ADR-0008 D-04, D-05): balance never below zero in S-04; locations with stock or active freezers cannot be deactivated. No frontend screens in this slice.

## Next recommended action

Owner pushes the branch; independent QA review (agent with no part in this change); owner re-run of integration tests on Windows Docker PostgreSQL 17.11 recommended; then owner-approved controlled merge. Do not start receiving (S-05) automatically.

---

## Previous handoff — S03-MINOR-001 (Century Leap-Year Test Coverage for purchase_date)

Date: 2026-09-26. Branch: test/s03-leap-year-coverage (base: main @ 34cb7d0). Status: **MERGED to main** (fast-forward 34cb7d0..9179d83, owner-approved) after independent QA review PASS. The S-03 century leap-year MINOR is **CLOSED**; earlier sections below that list it as open are historical.
Scope: closes the open S-03 MINOR (no test for the century branch of `isLeapYear` in `backend/src/inventory/domain/purchase-record.ts`). Test-only change: no production code, migration, API, security or audit change.

## What changed

`backend/tests/unit/purchase-record-api.test.ts` — 7 new cases through `POST /api/inventory/purchases` (past dates only, because future dates are rejected by a separate rule):
- accepted (201, repository called): `2000-02-29`, `1600-02-29` (centuries divisible by 400), `2024-02-29` (ordinary leap year)
- rejected (400 `VALIDATION_ERROR`, issue on `purchase_date` = "purchase_date must be a valid calendar date", repository not called): `1900-02-29`, `1800-02-29`, `1700-02-29` (centuries not divisible by 400), `2023-02-29` (ordinary non-leap year)

## Verification (Cowork Linux VM, clean `git archive` copy, Node v24.21.0)

| Check | Result |
|---|---|
| npm ci --ignore-scripts | PASS — 221 packages |
| typecheck | PASS |
| lint | PASS |
| build | PASS |
| test:unit | PASS — 268/268 (6 files; 261 before + 7 new) |
| Mutation: `isLeapYear` = `year % 4 === 0` | new tests FAIL as expected (1900/1800/1700 accepted wrongly) |
| Mutation: `isLeapYear` without the `% 400` clause | new tests FAIL as expected (2000/1600 rejected wrongly) |

Integration tests (PostgreSQL) not re-run: no production code or SQL changed; last run 61/61 in S03-MERGE-001.

## Independent review

In-house QA/Testing subagent (no part in the change), fresh GitHub clone, Node v24.21.0 — **PASS — ready for controlled merge**. Confirmed test-only diff; npm ci, typecheck, lint, build PASS; test:unit 268/268 (261 on main's test file + 7 new); both mutations make the new tests fail; handoff accurate; no .only/.skip, secrets or weakened assertions. Findings: 0 BLOCKER / 0 MAJOR / 0 MINOR; 1 NOTE (older handoff sections still list this MINOR as open — addressed by the status line above).

## Merge

- Previous main HEAD: 34cb7d0. Merged branch HEAD: 9179d83. Merge type: fast-forward (main ref advanced without a checkout, because another session had a different branch checked out in the main worktree). Branch preserved on origin.
- Post-merge: main tree is byte-identical to the reviewed 9179d83 tree; no re-run needed beyond the review above.
- Push of main is run from the owner's Windows machine.

## Next recommended action

Do not start S-04 automatically. Remaining: Figma palette proposal/approval; S-04 scoping from the roadmap when the owner asks.

---

## Previous handoff — UI-MERGE-001 (Frontend UI Foundation Merged to Main)

Date: 2026-09-26. Branch: main. Merged from: feat/ui-foundation-item-master (HEAD 7a9a9e4).
Authority: explicit owner approval in-session for this merge, following an in-house QA/Testing subagent review verdict of PASS — ready for controlled merge (0 BLOCKER / 0 MAJOR / 0 MINOR / 0 NOTE) on commit 7a9a9e4. Codex and Google Antigravity remain paused (GOV-MANAGER-SUBAGENT-001).
Roles: Cowork Claude session (Manager) = executed this merge, post-merge verification and this record. VS Code Claude Code session = reconcile (UI-RECONCILE-001), fix (UI-FIX-001), pre-merge verification. In-house QA/Testing subagent with no part in the fix = independent reviewer (PASS). Known limitation: same-provider review is weaker independence than an external tool.

## Merge summary

The frontend UI foundation (ERP shell, sidebar, design-system components, Item Master create/edit/list, UOM/Brand/Pack Variant placeholder pages) merged into main via a pure fast-forward. main (4ede738) was a strict ancestor of the reconciled feature branch, so there were zero conflicts and no merge commit.

- Previous main HEAD: 4ede738 (S-01 + S-02 + S-03 + GOV-MANAGER-SUBAGENT-001)
- Feature branch HEAD (merged, reviewed commit): 7a9a9e4
- New main HEAD (merge): 7a9a9e4
- Merge type: fast-forward (`git merge --ff-only origin/feat/ui-foundation-item-master`)
- Scope check: `git diff 4ede738 7a9a9e4 -- backend/` is empty — no backend, migration, API, security or audit change. Outside `frontend/`, only README.md and this file changed.
- Feature branch `feat/ui-foundation-item-master` preserved (not deleted) on origin.
- Push: `git push origin main` is run from the owner's Windows machine (the Cowork VM has no GitHub push credentials); confirm `main == origin/main` after `git fetch origin`.

Merge execution note: the first `--ff-only` attempt from the Cowork VM stopped part-way because file deletion in the mounted repo was not yet permitted (git could not unlink the old CURRENT-HANDOFF.md). HEAD stayed at 4ede738 and no tracked file changed; it left an empty `.git/index.lock` and a partial untracked `frontend/` copy. With owner-approved delete permission, only those two leftovers were removed, and the `--ff-only` merge was re-run successfully (clean tree, HEAD 7a9a9e4).

## Verification

| Check | Pre-merge (feature branch 7a9a9e4, owner's Windows env, VS Code session) | Post-merge (main 7a9a9e4, clean `git archive` of main, Cowork Linux VM, Node v24.21.0) |
|---|---|---|
| npm ci --ignore-scripts | PASS — 249 packages, 0 vulnerabilities (after owner closed an orphaned Vite dev server, PIDs 10108/18080/34380, that locked the rolldown native binding) | PASS — 249 packages |
| typecheck | PASS | PASS |
| lint | PASS | PASS |
| test | PASS — 47/47 | PASS — 47/47 (9 test files) |
| build | PASS | PASS |

Backend checks were not re-run: the backend tree on main is byte-identical to 4ede738, which was verified in S03-MERGE-001 (unit 261/261, integration 61/61 on PostgreSQL 17.11).

## Independent review

In-house QA/Testing subagent (no involvement in the fix) — **PASS — ready for controlled merge**. It re-ran typecheck/lint/test (47/47)/build, confirmed the empty backend diff, confirmed the fix commit touches only its 4 claimed files, read the full `handleSubmit` error-branch ordering, and confirmed the new test is a genuine regression test (fails without the fix). No secrets, fake auth or dead code found. Earlier MAJOR (Base UOM hint contradicted backend `INVALID_BASE_UOM` validation) is closed by UI-FIX-001.

## Known contract gaps (unchanged, documented in the UI)

- No real login/session yet: backend returns 401 for mutations by design; the dev identity switch is dev-only and clearly labeled.
- Base UOM is a free-text field validated by the backend against active UOM Master rows; a UOM picker is future work.
- UOM / Brand / Pack Variant screens are placeholders; no Supplier / Purchase UI yet.

## Next recommended action

Do not start S-04 automatically. Open items: (1) S-03 MINOR — century leap-year test coverage, (2) Figma palette proposal/approval before any visual redesign, (3) S-04 scoping from the roadmap only when the owner asks. An untracked leftover `frontend/tmp-playwright-demo.mjs` exists only in the ui-foundation worktree (never committed); owner may delete it.

---

## Previous handoff — S03-MERGE-001 (Inventory S-03 Merged to Main)

Date: 2026-09-25. Branch: main. Merged from: feat/inv-s03-purchasing-supplier-foundation (commits 637441d, 0e3f7ed, c84047b).
Authority: owner-approved controlled merge, following an in-house QA/Testing subagent review verdict of PASS — ready for controlled merge (no BLOCKER/MAJOR findings; 1 MINOR open, recorded below, not a merge blocker), and explicit owner authorization in-session to proceed with the merge. Codex and Google Antigravity were paused by the owner's instruction for this session, so the independent review was performed by an in-house QA/Testing subagent instead of the usual Codex path.
Roles: Claude Code = primary implementation manager (executed this merge and verification). In-house QA/Testing subagent = independent reviewer (PASS, owner-confirmed). Codex = paused this session, not used. Google Antigravity = paused this session, not used.

## Merge summary

S-03 (Supplier Master, Purchase Record, Rate Comparison) merged into main via a pure fast-forward. main (c463e8a) was a strict ancestor of feat/inv-s03-purchasing-supplier-foundation (merge-base(main, feature) == main's prior HEAD), so the merge produced zero conflicts and no merge commit.

- Previous main HEAD: c463e8a (S-01 + S-02)
- Feature branch HEAD (merged): c84047b
- New main HEAD: c84047b
- Merged commits: 637441d (`feat(inventory): implement S-03 Supplier Master, Purchase Record and Rate Comparison`), 0e3f7ed (`test(inventory): add S-03 unit/integration tests, update S-01/S-02 buildApp wiring and migration-count assertions`), c84047b (`docs(inventory): document S-03 Supplier Master, Purchase Record and Rate Comparison`)
- Merge type: fast-forward (`git merge --ff-only`)
- Feature branch `feat/inv-s03-purchasing-supplier-foundation` preserved (not deleted) and pushed to origin, per policy
- `git push origin main`: completed
- Post-push verification: `git rev-parse main` == `git rev-parse origin/main` (confirmed via fresh `git fetch origin`)

## Real-environment verification (owner's Docker Desktop PostgreSQL, Node 24 — this session)

The S03-IMPL-001 entry below (now archived in Historical handoff records) was self-verified inside an isolated Linux VM (PostgreSQL 14, Node 22) because the session that produced it had no access to the owner's Docker Desktop. This session re-ran the full verification list on the owner's actual local environment, both immediately before the merge (on the feature branch) and immediately after (on main), to close that gap.

| Check | Pre-merge (feature branch, c84047b) | Post-merge (main, c84047b) |
|---|---|---|
| Node version | v24.18.1 | v24.18.1 |
| PostgreSQL version | 17.11 (Docker `postgres:17`) | 17.11 (Docker `postgres:17`) |
| npm ci --ignore-scripts | PASS (after clearing an orphaned `esbuild.exe` process holding a Windows file lock — owner closed it; no other workaround used) | not re-run (same tree) |
| typecheck | PASS | PASS |
| lint | PASS | PASS |
| build | PASS | PASS |
| test:unit | PASS — 261/261 (6 test files) | PASS — 261/261 (6 test files) |
| test:integration | PASS — 61/61 (3 test files) | PASS — 61/61 (3 test files) |

Both runs matched the isolated-VM results (261/261 unit, 61/61 integration) exactly, confirming the S03-IMPL-001 results were not an artifact of that session's non-standard environment.

## Independent review

In-house QA/Testing subagent — **PASS — ready for controlled merge**. No BLOCKER or MAJOR findings. One MINOR left open, not fixed as part of this merge (recorded for a future slice, not a regression risk to S-01/S-02/S-03 as shipped):

- **MINOR (open)**: `purchase_date` calendar validation (`isValidCalendarDate` in `backend/src/inventory/domain/purchase-record.ts`) has no test covering the century leap-year branch (e.g. year 1900 or 2000, where the standard `divisible by 4, except centuries unless divisible by 400` rule applies). The implementation itself follows the correct rule; only test coverage for that specific branch is missing.

## S-03 completion status

S-03 is now officially COMPLETE on main: implementation + tests + independent review (in-house QA/Testing subagent PASS) + real-environment verification + owner-approved merge + post-merge verification are all satisfied. Inventory S-01, S-02, and S-03 are all merged to main.

## Next recommended action

Do not start S-04 automatically. Recommended next steps, per project roadmap: (1) address the open MINOR (century leap-year test coverage) opportunistically or as part of a future slice touching Purchase Record, (2) resume the normal Codex/Google Antigravity review path once the owner lifts the pause, (3) only then scope S-04 from this stable main.

---

## Previous handoff — GOV-MANAGER-SUBAGENT-001

Date: 2026-09-25. Scope: governance/documentation only (AGENTS.md, docs/engineering/MULTI-AGENT-OPERATING-MODEL.md, docs/engineering/REVIEW-WORKFLOW.md, this handoff). Branch: docs/manager-subagent-governance-20260925 (base: main @ c463e8a). Authority: explicit owner instruction, given directly in-session, following Codex running out of usage capacity.

## Owner decision recorded

1. Codex and Google Antigravity are paused as external tools for this project until the owner reactivates them. Reason given: Codex has run out of tokens/capacity.
2. All implementation and testing happen inside Claude Code: a Manager subagent (acting as the lead software engineer) decomposes work and delegates to specialist subagents, who report results back to the Manager — this was already the operating model (AGENTS.md, AGENT-ROLES.md) and is now the *only* execution path while Codex/Antigravity are paused.
3. A dedicated QA/Testing subagent, separate from and with no prior involvement in the implementing subagent, must actually run the required tests/checks for every task — this subagent now also carries the independent-review role that Codex previously filled, since no external reviewer is available.
4. Token/cost discipline: subagent count and work must stay sized to what each task genuinely needs; no redundant re-reading, speculative exploration, or unrequested extra work.
5. When anything is genuinely ambiguous — an instruction, a requirement, a decision only the owner can make — the Manager stops and asks the owner directly rather than guessing.

## What changed

- AGENTS.md: external-tool priority line updated to note the pause; two new guardrail bullets added (paused-tools/in-house-review, token discipline, ask-when-unsure).
- docs/engineering/MULTI-AGENT-OPERATING-MODEL.md: "External tool priority" section rewritten to record the pause and the in-house reviewer substitute; new "Token efficiency" section added.
- docs/engineering/REVIEW-WORKFLOW.md: "Independence" section gets one added paragraph naming the in-house reviewer substitute while paused.

## What did NOT change

- The independence rule itself (AGENT-ROLES.md, REVIEW-WORKFLOW.md, DEFINITION-OF-DONE.md): the implementer is still never the final reviewer of their own work. Rule 10 in AGENTS.md's non-negotiable guardrails is unchanged.
- Git safety rules: staging/commit on a feature branch remains routine; merge to main, force push, history rewrite, and destructive operations still require explicit owner authorization.
- Escalation triggers (business rules, financial/security/architecture changes, destructive operations, scope expansion): unchanged.
- Module scope, approved architecture, and business rules: untouched by this change.

## Known limitation (owner should weigh this)

An in-house Claude Code QA/Testing subagent reviewing a Claude Code implementation subagent is *not* the same strength of independence as a genuinely separate provider (Codex/Antigravity previously served that role). Both subagents share the same underlying model family, even though they run in separate contexts with no shared history of the implementation. This handoff records that limitation; it is not hidden in future completion reports while Codex/Antigravity remain paused.

Validation: this task is documentation-only; no application code, dependency, or DB change. Referenced-file existence and edit-anchor checks passed for all three edited files. No merge to main performed; only this feature branch is affected.

## Next recommended action

Owner reviews this handoff; if acceptable, authorize commit + push of branch `docs/manager-subagent-governance-20260925`, then (separately) authorize merge to main. No further action is blocked in the meantime — DEV/PARALLEL track work can proceed under the updated in-house review model immediately, since the owner instruction is already in effect regardless of when this documentation is merged.

Status: merged to main on 2026-09-25 (owner-approved).

---

## Previous handoff — UI-FIX-001 (Base UOM MAJOR Finding Fixed on Reconciled Frontend Branch)

Date: 2026-09-25. Branch: feat/ui-foundation-item-master (worktree at Ideal-Tasty-Point-ERP-ui-foundation). Base: merge commit `ec23d0c` (reconcile of `origin/main` @ `4ede738`, covering S-01/S-02/S-03).
Authority: owner instruction, given directly in-session, to fix the single MAJOR finding from the independent reconcile review (below) before requesting a fresh independent review. No merge to main authorized or performed.
Roles: Claude Code = primary implementer of this fix. Owner = closed the locking process and authorized each step. Independent reviewer for this candidate: pending (see "Next recommended action").

## What this fixes

The reconcile review (recorded further below, "Previous handoff" entries do not yet include it as its own record — see the review verdict summarized here) found one MAJOR issue: after this branch absorbed S-02/S-03 from main, `base_uom` on Item create/edit now requires a real, active `UOM Master` row (`backend/README.md`: "An unresolvable name returns 400 `INVALID_BASE_UOM`"), but the frontend still presented Base UOM as free text with a hint claiming it was "not a catalog lookup yet," and a 400 `INVALID_BASE_UOM` response only produced a generic banner, not a field-level error.

Fixed:
- `frontend/src/features/items/components/ItemForm.tsx`: Base UOM hint now reads `Must match an active unit in UOM Master (e.g. "kg", "pcs"; not case-sensitive). A picker is coming later.`
- `frontend/src/features/items/ItemFormPage.tsx`: `handleSubmit` now special-cases `ApiError.code === 'INVALID_BASE_UOM'`, setting a field-level error (`This unit is not an active unit in UOM Master.`) on `base_uom` plus the same `Please fix the highlighted fields.` banner used for validation errors, instead of falling through to a generic top-level message.
- `frontend/src/features/items/__tests__/ItemFormPage.test.tsx`: new test mocks `createItem` rejecting with `ApiError(400, 'INVALID_BASE_UOM', ...)` and asserts the field-level message renders on Base UOM (`aria-invalid="true"`) alongside the banner.

Out of scope, deliberately not done: a UOM picker/dropdown backed by the real `GET /api/inventory/uoms` endpoint. That remains a known gap for a future slice; this fix only corrects the misleading copy and the error-handling gap.

## Environment blocker cleared before this fix

`npm ci --ignore-scripts` had previously failed with `EPERM` unlinking `@rolldown/binding-win32-x64-msvc`'s native binding, leaving `node_modules` in a partially-deleted state. Root cause: this worktree's own Vite dev server (`node_modules/.bin/vite`, port 5173) was still running from an earlier session, plus its `npm run dev`/`npx vite` parent processes. Identified via `Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='esbuild.exe'"`, cross-checked by command line against this worktree's path; owner closed the three processes (confirmed by re-running the same filtered query until it returned no match for `Ideal-Tasty-Point-ERP-ui-foundation\frontend`). `node_modules` was then deleted and `npm ci --ignore-scripts` completed cleanly (249 packages, 0 vulnerabilities). Backend `tsx watch`/demo-server processes and unrelated OpenAI Codex runtime processes were left untouched throughout.

## Verification (executed, not assumed)

| Check | Result |
|---|---|
| npm ci --ignore-scripts | PASS — 249 packages, 0 vulnerabilities (after clearing the Vite dev-server lock above) |
| typecheck | PASS |
| lint | PASS |
| test | PASS — 47/47 (46 prior + 1 new INVALID_BASE_UOM field-error regression test) |
| build | PASS |

Scope checks: `git diff origin/main HEAD --stat -- backend/` empty (backend untouched). `git grep` for conflict markers across the tree: none. `git diff origin/main HEAD --stat -- . ':!frontend'` touches only `README.md` and `docs/engineering/CURRENT-HANDOFF.md`.

## Next recommended action

Fresh in-house QA/Testing independent review of this corrected candidate (diff `origin/main...HEAD -- frontend/`), verdict PASS/FAIL with any remaining BLOCKER/MAJOR/MINOR findings. Do not merge to main until that review passes and the owner approves; only the feature branch is pushed by this record.

---

## Previous handoff — UI-REVIEW-001 (Frontend Branch Review Pass, Owner-Approved as Review of Record)

Date: 2026-09-23. Branch: feat/ui-foundation-item-master (worktree at Ideal-Tasty-Point-ERP-ui-foundation). Base: commit `88f5e79` (UI-RECONCILE-001).
Authority: 00-PROJECT-MASTER.md §27 priority #3 (independently review the frontend branch before merging it).
Roles: Claude Code = primary implementation manager, and — by explicit owner decision this round, as a documented exception to the normal Claude-implements/Codex-reviews split — also reviewer of record for this pass, since no Codex session was available. This is **not** independent review in the project's normal sense (see AGENTS.md and 00-PROJECT-MASTER.md §5–6); the owner was told this in-session before approving it as sufficient for this round.

## Review performed

Full manual line-by-line read of the S-02-era frontend shell/design-system/Item Master code (the original implementation d491ede, the Codex-findings fix 9398fbb, and the prior self-review fix 3d2e6f8), cross-file tracing of AppShell/Sidebar/Header/session code, an actual `npm ci && typecheck && lint && test && build` run to check prior claims (all passed; the dev-session tree-shaking claim was independently re-verified against `dist/`), and a constructed regression test that reproduced one bug directly against the real component before it was fixed.

## Findings and fixes

1. **Correctness — `ItemForm.tsx`**: local form state (`useState`) was never resynced when `initialValues`/`id` changed without an unmount, and `ItemFormPage` never keyed `<ItemForm>` to the item id. Not reachable via current UI (all edit links go through `ItemListPage`, which unmounts the form), but any future direct edit-to-edit navigation would silently show the wrong item's data. Fixed with `key={id ?? 'new'}` in `ItemFormPage.tsx`. Regression test added to `ItemFormPage.test.tsx` (navigates directly between two edit routes without unmount; failed against pre-fix code, confirmed).
2. **Correctness — `AppShell.tsx`**: the focus-restore effect fired for the desktop-viewport auto-close transition too, calling `.focus()` on the nav trigger even though it is `md:hidden` (not focusable) on desktop — a silent no-op that dropped focus to an undefined location. Fixed by gating the focus call on `!isDesktop`. Regression test added to `AppShell.test.tsx` (spies on `.focus()` across a mobile→desktop transition; failed against pre-fix code, confirmed).
3. **UX — `ItemListPage.tsx`**: the create/edit success banner was read directly from `location.state` every render, so it stayed pinned through every later search/filter/retry on the page instead of being a one-time confirmation. Fixed with a `dismissed` flag, set true on search input and retry click, so the banner disappears the moment the user does anything else on the page. Regression test added to `ItemListPage.test.tsx`.
4. **Cleanup — `ConfirmDialog`**: fully implemented and tested but had zero call sites (dead code shipping in the bundle). Removed the component, its test, and its barrel export; nothing else referenced it.
5. **Cleanup — duplicated storage wrapper**: `session-cache.ts` and `dev-session.tsx` each hand-rolled the same try/catch Web Storage read/write logic. Extracted `frontend/src/lib/safe-storage.ts` (`safeStorageGet`/`safeStorageSet`); both files now use it.

## Verification (executed, not assumed)

| Check | Result |
|---|---|
| typecheck | PASS |
| lint | PASS |
| test | PASS — 46/46 (2 removed with ConfirmDialog, 3 new regression tests added) |
| build | PASS |

Backend untouched by this pass.

## Remaining known gaps (unchanged, out of scope for this pass)

Real Item GET/list endpoint and full login/session system — documented in 00-PROJECT-MASTER.md §20, unrelated to this review.

## Next recommended action

Owner-approved controlled merge to `main`, following the same process as S-01/S-02 (main up to date, no conflicts expected — verify with a fresh `git status`/`git log` immediately before merging). A genuine independent (Codex) review of this branch has still never run; if/when Codex becomes available, running it against `main` post-merge is worth doing as a retroactive check, though it does not block this merge per owner's explicit decision above.

---

## Previous handoff — UI-RECONCILE-001 (Frontend Branch Reconciled with S-02 Main)

Date: 2026-09-23. Branch: feat/ui-foundation-item-master (worktree at Ideal-Tasty-Point-ERP-ui-foundation). Base before this record: d491ede/9398fbb (branched from pre-S-02 main, commit 163c953).
Authority: project roadmap priority order (00-PROJECT-MASTER.md §27) — independently review the frontend branch before merging it. Owner-confirmed in-session to proceed with reconciliation and to push the result.
Roles: Claude Code = primary implementation manager (executed this reconciliation and verification). Codex = independent reviewer (not yet run on this reconciled candidate). Google Antigravity = not used this session.

## Why this was needed

`feat/ui-foundation-item-master` was created from main at commit 163c953 — before Inventory S-02 (UOM Master, Brand Master, Pack Variant, Item Base UOM FK migration) was implemented and merged. The branch therefore still carried the pre-S-02 versions of several backend files (routes, services, repositories, tests, migrations). Reviewing or merging it as-is would have silently reverted S-02 from main. This was caught by diffing `main` against the frontend branch and inspecting `git merge-base` before any review was requested.

## Reconciliation performed

`git merge main --no-edit` on `feat/ui-foundation-item-master` (merge commit `9fe2b35`). Merge strategy `ort` resolved automatically with **zero conflicts** — the S-02 backend additions were purely additive relative to what the frontend branch already had. 41 files changed, all incoming from `main` (migrations, UOM/Brand/Pack Variant domain/application/persistence/API modules, their tests, ADR-0007, S-02 implementation docs, updated CURRENT-HANDOFF.md).

## Post-reconciliation verification (executed, not assumed)

Backend (`backend/`, real PostgreSQL 17 via the same Docker Desktop setup used for S-01/S-02 verification):

| Check | Result |
|---|---|
| npm ci --ignore-scripts | Completed cleanly |
| typecheck | PASS |
| lint | PASS |
| test:unit | PASS — 190/190 |
| test:integration | PASS — 39/39 (real PostgreSQL, no mocks) |
| build | PASS |

Frontend (`frontend/`):

| Check | Result |
|---|---|
| typecheck | PASS |
| lint | PASS |
| test | PASS — 44/44 |
| build | PASS |

No regression found in either track. S-02 backend functionality (UOM/Brand/Pack Variant) is fully intact on the reconciled branch.

## Git state

Local branch was 5 commits ahead of `origin/feat/ui-foundation-item-master` after the merge (the 4 S-02 commits it had never had, plus the new merge commit). Pushed with owner authorization: `9398fbb..9fe2b35 feat/ui-foundation-item-master -> feat/ui-foundation-item-master`. `main` was not touched by this record.

## Remaining issues / blockers

None found in this reconciliation pass. The pre-existing "Known Frontend Contract Gaps" (real Item GET/list endpoint; full login/session system) documented in 00-PROJECT-MASTER.md §20 remain open and are unrelated to this reconciliation.

## Follow-up: self-review pass before Codex (commit 3d2e6f8)

Before handing the reconciled candidate to Codex, Claude Code ran its own thorough source-level review (not a substitute for Codex, but intended to avoid wasting Codex's pass on already-catchable issues) and found 3 real correctness/accessibility bugs plus 2 cleanup items in the S-02-era frontend shell/design-system code:

- **AppShell**: `closeMobileNav()` called `.focus()` on the nav trigger synchronously, before React committed the DOM update removing `inert` from its container — per the HTML spec `.focus()` on/under an `inert` subtree is a no-op, so focus silently failed to return to the trigger, despite commit 9398fbb's own message claiming this was fixed. Moved the focus call into a `useEffect` keyed on the open→closed transition, so it now runs after commit (after `inert` is gone).
- **AppShell**: `mobileNavOpen` was never reset when the viewport crossed from mobile to desktop, so narrowing back to mobile later could reveal a drawer left open from a previous mobile session. Fixed by resetting it during render (React's documented state-adjustment-on-prop-change pattern) when `isDesktop` changes — not in an effect, since `eslint-plugin-react-hooks`'s `set-state-in-effect` rule (correctly) rejects calling `setState` synchronously inside a plain effect.
- **Sidebar/AppShell**: `Sidebar` computed its own `isDesktop` via a second, independent `useMediaQuery` call instead of receiving `AppShell`'s already-computed value, so the two could transiently disagree for one render during a resize (a modal dialog reachable from a non-inert background). `Sidebar` now takes `isDesktop` as a required prop from `AppShell`.
- **Sidebar** (cleanup): the Escape-key listener effect depended on the `onClose` function identity, which is a new closure every `AppShell` render (it wraps `<Routes>`, so it re-renders on every navigation) — this churned the `document` keydown listener on every navigation even while the drawer was closed. Now reads `onClose` via a ref so the effect only depends on actual open/close transitions.
- **Input/Select** (cleanup): duplicated the same label/hint/error/id-wiring markup verbatim. Extracted a shared `FormField` wrapper (`design-system/components/FormField.tsx`); both now render identical output through it.

Two new regression tests in `AppShell.test.tsx`, each explicitly confirmed to fail against the pre-fix code (verified by temporarily reverting `AppShell.tsx` with `git stash` and re-running) before being confirmed to pass against the fix:
- One spies on the trigger button's `.focus()` call and records whether the content wrapper still has the `inert` attribute at the exact moment `.focus()` runs. This was necessary because jsdom does not enforce the browser's inert-blocks-focus behavior (confirmed by a standalone jsdom script) — a plain "trigger has focus after close" assertion would have passed even against the pre-fix code, proving nothing.
- The other drives a controllable `matchMedia` mock across the mobile→desktop→mobile boundary and asserts the drawer's `inert`/`aria-modal` state, not `role`/name presence (the `<aside>` keeps `role="dialog"` on mobile regardless of open/closed state, so a role-presence assertion can't distinguish the two).

`Sidebar.test.tsx` updated for the new required `isDesktop` prop (previously stubbed `matchMedia` per-test; now passes `isDesktop` directly, which is simpler and matches how the component actually receives it).

Re-verified after the fix: frontend `typecheck`, `lint`, `test` (46/46, up from 44 — the 2 new `AppShell.test.tsx` cases), `build` — all PASS. Backend untouched by this commit.

## Next recommended action

Independent Codex review of the corrected candidate (commit `3d2e6f8`), covering the original frontend implementation, the S-02 reconciliation, and this self-review fix pass together. Do not merge to main until that review passes and the owner approves.

---

## Previous handoff — S02-MERGE-001 (Inventory S-02 Merged to Main)

Date: 2026-09-18. Branch: main. Merged from: feat/inv-s02-uom-brand-pack (commit be21626).
Authority: owner-approved controlled merge, following independent Codex review verdict "PASS — corrections verified; ready for controlled merge to main" on the round-3 corrected candidate (be21626), and explicit owner authorization in-session to proceed with the merge.
Roles: Claude Code = primary implementation manager (executed this merge and verification). Codex = independent reviewer (PASS, owner-confirmed). Google Antigravity = not used this session.

## Merge summary

S-02 (UOM Master, Brand Master, Pack Variant, Item Base UOM FK migration) merged into main via a pure fast-forward. main (163c953) was a strict ancestor of feat/inv-s02-uom-brand-pack (merge-base(main, feature) == main's prior HEAD), so the merge produced zero conflicts and no merge commit.

- Previous main HEAD: 163c953 (S-01 only)
- Feature branch HEAD (merged): be21626
- New main HEAD: be21626
- Merge type: fast-forward (`git merge --ff-only`)
- Feature branch `feat/inv-s02-uom-brand-pack` preserved (not deleted), per policy
- `git push origin main`: completed — `163c953..be21626  main -> main`
- Post-push verification: `git rev-parse main` == `git rev-parse origin/main` == `be2162687a63a7ef68d4f1769e87d543882e4165` (confirmed via fresh `git fetch origin`)

## Pre-merge verification (on feat/inv-s02-uom-brand-pack, commit be21626)

Executed in the owner's real local development environment (Windows 11, Docker Desktop, real PostgreSQL):

| Check | Result |
|---|---|
| npm ci --ignore-scripts | Completed — dependencies reconciled cleanly |
| typecheck | PASS |
| lint | PASS |
| test:unit | PASS — 190/190 (4 test files) |
| migration recovery / migrate:check | PASS — exercised via the real authoritative CLI command as part of the integration suite, including the BLOCKER-2 recovery sequence |
| test:integration | PASS — 39/39 (2 test files, real PostgreSQL) |
| build | PASS |

## Post-merge verification (on main, commit be21626 — identical tree to the feature branch; fast-forward)

- typecheck — PASS (re-run on main after merge)
- lint — PASS (re-run on main after merge)
- build — PASS (re-run on main after merge)
- test:unit / test:integration — not re-run separately on main; fast-forward means main's tree is byte-identical to the already-verified be21626, so the pre-merge results above apply unchanged
- S-01 regression: ZERO — `tests/integration/item-postgres.test.ts` (13/13) passed within the same test:integration run that validated S-02
- S-02 UOM Master: working — `tests/unit/uom-api.test.ts` + UOM Master section of `tests/integration/uom-brand-pack-postgres.test.ts`
- S-02 Brand Master: working — `tests/unit/brand-api.test.ts` + Brand Master section of the same integration suite
- S-02 Pack Variant: working — `tests/unit/pack-variant-api.test.ts` + Pack Variant section of the same integration suite, including branch-isolated reads and the 12-way concurrent duplicate-creation race test
- base_uom migration/FK: correct — base_uom migration safety-refinement integration tests (case-insensitive/trimmed backfill, FK integrity, legacy text preserved)
- Migration recovery path: executable — "BLOCKER 2: complete executable recovery" integration test, run through the real authoritative migrate command (`--no-single-transaction`)
- Pack Variant reads: branch-isolated — confirmed (round-1 BLOCKER 1 fix; regression-tested in the round-3 suite)
- runtime-grants authoritative path: intact — integration tests provision roles from the shipped `scripts/runtime-grants.sql` via the shared test helper, no independent grant definitions
- Concurrent duplicate Pack Variant protection: tested — 12-way concurrent creation test, DB unique constraint as the race-safe mechanism
- Audit immutability: intact — audit triggers unchanged from S-01/S-02 implementation, exercised by existing audit tests
- Out-of-scope functionality: none introduced — Supplier Master, Purchasing, stock movement, costing, expiry/lots, production, reports remain absent from `backend/src` at merge time

## Independent review

Codex — **PASS — corrections verified; ready for controlled merge to main** (round-3 corrected candidate, commit be21626). Owner-confirmed in this session.

## S-02 completion status

S-02 is now officially COMPLETE on main: implementation + tests + independent review (Codex PASS) + owner-approved merge + post-merge verification are all satisfied.

## Next recommended action

Do not start S-03 automatically. Recommended next steps, per project roadmap: (1) independently review the parallel frontend branch (`feat/ui-foundation-item-master`, commit d491ede) before merging it, (2) continue Figma visual-design refinement in parallel, (3) only then scope S-03 (likely Supplier/Purchasing foundation) from this stable main.

---

## Historical handoff records

### S03-IMPL-001 (Inventory S-03 Supplier Master, Purchase Record, Rate Comparison — pre-review history)

Date: 2026-09-25. Branch: feat/inv-s03-purchasing-supplier-foundation. Base: main (c463e8a, S-02 already merged).
Authority: owner-approved "Inventory S-03: Purchasing & Supplier Foundation" scope, relayed in-conversation by the Manager session, explicitly excluding Purchase Orders, GRN, Supplier Ledger, Payments, rate-increase alerts, custom date-range comparison, negative-stock/backdating-cancellation/return handling, and costing/valuation. Full traceability: docs/engineering/inventory-s03-implementation.md.
Roles: Claude Code = primary implementation agent (this record, Manager-led per the persisted multi-agent operating model). Codex = independent reviewer, **not yet run** for this slice. Google Antigravity = third-priority fallback/review, not used this session.

## Implementation summary

- Commit 637441d — `feat(inventory): implement S-03 Supplier Master, Purchase Record and Rate Comparison`
- Commit 0e3f7ed — `test(inventory): add S-03 unit/integration tests, update S-01/S-02 buildApp wiring and migration-count assertions`
- This commit — documentation (backend/README.md API contract, this handoff entry, docs/engineering/inventory-s03-implementation.md)

Files created: `backend/src/inventory/{domain,application,persistence,api}/{supplier,purchase-record}*.ts` (12 files), `backend/migrations/202609250001_inventory_s03_purchasing_supplier.sql`, `backend/tests/unit/{supplier,purchase-record}-api.test.ts`, `backend/tests/integration/purchasing-supplier-postgres.test.ts`, `docs/engineering/inventory-s03-implementation.md`.
Files modified: `backend/src/app.ts`, `backend/src/server.ts` (wire the two new repositories/services/routes), `backend/scripts/runtime-grants.sql` (extended, single authoritative source), `backend/README.md` (new API contract sections), `backend/tests/unit/{item,uom,brand,pack-variant}-api.test.ts` and `backend/tests/integration/{item,uom-brand-pack}-postgres.test.ts` (mechanical updates only — satisfy `buildApp`'s now-required options, and two pre-existing exact-migration-list assertions updated to include the new S-03 migration file; no S-01/S-02 behavior changed).

## API added

- `POST /api/inventory/suppliers`, `PATCH /api/inventory/suppliers/:id`, `GET /api/inventory/suppliers`
- `POST /api/inventory/purchases`, `GET /api/inventory/purchases` (no PATCH — intentionally absent, not merely permission-gated)
- `GET /api/inventory/purchases/rate-comparison?item_id=&brand_id=&pack_variant_id=`

## Security / authorization

- Reuses the existing `requireItemEditor` (Owner/Manager) unchanged for every new route.
- One new rule: `SupplierService.update` additionally requires `role === 'OWNER'` specifically when the PATCH body includes `active`, even bundled with another field in the same request — tested at both unit and integration level.
- Branch isolation for Purchase Record (create, list, rate-comparison) follows the exact Pack Variant pattern (join to `item_master`, filter by `AuthContext.branchId`, same non-leaking 404), which is the precise regression class S-02's round-1 BLOCKER 1 was; a named regression-guard integration test exists for all three paths.
- Runtime grants: Purchase Record has no UPDATE grant in `scripts/runtime-grants.sql` at all (create-only by design, enforced at three independent layers: no route, a DB trigger, and no grant).

## Audit

- `supplier_audit`: same append-only/immutable pattern as `brand_audit`/`uom_audit` (CREATE and UPDATE actions).
- `purchase_record_audit`: same immutability pattern, constrained to `action = 'CREATE'` only (no UPDATE ever recorded, matching Purchase Record having no edit path).

## Verification results (real PostgreSQL; see note on environment below)

| Check | Result |
|---|---|
| npm ci --ignore-scripts | Completed — dependencies reconciled cleanly (EBADENGINE warning only, see note below) |
| typecheck | PASS |
| lint | PASS |
| build | PASS |
| test:unit | PASS — 261/261 (6 test files) |
| migrate:check | PASS — dry-run applies all four migrations (S-01, S-02 × 2, S-03) cleanly against a fresh database |
| migrate | PASS — real apply, `--no-single-transaction`, same authoritative command as `npm run migrate` |
| test:integration | PASS — 61/61 (3 test files: 13 S-01 + 26 S-02 + 22 S-03), real PostgreSQL |

S-01/S-02 regression: ZERO behavioral changes — all 13 S-01 and 26 S-02 integration tests pass unchanged (two assertions were mechanically updated to expect four applied migrations instead of three, since S-03 adds a fourth migration file; nothing about S-01/S-02 behavior itself changed). All 6 unit test files (261 tests) pass, including item/uom/brand/pack-variant suites updated only for the new `buildApp` option shape.

#### Environment note (read before trusting "Docker Desktop" in future handoffs)

This verification was **not** run against the owner's Docker Desktop PostgreSQL (compose.yaml), because the `mcp__remote-devices__device_bash` tool used for this session runs inside an isolated Linux VM on the owner's machine that cannot reach Docker Desktop's `127.0.0.1:5432` (a separate network namespace from the Windows host). Two further problems compounded this:

1. **npm on the mounted Windows drive**: `npm ci` directly against the OneDrive/Windows-mounted repo path failed with `EIO` deleting a Windows-native `esbuild.exe` binary, and the repo's existing `node_modules` was installed for `win32-x64`, not usable from this Linux VM regardless.
2. **No Docker, no root**: the Linux VM has no `docker` binary and no `sudo`/root access, so Docker Desktop could not be started or substituted from inside it by the usual means.

Resolution used: the backend source was `rsync`'d (excluding `node_modules`/`dist`) into a scratch directory inside the Linux VM, where `npm ci` was run fresh (correct Linux binaries). A real PostgreSQL 14 server (not a mock, not `pg-mem`) was obtained without root by `apt-get download`-ing the Ubuntu `postgresql-14`/`libpq5` `.deb` packages (no install, no dpkg lock needed) and extracting them with `dpkg-deb -x` into a user-owned prefix; `initdb`/`postgres` were run directly as the unprivileged session user, listening on `127.0.0.1:5544`. All commands above ran against this real, disposable PostgreSQL instance. **This instance and its data do not persist** — it exists only for the duration of this session's shell calls and is not the owner's actual local Postgres. The owner's real Docker Desktop `erp_local`/`erp_test` databases were never touched, read, or modified.

**Node version**: this Linux VM only has Node 22.23.2 available (`npm run typecheck`/`lint`/`test:*`/`build` all ran under it), not the Node 24 the repo's `engines` field requires (`npm ci` printed an `EBADENGINE` warning, non-fatal). All checks passed under Node 22; they have not been separately re-verified under Node 24. This gap is exactly what S03-MERGE-001 (above) closed by re-running the full verification list on the owner's actual Docker Desktop PostgreSQL and Node 24, both pre- and post-merge, with identical results.

## Real bug found and fixed during this implementation (not a test-environment artifact)

`Date.parse()`/`new Date(...)` in Node do **not** reject an invalid calendar date given as an ISO date-only string — `Date.parse('2026-02-30')` silently rolls over to March 2 instead of failing. The first version of `purchase_date` validation relied on this and would have silently accepted invalid dates like "2026-02-30" as if they were valid. Caught by writing a unit test for it, then fixed with manual days-in-month/leap-year validation (`isValidCalendarDate` in `backend/src/inventory/domain/purchase-record.ts`) instead of trusting `Date` parsing. Covered by both unit and integration tests.

## Independent review (superseded — see S03-MERGE-001 above)

At the time this entry was written: **not yet performed**. Per AGENTS.md/DEFINITION-OF-DONE, this slice was implementation-complete and self-tested only; Codex (or Google Antigravity as fallback) independent review was required before this could be considered mergeable, and self-review by Claude Code did not satisfy that gate. This was later satisfied by an in-house QA/Testing subagent review (PASS) once Codex/Google Antigravity were paused by the owner — see S03-MERGE-001.

## Open questions / judgment calls (technical, not business-rule invention)

1. Rate Comparison's exact JSON response shape (field names, `records_considered`, null-degradation) was designed from the plain-language description in scope, since no exact contract was specified. See docs/engineering/inventory-s03-implementation.md for the full list of judgment calls, including the read-only Rate Comparison endpoint also validating the item/brand/pack_variant combination consistency (400 INVALID_REFERENCE on mismatch), which is a technical extension of the Purchase Record create validation for consistency, not a business rule.
2. None of these affect underlying data, security, or business logic, and none are blocking — flagged for Manager/owner awareness, not as a stop condition.

### S02-IMPL-001 (Inventory S-02 UOM/Brand/Pack Variant Implementation Verified — pre-merge review history)

Date: 2026-09-18 (updated same day with independent-review corrections, two rounds). Branch: feat/inv-s02-uom-brand-pack. Base: main (163c953, S-01 already merged).
Authority: owner-approved "Inventory S-02: UOM, Brand & Pack Variant Masters" scope and its approved architecture/implementation plan, including the owner-directed safety refinement to the base_uom migration (never guess unit_type for an unmatched legacy value). ADR-0001..0006 unchanged; ADR-0007 records the S-02 technical decisions, including all review-driven corrections (D-08, D-09, and the round-2 update to D-05). Full traceability: docs/engineering/inventory-s02-implementation.md.
Roles: Claude Code = primary implementation agent (this record, Manager-led per the persisted multi-agent operating model). Codex = independent reviewer. Google Antigravity = third-priority fallback/review, not used this session.

## Original candidate and independent review — round 1: FAIL

Commit `989208c` was submitted for independent Codex review. **Verdict: FAIL** — 2 BLOCKER, 3 MINOR findings:

- **BLOCKER 1**: `PackVariantRepository.list()` returned every branch's pack variants; the service validated the caller's role but discarded `AuthContext.branchId` instead of using it to scope the read.
- **BLOCKER 2**: the single-transaction migration's documented recovery path ("add the missing UOM then rerun") was not actually executable — a halt rolled back `uom_master` along with everything else, so there was nothing left to add the missing UOM to.
- **MINOR 1**: `uom.ts`/`brand.ts` contained a literal NUL byte (from a file-write encoding issue) where the 6-character escape text `\u0000` was intended.
- **MINOR 2**: integration tests duplicated `GRANT` statements instead of exercising the shipped `scripts/runtime-grants.sql`, and had already drifted from it (extra `SELECT` on audit tables the shipped script never granted).
- **MINOR 3**: no test proved the Pack Variant duplicate-conflict race was actually safe under concurrency (only sequential/`allSettled`-without-scale coverage existed for that specific path).

## Corrections applied — round 2

All five fixed on this same branch, no scope expansion, no business rule change:

- **BLOCKER 1 fix**: `PackVariantRepository.list(auth: AuthContext)` now joins `pack_variant` to `item_master` and filters `WHERE item_master.branch_id = $1` (auth.branchId), exactly mirroring how `create`/`update` already scoped writes. `pack-variant-service.ts`'s `list()` now forwards the validated `AuthContext` from `requireItemEditor` instead of discarding it. Reviewed every Pack Variant read path in `backend/src` (grep for `pack_variant`): only `list()` existed and needed fixing; `create`/`update` already returned only the single, branch-checked affected row.
- **BLOCKER 2 fix**: the single migration file was split into two, each node-pg-migrate's own transaction — `202609180001_inventory_s02_uom_brand.sql` (UOM Master, Brand Master, their audit tables, seeds; commits independently) and `202609180002_inventory_s02_item_base_uom_pack_variant.sql` (base_uom backfill + safety halt, Pack Variant; depends on the first). A halt in the second migration now rolls back only itself — `uom_master`/`brand_master` remain committed, so an operator can `INSERT` the missing UOM with a chosen `unit_type` and re-run the second migration successfully. Verified three ways: manually against real PostgreSQL (full halt -> inspect -> insert -> re-run sequence, by hand, before any test code existed); an integration test proving Migration A survives a Migration B halt; a separate integration test executing the complete 7-step recovery sequence end to end (apply A, insert unmatched fixture, halt B, confirm `uom_master` intact with all 12 rows, insert the missing UOM explicitly, re-run B, confirm backfill + FK + preserved legacy text + the recovered item fully usable through a freshly-provisioned runtime-role connection).
- **MINOR 1 fix**: both literal NUL bytes replaced at the byte level (PowerShell `[System.IO.File]::ReadAllBytes`/`WriteAllBytes`, not the Write/Edit tools, since those appear to interpret a `\u0000` escape sequence passed as tool-call text rather than preserving it literally — noted for future sessions). Verified via `git diff --stat` that both files are ordinary text again (previously showed as `Bin ... -> ... bytes`). Scanned every file under `backend/src`, `backend/tests`, `backend/migrations`, `backend/scripts` for additional NUL bytes: none found.
- **MINOR 2 fix**: added `tests/integration/helpers/runtime-grants.ts`, which reads the actual shipped `scripts/runtime-grants.sql` and substitutes its `:"runtime_role"`/`:"schema_name"` psql variables (the same way `psql -v` would) before executing it verbatim. `scripts/runtime-grants.sql` gained a `:"schema_name"` variable (previously a hardcoded `GRANT USAGE ON SCHEMA public`) so one file now serves both real deployment and a test's own per-run isolated schema. Both integration test files now provision their runtime role this way; no independent grant list remains anywhere in the test suite. A dedicated test proves a full create+edit cycle across all four entities using only the shipped grants.
- **MINOR 3 fix**: added a 12-way concurrent identical Pack Variant creation test (`Promise.allSettled`) proving exactly one attempt succeeds and the other 11 fail with `409 DUPLICATE_PACK_VARIANT`, with the database unique constraint as the actual race-safe mechanism (not just a pre-check).

One additional bug was found and fixed **in this round's own new test code**, not in application code: the BLOCKER 2 recovery test's dynamically-created runtime role name was not actually unique (derived from a fixed string suffix) and was never dropped (roles are cluster-wide, not removed by `DROP SCHEMA CASCADE`), so a second run of the suite failed with `role already exists`. Fixed with a fresh `randomUUID()`-based role name and an explicit `DROP OWNED BY` + `DROP ROLE` in the test's cleanup. Verified stable across two consecutive full integration runs after the fix.

## Independent focused re-review — round 2: FAIL (1 remaining BLOCKER)

Commit `507b8be` (the round-1 correction) was submitted for a focused re-review of the BLOCKER 2 fix specifically. **Verdict: FAIL** — 1 remaining BLOCKER, confirmed by real PostgreSQL reproduction:

- The two-migration split was real, but the *authoritative* migration command (`npm run migrate`, i.e. node-pg-migrate's `up` with no override) still wraps every pending migration applied in one invocation into a single outer transaction, because `--single-transaction` defaults to `true`. The round-1 tests had only ever exercised the split via separate, manually-invoked `runner()` calls (using `count` to force transaction boundaries by invocation) — never the real command applying both S-02 migrations together in one go. Reviewer's real-PostgreSQL reproduction confirmed: Migration B halted as expected, but Migration A did **not** remain committed; `uom_master` was absent afterward; only S-01 remained recorded. The documented recovery procedure was therefore still not actually executable through the normal command.

## Corrections applied — round 3

- **Root cause fix**: added `--no-single-transaction` to both `migrate` and `migrate:check` in `backend/package.json` — the single authoritative place this setting is controlled. Confirmed via `node node-pg-migrate.js --help` that `--single-transaction` defaults to `true` ("Combines all pending migrations into a single database transaction so that if any migration fails, all will be rolled back").
- **Test harness fix**: replaced every programmatic `runner()` invocation (including the `count`-based artificial invocation-splitting the round-2 review specifically flagged as not representative) with `tests/integration/helpers/migrate-cli.ts`, which spawns the real `node-pg-migrate` CLI binary with the exact same arguments `npm run migrate` uses. This is now the single source of truth for migration execution behavior in tests — both integration test files' setup and all three migration-safety tests use it exclusively. `up [migrationName]` (node-pg-migrate's own positional argument) is used only to establish a realistic "as if only S-01 had been applied" starting precondition, never to split the actual S-02 recovery sequence under test.
- Re-verified the complete recovery sequence twice: manually by hand against real PostgreSQL using the literal `npm run migrate` command (via a temporary schema/role, no test code involved), and by the rewritten automated integration test, both confirming: Migration A commits and is recorded in `pgmigrations`, `uom_master` retains all 12 seeded rows, Migration B halts and is *not* recorded; after explicitly classifying the missing UOM, re-running the identical `npm run migrate` command succeeds, backfills `base_uom_id` correctly, the FK exists, `base_uom_legacy_text` is preserved, `pack_variant`/`pack_variant_audit` exist, and the recovered item is fully usable through a normally-provisioned runtime-role connection.
- All round-1 and round-2 fixes (branch-safe Pack Variant reads, NUL-byte cleanup, runtime-grants authoritative usage, concurrent duplicate Pack Variant test, audit immutability, S-01 regression safety) remain intact and re-verified.

## Scope of this record (cumulative, all three rounds)

New: two migration files (replacing the original single one — `202609180001_inventory_s02_uom_brand.sql`, `202609180002_inventory_s02_item_base_uom_pack_variant.sql`); domain/application/persistence/API modules for UOM, Brand, Pack Variant; `persistence/transaction.ts` (shared transaction helper, extracted from `pg-item-repository.ts`); `tests/integration/helpers/runtime-grants.ts`; `tests/integration/helpers/migrate-cli.ts` (round 3); `tests/unit/{uom,brand,pack-variant}-api.test.ts`; `tests/integration/uom-brand-pack-postgres.test.ts`; `docs/decisions/ADR-0007-...md`; `docs/engineering/inventory-s02-implementation.md`.

Modified (round 3 additions in italics): `backend/src/app.ts`, `server.ts` (wire the three new services/repositories/routes); `backend/src/inventory/persistence/pg-item-repository.ts` (resolves `base_uom` string <-> `base_uom_id` FK internally; `ItemRepository` interface and `item-service.ts` unchanged); `backend/src/inventory/application/pack-variant-repository.ts` / `pack-variant-service.ts` / `persistence/pg-pack-variant-repository.ts` (BLOCKER 1 fix); `backend/src/inventory/api/routes.ts` renamed to `item-routes.ts`; `backend/scripts/runtime-grants.sql` (MINOR 2 fix); *`backend/package.json` (round 3: `--no-single-transaction` on `migrate`/`migrate:check`)*; `tests/unit/item-api.test.ts` (setup helper only, zero behavioral changes, all 82 original assertions unchanged); `tests/unit/pack-variant-api.test.ts` (BLOCKER 1 unit coverage); *`tests/integration/item-postgres.test.ts` (round 3: setup now spawns the real CLI via `migrate-cli.ts`; migration-assertion now queries `pgmigrations` directly instead of counting `runner()`'s return value; grants via the shared helper; two new tests for base_uom resolution/FK integrity; all 11 original tests unchanged)*; *`tests/integration/uom-brand-pack-postgres.test.ts` (round 3: main setup and all three migration-safety tests rewritten around the real CLI helper)*; `backend/README.md` (round 3: documents `--no-single-transaction` and why); ADR-0007 (round 3: D-05 update note); root `README.md`; `docs/requirements/inventory-acceptance-criteria.md` (AC-04 status note appended, original approved wording unchanged).

No business rule, requirement, or existing ADR was changed. No S-02 scope expansion — Supplier Master, Purchase Orders, GRN, Supplier Ledger, Payments, Purchase Rate History, Rate Alerts, Stock In/Out, Transfers, Kitchen Issues, Lots/Expiry, Reorder, Stock Valuation, Moving Average/actual-batch costing, Barcode/QR, Production/Recipe, and Reports/Dashboards are all confirmed absent from `backend/src`.

## Environment used for verification

Same Docker Desktop 29.8.0 / PostgreSQL 17.11 container (`ideal-tasty-point-s01-dev-postgres-1`) already running from S-01 verification, still healthy throughout all three rounds. `erp_local` for `DATABASE_URL`/`migrate:check`; `erp_test` for `TEST_DATABASE_URL`. The migration-safety tests create their own short-lived, self-contained schemas (dropped after each test; roles explicitly dropped too) to control exact starting preconditions — never touching `erp_local`/`erp_test`'s own schemas. Manual round-3 validation additionally used a throwaway schema inside `erp_local` with the literal `npm run migrate` command, outside any test code.

## Verification results (all executed, not assumed — round 3, post-correction)

| Check | Command | Result |
|---|---|---|
| Dependency reconciliation | `npm ci --ignore-scripts` | PASS |
| Typecheck | `npm run typecheck` | PASS — `tsc --noEmit` (src) and `tsc -p tsconfig.test.json` (tests) both clean |
| Lint | `npm run lint` | PASS — 0 issues |
| Unit tests | `npm run test:unit` | PASS — 190/190 (unaffected by the migration-command fix) |
| Migration dry-run | `DATABASE_URL=...erp_local npm run migrate:check` | PASS — all three migrations listed with `--no-single-transaction` in effect, dry-run only |
| Integration tests | `TEST_DATABASE_URL=...erp_test npm run test:integration` | PASS — 39/39 across 2 files, all against real PostgreSQL 17.11 via the real CLI binary, no mocks, no programmatic-`runner()`-only shortcuts. Confirmed stable across two consecutive full runs. |
| Build | `npm run build` | PASS — `tsc` clean |

## S-02 acceptance-criteria coverage (evidence-backed)

Full detail in docs/engineering/inventory-s02-implementation.md's Requirement coverage table. Summary: UOM Master seed/custom/duplicate-protection/unit_type — unit + integration tests. Item Base UOM FK migration with an executable safety-refinement recovery path, now proven through the real authoritative migration command — direct manual testing + integration tests (including the full recovery sequence) + full S-01 regression. Brand Master global/no-forced-join-table — schema + integration test. Pack Variant identity/conversion/no-redundant-branch_id (writes **and reads**)/cross-branch-denial/duplicate-protection (including under real concurrency)/zero-variant-item-validity — unit + integration tests. Authorization/audit reuse — direct reuse of `requireItemEditor` and the existing immutable-audit trigger function.

## Security/authorization review (source-level, by implementer; independent review still required)

Parameterized queries throughout every new repository (no string-built SQL). `requireItemEditor` reused unchanged on every new route — no new trust path. Pack Variant branch enforcement verified for create/update/list alike under real integration tests. `conversion_factor` transported as a decimal string end-to-end. Duplicate-name races (UOM, Brand) and exact-duplicate Pack Variant races proven safe under real concurrent PostgreSQL load. DB triggers enforce audit/identity immutability on every new table even against the schema-owner connection. Runtime grants provisioned from the single shipped source in tests. Migration execution behavior now has exactly one authoritative source (`package.json`'s `--no-single-transaction`), exercised identically by real deployment and by the test suite. This is the implementer's own review and does not substitute for Codex's independent re-review of this corrected candidate.

## Remaining issues / blockers

None found after round-3 corrections. `base_uom_legacy_text` remains in place per the approved one-cycle safety-net design (ADR-0007 D-06) — its eventual drop is explicitly deferred, not a defect. No dedicated runtime DB role was created for real deployment in this session (not required for the checks run); `scripts/runtime-grants.sql` is updated, schema-parameterized, and exercised directly by the test suite itself.

## Next recommended action

Independent Codex re-review of the round-3 corrected candidate (new commit hash in git log), specifically re-confirming the migration recovery sequence through the normal authoritative command. Do not merge to main. Do not stage/commit beyond the bounded S-02 file set until that review passes, unless the owner directs otherwise.


### S-01-IMPL-001 (Inventory S-01 Backend Implementation Verified)

Date: 2026-09-18. Branch: feat/inv-s01-item-master. Base: 663662e.
Authority: current explicit S-01 implementation instruction; ADR-0001..0006; INV-11/12; approved AC-01/02/11 and applicable PC-09 (see docs/engineering/inventory-s01-implementation.md for full traceability).
Roles: Claude Code = primary implementation agent (this record). Codex = next independent reviewer (not yet run). Google Antigravity = third-priority fallback/review; was the original implementer of the backend/ source under review here and is stopped/not modifying the repository during this record.

## Scope of this record

Covers: (1) correcting a `backend/package.json` manifest inconsistency discovered during independent review (drifted to a stale/foreign version mismatching `package-lock.json`, installed `node_modules`, `backend/README.md`, and the implemented source — see git diff for the single-file fix), and (2) full technical verification of the pre-existing Inventory S-01 Item Master backend (`backend/`) against a real PostgreSQL instance. No business rule, requirement, or ADR was changed. No S-01 scope expansion. Files touched by Claude Code in this record: `backend/package.json` only (dependency/script correction). All other `backend/` source, tests, and migration were pre-existing and unmodified.

## Environment used for verification

- Docker Desktop 29.8.0 (WSL2 backend, Ubuntu WSL distro) newly installed on this Windows 11 workstation by the owner for this verification.
- `docker compose -f backend/compose.yaml up -d postgres` → container `ideal-tasty-point-s01-dev-postgres-1`, image `postgres:17` (actual server: PostgreSQL 17.11), bound to `127.0.0.1:5432` only, reported `healthy`.
- Database `erp_local` (created by compose) used for `DATABASE_URL`/`migrate:check`; database `erp_test` (created manually via `psql` inside the container, matching `.env.example`'s documented convention) used for `TEST_DATABASE_URL`. Both accessed via the `postgres` superuser for local, disposable, loopback-only verification — never a production or shared connection.
- No dedicated runtime role was provisioned for this record (not required for `migrate:check`/`test:integration`; `scripts/runtime-grants.sql` remains the documented path for actually running `npm run dev`, out of scope here).

## package.json correction

Before: `backend/package.json` contained an inconsistent, older dependency/script set (fastify ^4.28.1, zod ^3.23.8, pg-mem, @fastify/cors, split `@typescript-eslint/*` packages, missing `test:unit`/`test:integration`/`migrate:check` scripts) that matched neither `package-lock.json` nor the installed `node_modules` nor the implemented source (e.g. `src/inventory/domain/item.ts` uses `z.uuid()`, valid only in Zod v4).

After: `backend/package.json` restored to match `package-lock.json`'s root manifest exactly (dotenv ^17.4.2, fastify ^5.12.5, pg ^8.23.0, zod ^4.6.5; devDependencies @types/node ^22.20.3, @types/pg ^8.23.1, eslint ^10.10.0, node-pg-migrate ^9.0.0, tsx ^4.23.13, typescript ~5.9.3, typescript-eslint ^8.70.0, vitest ^5.0.1); scripts restored to `typecheck` (runs both `tsconfig.json` and `tsconfig.test.json`), `lint` (lints `src` and `tests`), `test:unit`, `test:integration`, `migrate`, `migrate:check` — all using `node --env-file-if-exists=.env node_modules/node-pg-migrate/bin/node-pg-migrate.js`, no shell-specific `$VAR` syntax, verified Windows/PowerShell-compatible. `npm ci --ignore-scripts` confirms package.json/package-lock.json/node_modules are in sync (exit 0, 0 vulnerabilities).

## Verification results (all executed, not assumed)

| Check | Command | Result |
|---|---|---|
| Dependency reconciliation | `npm ci --ignore-scripts` | PASS — 221 packages, 0 vulnerabilities |
| Typecheck | `npm run typecheck` | PASS — `tsc --noEmit` (src) and `tsc -p tsconfig.test.json` (tests) both clean |
| Lint | `npm run lint` | PASS — ESLint over `src` and `tests`, 0 issues |
| Unit tests | `npm run test:unit` | PASS — 82/82 tests (Fastify inject, mocked repository) |
| Migration dry-run | `DATABASE_URL=...erp_local npm run migrate:check` | PASS — real PostgreSQL 17.11, single migration `202609170001_inventory_s01` planned cleanly, dry-run only |
| Integration tests | `TEST_DATABASE_URL=...erp_test npm run test:integration` | PASS — 11/11 tests against real PostgreSQL 17.11 (no mock/pg-mem). Covers: migration idempotency, atomic create/edit with audit snapshots, 24-way concurrent cross-branch item_code uniqueness, row-locked concurrent edits preserving disjoint fields, cross-branch update denial, manual item_code/identity mutation rejection at the DB layer, mandatory-field/single-type DB constraints, audit UPDATE/DELETE/TRUNCATE rejection even from the schema-owner connection, restricted runtime-role privilege limits (sequence reset, trigger disable, truncate, delete all denied), transactional rollback on audit-insert failure without recycling the consumed code, and six-digit-boundary code growth |
| Build | `npm run build` | PASS — `tsc` clean |

No check was reported PASS without executing to completion. No PostgreSQL check was substituted with pg-mem or another in-memory emulator.

## S-01 acceptance-criteria coverage (evidence-backed)

AC-01 (mandatory fields, both roles), AC-02 (exactly one Primary Item Type) — unit + integration tests. O-01 (global item_code uniqueness independent of branch_id) — 24-way concurrent integration test. O-02 (ITM-###### sequence, no manual override, no COUNT/MAX) — migration trigger + integration tests (manual insert/edit rejection, six-digit growth). O-03 (injected AuthContext only, no client-controlled header) — unit tests (spoofed header rejection, service-level bypass attempts). INV-11/PC-09 (Owner/Manager only, other roles/blank context denied) — unit tests. AC-11 (immutable append-only audit, same-transaction atomicity, rollback on audit failure) — integration tests. branch_id awareness (update scoped by id+branch, cross-branch 404, audit branch match) — integration tests. Out of scope and not implemented, per ADR-0002: archive/deactivate, stock, transfers, purchasing, expiry/lots, production, POS/KDS, costing, reorder, Redis, full auth/session, customer/rider/waiter apps — confirmed absent from `backend/src`.

## Security/authorization review (source-level, by implementer; independent review still required)

Parameterized queries throughout `pg-item-repository.ts`/`item-audit.ts` (no string-built SQL) — no SQL injection surface found. `requireItemEditor` re-validates role/context on every request independent of transport; no header-derived trust path exists in `src/`. Row-level `FOR UPDATE` lock on edit prevents lost updates under concurrency (verified). Sequence-based code generation avoids COUNT/MAX races (verified under load). DB triggers enforce audit/identity immutability even against the schema-owner connection (verified), and runtime-role grants exclude destructive privileges (verified). Error handler logs only error name, never SQL/connection-string detail (verified by unit test asserting no secret leakage in 500 responses). This is the implementer's own review and does not substitute for Codex's independent pass.

## Remaining issues / blockers

None found in this verification pass. Outstanding, pre-existing, out-of-scope items unrelated to this record: the architecture/security-baseline "overall consistency FAIL" findings from ARCH-001 below remain unresolved and are not S-01 blockers (S-01's own identity/security requirements were already satisfied per ADR-0005 §"Relation to S-01"). No dedicated runtime DB role was created in this session (not required for the checks run); required before any real `npm run dev` usage.

## Next recommended action

Independent review by Codex, per the project's agent priority order. Do not merge to main. Do not stage/commit beyond the bounded S-01 file set until that review completes, unless the owner directs otherwise.

*(Historical note added at merge time, not part of the original record above: Codex subsequently reviewed commit 3a964af and returned PASS — ready for controlled merge to main. The merge was performed with explicit owner approval. Everything above this note is preserved exactly as originally written.)*

### GOV-001 (Multi-Agent Operating Model Persisted)

Date: 2026-09-18. Branch: docs/multi-agent-operating-model. Base: main (663662e).
Documentation-only governance task: formalized the already-owner-approved Manager-led multi-agent operating model as a permanent repository standard, so future sessions apply it automatically. Application tests/lint/type checks: NOT APPLICABLE (documentation only, no application toolchain touched).

Files created: docs/engineering/MULTI-AGENT-OPERATING-MODEL.md — dynamic agent-count scaling by task size, an extended specialist role catalog (additive to AGENT-ROLES.md's six core roles), the escalation policy (routine-vs-owner-escalation list), the Agent Execution Report format, and the external-tool priority order (Claude Code primary, Codex second for independent review/backup implementation, Google Antigravity third fallback) with an explicit clause that this priority never reduces reviewer independence.

Files modified: AGENTS.md (one new bullet under the top policy referencing dynamic scaling and linking the new doc; one new line in the reference-document list) — no existing guardrail text changed or removed. docs/engineering/AGENT-ROLES.md (one added cross-reference sentence). docs/engineering/CURRENT-HANDOFF.md (this record, at the time it was written).

No business requirement, ADR, or existing guardrail was changed. No conflicts found with AGENTS.md or the existing engineering docs (TASK-HANDOFF-PROTOCOL.md, REVIEW-WORKFLOW.md, BRANCHING-AND-REVIEW.md, DEFINITION-OF-DONE.md, AI-CODING-GUARDRAILS.md, AGENT-ROLES.md) — the new document defers to them for independence, handoff, branching, and completion rules rather than restating or altering those rules. Independent review of this documentation-only change was required before any merge, per REVIEW-WORKFLOW.md's documentation-only applicability clause. That review (Codex) returned PASS on the corrected candidate (commit cf0fadc, after narrowing two MAJOR authority-ambiguity findings on Git and dependency autonomy), and this record was merged into main at commit 5569037.

### ARCH-001 (Architecture + Security Approved)

Date: 2026-09-17 (updated). Branch: docs/architecture-decision-proposal.
Base revision: 5ed0690 (Merge branch 'docs/inventory-implementation-readiness').
Candidate: five architecture/security documentation files including this handoff; nothing staged. This correction task changes only identity-security-baseline.md and CURRENT-HANDOFF.md.
State: previous independent documentation review FAIL. Three owner-authorized consistency issues corrected and independently re-reviewed: scoped corrections PASS in requirements, architecture and security. Overall baseline consistency FAIL in all three reviews due to remaining outside-scope findings. No implementation authorization.

## Task scope and identities

Owner provided explicit approved architecture decisions (Option B) and a complete identity/security baseline. Root Manager applied these decisions to the relevant documents. The prior review identified wording beyond approved business authority; this correction is limited to the three explicitly authorized findings. No technology installed. No application code written.

Allowed files created (this update):
- docs/decisions/ADR-0005-identity-security-baseline.md
- docs/architecture/identity-security-baseline.md

Allowed files modified (this update):
- docs/decisions/ADR-0004-technical-architecture-proposal.md — status changed from PROPOSAL to APPROVED; all 7 sub-decisions recorded
- docs/architecture/ARCHITECTURE.md — approved stack and security baseline sections added
- docs/engineering/CURRENT-HANDOFF.md — this evidence record

Exclusions: existing approved requirements (inventory-module.md), ADR-0001/0002/0003, root AGENTS.md, README, inventory readiness documents, application code, framework/runtime/database/dependencies. DB/data changes: none. Installs: none. Git staging/commit: not authorized yet.

## Approved decisions summary

### Architecture (ADR-0004 — APPROVED)
- Option B: React (Vite) + Tailwind + PWA / Fastify (Node.js/TypeScript) / PostgreSQL + Redis / REST + OpenAPI + WebSocket
- Deployment: Hybrid (Docker Compose dev/staging + cloud/local production)
- Offline: Critical operations local-first with auto-sync; full offline NOT required
- Multi-branch: Shared PostgreSQL with branch_id tenant separation
- Client: PWA first; native mobile later if genuinely required

### Identity/Security (ADR-0005 — APPROVED)
- Individual accounts; no shared logins; RBAC + per-user overrides
- Branch-scoped access; branch switch re-checks permissions
- JWT with refresh tokens; session/device tracking; lockout controls; optional 2FA for Owners/Admins
- API-level enforcement; least privilege; separation of duties
- Offline: permission cache for operational actions; high-risk actions blocked offline
- Audit trail for sensitive actions; security logs separate from app logs
- No plaintext secrets; separate staff and customer identity scopes

## S-01 blocker status

| Previous blocker | Status now |
|---|---|
| Approved technical architecture | ✅ CLOSED — ADR-0004 approved |
| Identity/security design | ADR-0005 policy approved; scoped corrections PASS; overall consistency FAIL due to remaining findings |
| B-09 permission matrix (S-01 portion) | ⚠️ Low risk — Owner/Manager create/edit settled via INV-11/ADR-0001/ADR-0005. Full matrix (B-09) needed before later slices. |

S-01 readiness is not asserted. Architecture selection remains approved; overall security/documentation consistency has unresolved findings outside this correction scope.

## Checks and risks

Protected files verified unchanged: inventory-module.md, ADR-0001/0002/0003, AGENTS.md, README. Whitespace check: PASS (pre-existing CRLF on ARCHITECTURE.md is not new). Previous independent review: FAIL (baseline_review). Three corrections applied by root Manager: immediate centralized session/token invalidation without expiry delay; action-specific separation of duties with Owner-only archive and OPEN stock-adjustment authority; conditional MAY re-authentication wording. Fresh independent reviews completed on the corrected candidate: requirements_review (requirements), architecture_review (architecture), baseline_review (security). Each returned scoped corrections PASS and overall consistency FAIL. Reviewers made no edits. Remaining findings are recorded below; they are outside the authorized corrections.

Application tests/lint/type checks: NOT APPLICABLE — documentation only; agreed by all three independent reviewers. Local git diff --check passed; tracked requirements and ADR-0001/0002/0003, AGENTS.md and README.md have empty diffs; staging remains empty. This task wrote only identity-security-baseline.md and this handoff; untracked ADRs are not covered by tracked diff evidence. DB/data changes: none. Dependencies: none.

Risks:
- Lockout thresholds, password policy, 2FA method, and permission matrix (B-09) remain open operational/configuration decisions before affected implementation
- Hybrid deployment specifics (provider, server specs, SSL) deferred to implementation
- Customer identity implementation is future scope

## Remaining review findings — outside this correction scope

- Identity baseline RBAC role union and per-user grant/deny precedence are asserted without distinguishing approved policy from proposed design; non-overridable Owner-only and S-01 role restrictions must remain protected.
- Brand-override example assigns an approval workflow while INV-08/D-06 remain open. Admin session-termination authority and future waiter permissions also require traceability to approved authority.
- Waiter identity scope differs between the identity diagram, client table and ADR-0005 wording; do not resolve that scope by assumption.
- ADR-0004 describes auth as stateless without distinguishing token format from required centralized revocation/session enforcement.
- ARCHITECTURE.md still says all architecture content is pending despite the approved stack above.
- ADR-0005's S-01 readiness wording needs reconciliation with unresolved overall consistency findings; approval of the baseline is not evidence that every detailed design statement passed review.

Stock-adjustment approval/authority remains an OPEN BUSINESS DECISION (D-04/B-06/B-09). Broader brand and per-action permissions remain open for their affected capabilities. No new authority, approval workflow or technology was selected in this correction.

## Next recommended action

Fresh reviews completed; report scoped PASS and overall FAIL separately. Wait for owner direction on remaining outside-scope findings and approval before any subsequent staging/commit. Do not stage, commit, merge, push, install or start coding in this task.

Proposed commit message:

```
docs: approve architecture and security baseline (ADR-0004/0005)

- ADR-0004: Option B approved (React/Vite/Fastify/PostgreSQL/Redis/PWA/TypeScript)
- ADR-0005: Identity and security baseline approved
- identity-security-baseline.md: detailed security architecture document
- ARCHITECTURE.md: approved stack and security summary added
- CURRENT-HANDOFF.md: evidence record for architecture approval
```

### ARCH-001 — Architecture Proposal (prior state)

Date: 2026-09-17. Branch: docs/architecture-decision-proposal.
State at prior step: ADR-0004 created as PROPOSAL; CURRENT-HANDOFF.md modified. Owner selected Option B.

### INV-READY-001 — Inventory Readiness (merged)

Branch: docs/inventory-implementation-readiness → merged at 5ed0690.
Commit 9bbadb4: readiness specification with B-01/B-02 closure. 8 files.

### WF-001 — Multi-Agent Workflow Documentation (merged)

Branch: docs/multi-agent-workflow → merged at 64f0af2.
Commit 5728edb: 4 workflow docs + AGENTS.md references.
