# Current Handoff — UI-SHELL-V2-MERGE-001 (ERP Shell v2 + UI-AI-001 design record merged to main)

Date: 2026-10-03. Branch: main. Track: PARALLEL TRACK (frontend + docs only — no backend, migration, API or auth change).
Authority: explicit owner approval in the Cowork Manager session ("han kr do"), after UI-SHELL-V2-REVIEW-001 (independent QA/Testing subagent, PASS; 4 MINOR fixed in 4cba3b7), re-verification d1445db (PASS) and owner push of `feat/ui-shell-v2` (origin == d1445db, confirmed with `git ls-remote`). Same-provider review limitation applies (Codex/Antigravity paused, GOV-MANAGER-SUBAGENT-001).

## Merges

| # | Source | Type | Result |
|---|---|---|---|
| 1 | `feat/ui-shell-v2` @ d1445db | fast-forward (`git merge --ff-only feat/ui-shell-v2`) | main 5b39a3c → d1445db; 17 files, +1624/−426 (15 `frontend/src`, `frontend/index.html`, this file) |
| 2 | `docs/ui-ai-001-figma-approval` @ e8ed9c7 | merge commit (`git merge --no-ff`; fast-forward no longer possible) | dd7c9a5; adds `docs/engineering/ui-ai-001-ai-assistant-design.md` |

Conflict (merge 2): `docs/engineering/CURRENT-HANDOFF.md` only — both branches prepended a top section. Resolved by keeping both: UI-AI-001 above UI-SHELL-V2-001 (newest first), the older title demoted to "Previous handoff". Verified: vs `docs/ui-ai-001-figma-approval` the resolved file has only additions (+70/−0); vs d1445db the only removed line is the demoted title.

Pre-merge checks: main == origin/main == 5b39a3c; main an ancestor of both branches; `backend/` and `package.json`/lockfiles unchanged on both branches; no `.git/*.lock` left (one stale `index.lock` created by a VM `git status` was removed with owner-granted delete permission — only git lock files are deleted).

## Verification

Pre-merge (fresh clone of `feat/ui-shell-v2` @ d1445db, Cowork VM, Node v22.23.2 / npm 10.9.8): frontend `npm ci`, typecheck, lint, build PASS; vitest 13 files, 88/88 PASS; backend diff vs main empty.

Post-merge (fresh clone of main @ dd7c9a5, same VM):

| Check | Frontend | Backend |
|---|---|---|
| `npm ci` | OK | OK |
| typecheck | PASS | PASS |
| lint | PASS | PASS |
| build | PASS | PASS |
| vitest | 13 files, 88/88 PASS | unit: 15 files, 520/520 PASS (same as AI-S01 baseline) |

`git diff 5b39a3c dd7c9a5 -- backend` is empty. Backend integration tests (real PostgreSQL) were not run: the backend is byte-identical to 5b39a3c, already verified in AI-S01-VERIFY-001 (integration 112/112).
Note: VM Node is v22; `engines` requires `>=24 <25` (npm EBADENGINE warning only). The Windows/Node 24 run remains the authoritative environment.

## Untouched

`feat/ai-s01b-tool-usability` (DEV TRACK, other chat) and all other branches/worktrees. No force push, rebase, reset, clean, squash or branch deletion. Feature branches `feat/ui-shell-v2` and `docs/ui-ai-001-figma-approval` are kept.

## Next recommended action

1. Owner pushes main (`git push origin main`) and confirms `git ls-remote origin main` == local main.
2. Then, in its own chat and branch/worktree from the pushed main: UI-AI-002 (AI Assistant panel frontend). Not started here.

---

## Previous handoff — UI-AI-001 (AI Assistant screen — Figma design approved)

Date: 2026-09-30. Branch: `docs/ui-ai-001-figma-approval` (from main 5b39a3c; docs only). Track: PARALLEL TRACK — design only; no frontend code, backend, API, migration or auth change.
Authority: owner approved the Figma proposal "with the 2 small corrections" (2026-09-30) and approved recording it.

## What was done

- Figma file `N9KkqXIQuvCUj9NVAj6Cx4`, section `104:3226` "APPROVED 2026-09-30 — AI Assistant (UI-AI-001)": placement recommendation board, contract-gaps board, 12 states (desktop + one tablet frame), each in Light and Dark, inside the approved ERP Shell v2 components and `ITP / Theme` variables.
- Decision: slide-over panel from a header "Ask AI" button, usable from any screen (not a full-page sidebar entry). Approval card for `proposed_action` is marked FUTURE (AI-S02).
- Owner corrections applied: stronger panel separation (border/strong + deeper shadow, mainly for Dark); generic suggestion text instead of a sample supplier name.
- Design record with states, behaviour, contract gaps and open items: [ui-ai-001-ai-assistant-design.md](ui-ai-001-ai-assistant-design.md).

## Status

main unchanged (5b39a3c == origin/main). This docs branch: committed locally, not pushed, not merged. `feat/ui-shell-v2` (ERP Shell v2): implemented + reviewed + re-verified (d1445db), not pushed, not merged — UI-AI-002 depends on it (header + theme tokens).

## Next recommended action

Owner decides: (1) push this docs branch and/or merge it (separate approval), (2) push/merge ERP Shell v2 (separate approval), (3) only then, when asked, UI-AI-002 — frontend implementation of the AI Assistant panel in its own branch/worktree.

---

## Previous handoff — UI-SHELL-V2-001 (ERP Shell v2: collapsible sidebar, header, Light/Dark theme)

Date: 2026-09-27. Branch: `feat/ui-shell-v2` (base: main @ c30e289; main @ 5b39a3c merged in — S-06, S-07, AI-S01). Track: PARALLEL TRACK (frontend only — no backend, migration, API or auth change).
Status: implemented + independently reviewed (PASS, 4 MINOR fixed on-branch — see "Independent review") + main merged in. **Not pushed to origin, not merged to main.**
Authority: owner approved the Figma design ("acha ha ok kr do", 2026-09-27) and then authorized both the documentation update and the implementation ("dono").
Design source: Figma file `N9KkqXIQuvCUj9NVAj6Cx4` — section `89:2` "APPROVED 2026-09-27 — ERP Shell v2" (12 frames: desktop collapsed / hover peek / pinned, tablet tap-open, mobile closed / drawer; each in Light and Dark), components section `86:2` (`Shell/Sidebar` Peek·Pinned·Drawer, `Shell/Rail`, `Shell/Tooltip`, `Shell/Header` Desktop·Mobile), variable collection `ITP / Theme` (Light + Dark modes).

## Owner-approved behaviour (implemented)

- Behaviour follows input type, not only width. `< 768px`: no rail; header menu button opens a modal drawer (scrim, ✕, Esc, focus management as before).
- `≥ 768px`, mouse/trackpad (`(hover: hover) and (pointer: fine)`): 64px icons-only rail by default with name tooltips; resting 150 ms opens a non-modal "peek" (264px) over the content with no layout shift; leaving closes it after 300 ms. Keyboard focus on a rail link opens the peek and moves focus to the same item; Esc closes and returns focus to the rail.
- `≥ 768px`, touch (tablet): no hover behaviour; the rail's bottom button opens the peek as a modal overlay with scrim; scrim, link or Esc closes it.
- "Pin sidebar" keeps the full sidebar in the page flow; "Collapse sidebar" returns to the rail. Pin state and collapsed groups (Inventory / Purchasing / Stock) are remembered per device (localStorage, UI convenience only).
- Pending modules keep an amber "Pending" badge (expanded) / amber dot (rail).
- Light/Dark theme: defaults to the device setting; the header toggle overrides it and is remembered (`itp-erp:theme`). An inline script in `index.html` applies it before first paint (no light flash).

## Implementation

- `frontend/src/styles/index.css`: two-layer tokens — `--itp-*` values for Light (`:root`) and Dark (`[data-theme="dark"]`), mapped via `@theme inline` to Tailwind names. Legacy names (`canvas`, `line`, `ink`, `primary-*`, status colours) kept and remapped, so existing screens theme automatically; `primary-*` now resolves to the approved Charcoal/Slate action colour instead of the old blue. New names: `action`, `on-action`, `focus`, `canvas-sunken`, `canvas-hover`, `line-strong`, `ink-secondary`, `overlay`, `sidebar-*`, `danger-solid`. Radii aligned to Figma (control 6px, card 8px). Font stack starts with Inter (not bundled — see gaps).
- `lib/theme.tsx` (ThemeProvider/useTheme), `app/shell/ThemeToggle.tsx`, `app/shell/sidebar-prefs.ts`.
- `app/shell/Sidebar.tsx` → `SidebarPanel` (pinned / peek / drawer) + `SidebarRail`; `AppShell.tsx` owns open/close logic; `Header.tsx` restyled (breadcrumb, Lucide menu icon, theme toggle).
- Hard-coded colours removed from the shell (`#1e293b`, `bg-slate-900/40`, …). `Button` primary/dark now use `action` tokens; danger uses `danger-solid`; `Modal` backdrop uses `overlay`.
- Lucide icons vendored as before (lucide-static 1.48.0, ISC): Menu, Pin, PanelLeftClose, PanelLeftOpen, ChevronRight, Sun, Moon. No new npm dependency.
- Main content width: `max-w-5xl` → `max-w-[1600px]` (data-dense screens).

## Verification (clean local clone of main c30e289 + this branch, Cowork Linux VM, Node v24)

| Check | Result |
|---|---|
| npm ci --ignore-scripts | PASS |
| typecheck / lint / build | PASS / PASS / PASS |
| vitest | PASS — 88/88 (13 files; was 65/65 on main) |
| Production build excludes dev identity (`itp-erp:dev-identity` not in dist) | PASS |
| Visual check (Playwright/Chromium on the built app: desktop collapsed, tooltip, hover peek, pinned, dark, tablet touch, mobile, mobile drawer) | matches approved Figma |

New tests cover: hover open delay / close grace / pass-over, pin + collapse persistence, keyboard open + Esc focus return, focus-leave close, touch modal peek (scrim, inert content, focus), mobile drawer (open/close paths, focus return ordering, breakpoint reset), group collapse persistence, corrupt stored prefs, breadcrumb, theme default/override/persistence/invalid value.

## Independent review (UI-SHELL-V2-REVIEW-001)

Reviewer: fresh in-house QA/Code-review subagent with no part in the implementation, own clone, own runs (Codex/Antigravity paused — same-provider substitute, not equivalent to an external reviewer; recorded per AGENTS.md so the owner can weigh it).
Result on 7cfd43c: **PASS — 0 BLOCKER, 0 MAJOR, 4 MINOR, 6 NOTE.** npm ci, typecheck, lint, 83/83 tests, build, dev-identity-stripped check all reproduced; token parity Light/Dark (42 vars each), no legacy token removed; mutation checks confirmed tests are meaningful.

Re-verification of the fix commit 4cba3b7 by the same reviewer (own clone, own runs): tsc/eslint/build PASS, **88/88** tests, dev identity stripped; all 4 MINOR probes now behave correctly; mutation checks confirm the new tests catch each regression. **Verdict on the final commit: PASS — ready for controlled merge**, 0 new MINOR/MAJOR. New NOTEs (informational): (A) a touch modal peek dropped by a touch→mouse device change leaves focus on <body>; (B) a theoretical sub-frame window between the layout-change render and the timer-clearing effect.

MINORs (all fixed on this branch, each with a regression test that fails on the pre-fix code):
1. Stale hover flag after pin-from-peek → collapse kept a keyboard-opened peek open on focus-out. Fixed: hover flag reset on pin/collapse.
2. A pending hover-open timer could fire after a breakpoint change and re-open the peek later. Fixed: timer cleared and peek dropped on any breakpoint change.
3. Switching mouse ↔ touch did not reset an open peek (could turn into a modal without focus inside). Fixed: peek dropped on input-type change.
4. Esc with a hover peek open stole focus from the content. Fixed: Esc only handled when the peek is modal or holds focus.
NOTEs addressed: focus now returns to the rail button after the touch peek is closed by the scrim; dead `suppressFocusOpenRef` removed. NOTEs left: two harmless un-cleared 0 ms timeouts; inline theme script falls back to light if storage access throws, and needs a CSP hash if a CSP is added later; `bg-white` toggle knob in UomFormDialog (pre-existing).

## Deliberate deviations from the Figma (Frontend Contract Discipline)

- **Branch switcher and user menu are not rendered.** The backend has no real session/auth and no branch-name endpoint; showing "Main branch"/"Owner" would invent capabilities. The DEV-only identity switch remains in the header (stripped from production builds). Backend contract gap recorded here.
- Logo is still a placeholder square until the official logo file is supplied (to be used unchanged).

## Known gaps / notes

- Inter is not bundled (no new dependency added); the system font is used where Inter isn't installed. Bundling needs an approved dependency or a self-hosted font file.
- Colour sources outside this branch are now stale: Figma collection "Ideal Tasty Point / Colors — Midnight Teal" and the Cowork Design System artifact (navy `#1e3a5c`, Source Serif/Sans). Figma "ITP / Theme" + this token file are the approved values; reconcile the other two in a separate step.
- Rail links do not scroll: fine for the current 6 modules; move tooltips to a portal before adding overflow when modules grow.

## Next recommended action

Independent review of `feat/ui-shell-v2` (Codex, or a fresh QA/Testing subagent while Codex is paused), then owner decision on push and merge. Push needs the owner's Windows machine (Cowork VM has no GitHub credentials).

---

## Previous handoff — AI-S01-MERGE-001 (AI Foundation Merged to Main)

Date: 2026-09-27. Branch: main. Merged from: feat/ai-s01-foundation (HEAD c0c576e = AI-S01 implementation/tests/docs + FIX-001/FIX-002 + sync merge 02689c6 with main ec7833d + QA-004 record e175502 + AI-S01-VERIFY-001 record c0c576e).
Authority: explicit owner approval in the Cowork Manager session ("Haan, merge karo"), following AI-S01-QA-001..004 (independent QA/Testing subagent; final verdict PASS — ready for controlled merge, 0 BLOCKER/MAJOR/MINOR open) and AI-S01-VERIFY-001 (Windows 11, Node v24.18.1, Docker 29.8.0, PostgreSQL 17.11, `erp_test`: typecheck/lint/build PASS, unit 520/520, integration 112/112; branch pushed, origin == c0c576e). Same-provider review limitation applies (Codex/Antigravity paused).

## Pre-merge checks (executed)

- main == origin/main == ec7833d (unchanged since the sync); main is an ancestor of feat/ai-s01-foundation (fast-forward possible); local branch == pushed c0c576e.
- Changes after QA-004 (e175502..c0c576e): `CURRENT-HANDOFF.md` only (verification record).
- Main worktree: `main` checked out, tracked tree clean (only the long-standing untracked 00-PROJECT-MASTER.md, "Claude outputs/", backend/tmp/); no stale `.git/index.lock`. Delete permission granted by the owner and confirmed with a probe file.

## Merge

`git merge --ff-only feat/ai-s01-foundation` on the checked-out main: ec7833d → c0c576e. `git diff HEAD feat/ai-s01-foundation` empty. Feature branch preserved (local and origin). Push of main: from the owner's Windows machine.

## Post-merge verification (fresh clone of merged main c0c576e, Cowork Linux VM, Node v24.21.0, embedded PostgreSQL 17.10)

| Check | Result |
|---|---|
| npm ci --ignore-scripts | PASS |
| typecheck / lint / build | PASS / PASS / PASS |
| test:unit | PASS — 520/520 (15 files) |
| test:integration | PASS — 112/112 (8 files), authoritative migrate CLI + shipped runtime grants |
| frontend/ diff vs ec7833d | none |

## Status

AI-S01 is on main: implementation + tests + independent QA (PASS) + Windows/Docker verification + owner-approved merge + post-merge verification. AI stays OFF by default (`AI_ENABLED=false`); cloud providers OFF (`AI_CLOUD_ENABLED=false`). Migration `202609270004_ai_s01_audit_log` (and S-04..S-07 migrations) NOT applied to `erp_local` (separate authorization); when authorized: stop API → `npm run migrate` → re-run `scripts/runtime-grants.sql` → start.

## Next recommended action

Owner pushes main. Candidates (owner decides, own chat): AI-S02 (first WRITE tool: AI-proposed PO draft → preview → approve), AI Assistant screen (Figma proposal first), stock-transfer AI tools, local model setup on the restaurant PC.

## Previous handoff — AI-S01-QA-004 (AI Foundation — synced with main ec7833d, independent QA PASS, on feature branch)

Date: 2026-09-27. Branch: `feat/ai-s01-foundation` (from main `a6660e5`; current main `ec7833d` — S-07 Stock Transfer, merged in a parallel session — was merged into the branch in AI-S01-SYNC-001). NOT merged to main.
Authority: owner request in the Cowork Manager session to make the ERP AI-ready; owner decisions AI-O-01 (Phase 1 read-only + audit) and AI-O-02 (cloud providers built, OFF by default), recorded in ADR-0012.

## What was built

Optional AI layer, OFF by default: provider abstraction (OpenAI-compatible adapter for local model servers and OpenAI; Anthropic adapter; built-in fetch, no new dependency), AI gateway (tool loop, limits, per-user rate limit, versioned central system prompt), ten READ-only Inventory/Purchasing tools reusing existing services with the caller's AuthContext, WRITE-proposal contract (no write tool registered), append-only `ai_audit_log` (runtime INSERT only, immutability triggers, fail-closed), `GET /api/ai/status`, `POST /api/ai/chat`. Details: `docs/engineering/ai-s01-implementation.md`, `docs/architecture/AI_ARCHITECTURE.md`.

## Review status

- AI-S01-QA-001 (independent QA/Testing subagent, no implementation involvement): reproduced 458/458 unit, 100/100 integration; verdict FAIL — 0 BLOCKER, 1 MAJOR (this file's history had been removed), 6 MINOR, 4 NOTE. Same-provider review limitation applies (Codex/Antigravity paused).
- AI-S01-FIX-001: all findings addressed (table in `docs/engineering/ai-s01-implementation.md`). Implementer run after fixes (Cowork VM, Node 24.21.0, embedded PostgreSQL 17.10): typecheck/lint/build PASS; unit 481/481; integration 101/101.
- AI-S01-QA-002 (focused independent re-review of FIX-001): reproduced 481/101; verdict PASS — one remaining MINOR (N-1 lone-surrogate audit insert) and 2 NOTEs.
- AI-S01-FIX-002: N-1 and the doc NOTE fixed; unit 481/481, integration 101/101.
- AI-S01-QA-003 (focused check of FIX-002 `d1762a0`): typecheck/lint PASS, unit 481/481, integration 101/101; N-1 FIXED, N-3 FIXED, no new issue; verdict **PASS — ready for controlled merge**. Open: N-2 NOTE only.
- AI-S01-SYNC-001: merged current main `ec7833d` (S-07) into the branch; conflicts in `app.ts`, `server.ts`, `runtime-grants.sql`, migration-list tests, READMEs and this file resolved keeping both sides; ADR renumbered 0011 → 0012 and AI migration renamed to `202609270004_ai_s01_audit_log` (S-07 owns `202609270003` and ADR-0011); AI tests given the new `stockTransferRepository` option; stock-movements tool description lists transfer movement types. Implementer run: typecheck/lint/build PASS, unit 520/520 (main 440 + AI 80), integration 112/112 (main 107 + AI 5). 
- AI-S01-QA-004 (focused independent re-review of the sync merge `02689c6`): typecheck/lint/build PASS, unit 520/520, integration 112/112; conflict resolution, ADR renumbering, migration order and handoff history all correct; S-07 code untouched; 0 BLOCKER/MAJOR/MINOR, 2 NOTE (cosmetic title — fixed here; migration renamed while unmerged — recreate any kept test schema that recorded the old name). Verdict **PASS — ready for controlled merge**.
- AI-S01-VERIFY-001 (VS Code Claude Code session, owner's Windows machine; isolated worktree `Ideal-Tasty-Point-ERP-ai-verify` at `e175502`): after `git fetch`, main == origin/main == `ec7833d`, an ancestor of the branch. Windows 11, Node v24.18.1, npm 11.16.0, Docker 29.8.0, PostgreSQL 17.11 in the existing `ideal-tasty-point-s01-dev-postgres-1` container (already running/healthy; nothing recreated), dedicated `erp_test` database (`erp_local` untouched). npm ci PASS (221 packages, 0 vulnerabilities; npm's allow-scripts left the esbuild postinstall unrun, not needed); typecheck/lint/build PASS (exit 0); unit **520/520** (15 files); integration **112/112** (8 files). Each integration file creates a fresh random schema, so no kept schema carrying the old migration name `202609270003_ai_s01_audit_log` was used (QA-004 NOTE satisfied). Branch pushed with a plain `git push -u origin feat/ai-s01-foundation` (new remote branch); after `git fetch`, origin == local == `e175502`, then this record commit was pushed as well. Not merged.

## Next steps

1. Done: branch pushed and Windows/Docker PostgreSQL 17 verification passed (AI-S01-VERIFY-001).
2. Owner-approved merge; post-merge verification.
3. Migration `202609270004_ai_s01_audit_log` is not applied to `erp_local`; when authorized: stop API → `npm run migrate` → re-run `scripts/runtime-grants.sql` → start.

## Carried forward (unchanged)

S-04/S-05/S-06/S-07 migrations not applied to `erp_local`; S06-QA-001 NOTEs 2–5; S-07 carried-forward items (see S07-MERGE-001 below); ADR-0010 A-01..A-07; no receiving/PO UI; no real login/session.

## Previous handoff — S07-MERGE-001 (Inventory S-07 Stock Transfer Merged to Main)

Date: 2026-09-27. Branch: main. Merged from: feat/inventory-s07-stock-transfer (HEAD 620d044 = implementation 304a880 + S07-FIX-001 6414828 + QA record 6e5dead + S07-VERIFY-001 record 620d044).
Authority: explicit owner approval in the Cowork Manager session ("Haan, merge karo"), following S07-QA-001 (independent QA/Testing subagent PASS — 0 BLOCKER / 0 MAJOR / 2 MINOR / 3 NOTE, all addressed in S07-FIX-001; focused re-review PASS) and S07-VERIFY-001 (Windows/Docker PostgreSQL 17.11: unit 440/440, integration 107/107, branch pushed, origin == 620d044). Same-provider review limitation applies (Codex/Antigravity paused).

## Pre-merge checks (executed)

- main == origin/main == a6660e5; local and origin `feat/inventory-s07-stock-transfer` == 620d044; main is an ancestor (fast-forward possible).
- Change after the Cowork-verified 6e5dead: `CURRENT-HANDOFF.md` only (S07-VERIFY-001 record), no secrets.
- Main worktree: `main` checked out, tracked tree clean (only 00-PROJECT-MASTER.md, "Claude outputs/", backend/tmp/ untracked); no `.git/index.lock`. Owner granted delete permission on the repo folder; probe file confirmed before the merge.

## Merge

`git merge --ff-only feat/inventory-s07-stock-transfer` on the checked-out main: a6660e5 → 620d044; `git diff HEAD feat/inventory-s07-stock-transfer` empty. Feature branch preserved (local and origin). Push of main: from the owner's Windows machine.

## Post-merge verification (fresh clone of merged main 620d044, Cowork Linux VM, Node v24.21.0, embedded PostgreSQL 17.10)

| Check | Result |
|---|---|
| npm ci --ignore-scripts | PASS — 221 packages |
| typecheck / lint / build | PASS / PASS / PASS |
| test:unit | PASS — 440/440 (10 files) |
| test:integration | PASS — 107/107 (7 files), authoritative migrate CLI + shipped runtime grants |
| frontend/ diff vs a6660e5 | none |

## Status

S-07 is on main: implementation + tests + independent QA (PASS) + fixes with focused re-review (PASS) + Windows/Docker verification + owner-approved merge + post-merge verification. Migrations S-04..S-07 are NOT applied to `erp_local` (separate authorization). When they are: stop the API → `npm run migrate` → re-run `scripts/runtime-grants.sql` → start the new build.

## Carried forward

ADR-0011 DEFAULT / ASSUMED A-01..A-08 (owner may revise); open B-04 parts (kitchen demand/requisition INV-24, production consumption, partial receipt over days, excess on arrival via adjustment); B-09 roles. No transfer UI yet. Earlier S-06 NOTEs and gaps unchanged.

## Next recommended action

Owner pushes main (`a6660e5..` merge record). Next slice only when the owner asks, in its own chat.

---

## Previous handoff — S07-VERIFY-001 (Stock Transfer — Windows/Docker Verification, Branch Push)

Date: 2026-09-27. Branch: feat/inventory-s07-stock-transfer (base: main @ a6660e5; verified HEAD 6e5dead — this record adds only this documentation entry on top). Status: implemented + independently QA-reviewed in the Cowork Linux VM (S07-QA-001/S07-FIX-001, PASS) + now also verified on the owner's Windows/Docker environment. Push to origin authorized and performed by this record. **NOT merged to main** — merge requires a separate owner approval.
Authority: owner explicitly authorized (a) verification in a new isolated worktree (`Ideal-Tasty-Point-ERP-s07-verify`), (b) one docs-only record commit on this branch, (c) a plain push of this branch — withholding merge-to-main, force-push, rebase/reset/clean, deletion, `erp_local` access and process management.

## Pre-checks

After `git fetch origin`: main == origin/main == a6660e5; local `feat/inventory-s07-stock-transfer` == 6e5dead (no remote ref yet).

## Real-environment verification (Windows 11, Node v24.18.1, npm 11.16.0, Docker 29.8.0, PostgreSQL 17.11 in the existing `ideal-tasty-point-s01-dev-postgres-1` container, dedicated `erp_test` database — `erp_local` never touched)

| Check | Result |
|---|---|
| npm ci --ignore-scripts | PASS — 221 packages, 0 vulnerabilities |
| typecheck | PASS (exit 0) |
| lint | PASS (exit 0) |
| build | PASS (exit 0) |
| test:unit | PASS — 440/440 (10 files) |
| test:integration | PASS — 107/107 (7 files), real authoritative migrate CLI + shipped runtime grants |

Pass counts match the Cowork VM results. The integration harness creates a fresh unique schema per run, so the S-07 migration ran in its final (post-S07-FIX-001) form — this satisfies the S07-QA-001 re-review NOTE about the in-place migration edit.

**Environment note:** the container was already running and `healthy` (no `docker start` needed; nothing recreated). The pre-existing `backend/tmp/demo-server.ts` process (port 3000) was not touched. No EPERM/locking issue occurred.

## Push

Plain (non-force) `git push -u origin feat/inventory-s07-stock-transfer` (new remote branch). The pushed head is this record commit; see the VS Code session report for the post-push `git fetch` confirmation that origin == local.

## Next recommended action

Owner merge decision (separate approval). Re-verify with a fresh `git fetch`/`git status` immediately before merging.

---

## Previous handoff — S07-IMPL-001 (Inventory S-07 Stock Transfer — Implementation)

Date: 2026-09-27. Branch: feat/inventory-s07-stock-transfer (base: main @ a6660e5). Status: implemented and tested in the Cowork Linux VM; independent QA review S07-QA-001 PASS (0 BLOCKER / 0 MAJOR / 2 MINOR / 3 NOTE) — all five addressed in S07-FIX-001; focused re-review of the fix PASS (0 new BLOCKER/MAJOR/MINOR, 1 NOTE); **NOT pushed; NOT merged.**
Authority: owner decisions 2026-09-27 recorded in `docs/decisions/ADR-0011-s07-stock-transfer.md` (slice choice; two-step send → receive; short receipt = variance with mandatory reason; Base UOM; cancel with reason only before receipt). Technical design by the Manager within those decisions; DEFAULT / ASSUMED A-01..A-08 (owner may revise).

## What changed

- Migration `202609270003_inventory_s07_stock_transfer.sql` (additive): transfer ledger types, `stock_transfer`, `stock_transfer_line`, `stock_transfer_settlement`, `stock_transfer_audit`, `stock_transfer_no_seq`, guard/validation/deferred triggers, deactivation block for locations with pending transfers.
- `scripts/runtime-grants.sql`: grants for the new tables and sequence (no DELETE/TRUNCATE; header UPDATE limited to status/reason/updated_at).
- APIs: `POST/GET /api/inventory/transfers`, `GET /api/inventory/transfers/:id`, `POST .../:id/receive`, `POST .../:id/cancel`; location deactivation gains `409 LOCATION_HAS_PENDING_TRANSFERS`.
- Docs: ADR-0011, `inventory-s07-implementation.md`, open-decisions update (B-04 partial), backend README (API + upgrade order).

## Verification (Cowork VM, Node v24.21.0, embedded PostgreSQL 17.10)

| Check | Result |
|---|---|
| npm ci | PASS — 221 packages |
| typecheck / lint / build | PASS / PASS / PASS |
| test:unit | PASS — 440/440 (10 files; 401 + 39 new) |
| test:integration | PASS — 107/107 (7 files; 96 + 11 new), authoritative migrate CLI + shipped runtime grants |
| Mutation checks | implementer 8/8 caught (M1–M4 + M-new, M8, M12, M16 after QA); QA's own M5/M7/M9/M10/M13/M15 caught — see implementation doc |

## S07-QA-001 (independent QA/Testing subagent, own clone, same-provider) and S07-FIX-001

- QA ran npm ci/typecheck/lint/build (PASS) and unit 439/439, integration 106/106; verdict PASS.
- MINOR-1: a settlement could be committed while the header stayed SENT (DB backstop gap) → fixed with a deferred `stock_transfer_settlement_finalised` constraint trigger + test.
- MINOR-2: mutations M8/M12/M16 not caught → tests added; all three now caught.
- NOTE-1 (send balance query scanned the whole location) → filtered by item; NOTE-2 (uppercase UUIDs → 404) → ids lowercased in zod + unit test; NOTE-3 (savepoint caveat of the `xmin` check) → documented in the migration.

- Focused re-review (same QA subagent, own clone, fix commit): typecheck/lint/build PASS, unit 440/440, integration 107/107; half-settled probe now refused at commit; M8/M12/M16 and a new M17 caught; NOTE fixes verified. New NOTE: the fix edited the unmerged S-07 migration in place, so any database that ran the first version (304a880) would miss the new rule — Windows/Docker verification must use a fresh schema/database (the test harness creates a unique schema per run).
- Limitation: QA is a same-provider (Claude) subagent, weaker independence than an external reviewer (Codex/Antigravity paused).

## Upgrade order (when applied to a real database)

Stop the API → `npm run migrate` → re-run `scripts/runtime-grants.sql` → start the new build. Without the re-applied grants every transfer call fails with a permission error. S-04..S-07 migrations are NOT applied to `erp_local` (separate authorization).

## Next recommended action

Windows/Docker verification + push by VS Code Claude, then owner merge decision.

---

## Previous handoff — S06-MERGE-001 (Inventory S-06 Purchase Order Merged to Main)

Date: 2026-09-27. Branch: main. Merged from: feat/inventory-s06-purchase-order (HEAD 51fbf6c = application code/tests/docs 6391f93 + S06-QA-001 record 3459b8f + S06-VERIFY-001 record 51fbf6c).
Authority: explicit owner approval in the Cowork Manager session ("Haan, merge karo"), following S06-QA-001 (independent QA/Testing subagent PASS — 0 BLOCKER / 0 MAJOR / 0 MINOR / 5 NOTE, focused re-review of the docs fix PASS) and S06-VERIFY-001 (Windows/Docker PostgreSQL 17: unit 401/401, integration 96/96, branch pushed). Same-provider review limitation applies (Codex/Antigravity paused).
Roles: Cowork Manager session = implementation (S06-IMPL-001), QA coordination (S06-QA-001), this merge, post-merge verification and this record. VS Code Claude Code session = Windows/Docker verification and branch push (S06-VERIFY-001).

## Pre-merge checks (executed, not assumed)

- `git fetch origin`: origin/feat/inventory-s06-purchase-order == local == 51fbf6c; main == origin/main == c30e289; main is an ancestor of the branch (fast-forward possible).
- Changes after the QA-reviewed code (6391f93..51fbf6c): documentation only (`backend/README.md` upgrade order, `CURRENT-HANDOFF.md` records) — no code, migration, grant or test change.
- Main worktree: `main` checked out, tracked tree clean (only the long-standing untracked files: 00-PROJECT-MASTER.md, "Claude outputs/", backend/tmp/).
- A stale 0-byte `.git/index.lock` dated 2026-09-26 20:16 UTC (older than this session) would have blocked the merge; removed after the owner granted delete permission on the repo folder (delete probe confirmed first).

## Merge

- Previous main HEAD: c30e289. Merge type: fast-forward (`git merge --ff-only feat/inventory-s06-purchase-order`) on the checked-out main (no branch switch). New main HEAD (merge): 51fbf6c; `git diff HEAD feat/inventory-s06-purchase-order` empty.
- Feature branch preserved (local and origin).
- Push of main: from the owner's Windows machine (the Cowork VM has no GitHub credentials).

## Post-merge verification (fresh clone of merged main 51fbf6c, Cowork Linux VM, Node v24.21.0, embedded PostgreSQL 17.10)

| Check | Result |
|---|---|
| npm ci --ignore-scripts | PASS — 221 packages |
| typecheck / lint / build | PASS / PASS / PASS |
| test:unit | PASS — 401/401 (9 files) |
| test:integration | PASS — 96/96 (6 files), authoritative migrate CLI + shipped runtime grants |
| frontend/ diff vs c30e289 | none |

## Correction to S06-VERIFY-001 (wording only)

Its Push paragraph says local and remote "resolve to `3459b8f`" and calls the branch "4-commit-ahead". The pushed branch head is the record commit itself, **51fbf6c**, 5 commits ahead of c30e289 (verified: origin/feat/inventory-s06-purchase-order == 51fbf6c, and 3459b8f..51fbf6c changes only `CURRENT-HANDOFF.md`). The VS Code session's own report stated 51fbf6c correctly.

## Status

S-06 is on main: implementation + tests + independent QA (PASS) + Windows/Docker verification + owner-approved merge + post-merge verification. Root README status updated. Migrations S-04, S-05 and S-06 are NOT applied to the operational database `erp_local` (separate authorization). When they are: stop the API → `npm run migrate` → re-run `scripts/runtime-grants.sql` → start the new build (S06-QA-001 NOTE 1; `backend/README.md`).

## Carried forward

S06-QA-001 NOTEs 2–5 (year-0000 date → 500 in the shared date helper; optional commit-time DB hardening; A-02 effect on edits after supplier deactivation; CLOSE only after a receipt) and ADR-0010 DEFAULT / ASSUMED A-01..A-07 (owner may revise). No Purchase Order or receiving UI yet. Earlier gaps unchanged: no expiry capture (B-07); standalone S-03 purchase endpoint checks "future" in UTC.

## Next recommended action

Owner pushes main (`c30e289..51fbf6c` + this record). Next slice only when the owner asks, in its own chat.

---

## Previous handoff — S06-VERIFY-001 (Purchase Order — Windows/Docker Verification, Branch Push)

Date: 2026-09-27. Branch: feat/inventory-s06-purchase-order (base: main @ c30e289; HEAD unchanged at 3459b8f — this record adds only this documentation entry on top). Status: implemented + independently QA-reviewed in the Cowork Linux VM (S06-QA-001, PASS) + now also verified on the owner's real Windows/Docker environment. Push to origin authorized and performed by this record. **NOT merged to main** — merge requires a separate, further owner approval.
Authority: owner decisions recorded in `docs/decisions/ADR-0010-s06-purchase-order.md`. This record: owner explicitly authorized (a) verification in a new isolated worktree, (b) one docs-only record commit on this branch, (c) a plain push of this feature branch — explicitly withholding merge-to-main, force-push, rebase/reset/clean, deletion, and any operational-database or process-management authorization.

## Real-environment verification (Windows 11, Node v24.18.1, Docker Desktop PostgreSQL 17, dedicated `erp_test` database, unique schema per run — `erp_local` never touched)

| Check | Result |
|---|---|
| npm ci --ignore-scripts | PASS — 221 packages, 0 vulnerabilities |
| typecheck | PASS |
| lint | PASS |
| build | PASS |
| test:unit | PASS — 401/401 (9 files) |
| test:integration | PASS — 96/96 (6 files), real authoritative migrate CLI + shipped runtime grants |

This closes the Windows/Docker verification gap noted in the prior Cowork VM records (S06-IMPL-001/S06-QA-001), with identical pass counts.

**Environment note:** at the start of this verification, Docker Desktop was not running and the `ideal-tasty-point-s01-dev-postgres-1` container (the same one used in S04-VERIFY-001/S05-VERIFY-001) was stopped (`Exited`, from an earlier machine restart). Docker Desktop was started and the existing container was started (`docker start`, not recreated — no data loss, same container/volume as before) and reached `healthy` before integration tests ran. The pre-existing `backend/tmp/demo-server.ts` process (port 3000) was not touched.

## Push

`feat/inventory-s06-purchase-order` pushed to origin as a plain (non-force) `git push -u origin feat/inventory-s06-purchase-order` (new branch, no prior remote ref existed), owner-authorized in this record. Confirmed after a fresh `git fetch origin`: local and remote both resolve to `3459b8f` — the reviewed commit is unchanged and matches the pushed remote exactly. `main` and other branches/worktrees were not touched by this record.

## Next recommended action

Owner reviews this record; when ready, separately authorize a controlled merge to main (the branch remains a clean, non-diverged 4-commit-ahead descendant of main @ c30e289 — re-verify with a fresh `git status`/`git log` immediately before merging, as always).

---

## Previous handoff — S06-QA-001 (Inventory S-06 Purchase Order — Independent QA PASS in the Cowork VM)

Date: 2026-09-27. Branch: feat/inventory-s06-purchase-order (implementation 6391f93 + this record). Status: implemented + independent QA PASS in the Cowork VM. NOT pushed, NOT merged; Windows/Docker PostgreSQL 17 re-run pending (owner machine).
Roles: Cowork Manager session = implementation (S06-IMPL-001, below) and this record. Independent reviewer: a fresh in-house QA/Testing subagent with no part in the implementation, working in its own clone. Codex and Google Antigravity remain paused (GOV-MANAGER-SUBAGENT-001): this is a same-provider review, not an external one — the owner should weigh that.

## Independent review — PASS (0 BLOCKER, 0 MAJOR, 0 MINOR, 5 NOTE)

Reproduced by the reviewer in its own clone: npm ci (221 packages), typecheck/lint/build PASS, unit 401/401, integration 96/96, NUL scan and `git diff --check` clean, tests use the shipped `runtime-grants.sql`. Extra evidence gathered by the reviewer:
- Mutation checks (each reverted): no PO row lock in the receipt path, no status refresh, RECEIPT audit before = after, no branch filter on PO lookup or list, `>=` → `>` in the completion check — each makes existing S-06 tests fail.
- Migration over a database already holding S-05 receipts (main code + grants, then HEAD migrate): applied cleanly, S-05 audit rows byte-identical, old receipts read back with null PO fields, re-run is a no-op, down is refused.
- 8 probe tests (single-receipt RECEIVED, final-state 409s, reason/filter/PATCH-field validation, maximum NUMERIC quantities, masters deactivated after PO creation, cross-branch 404 parity, trigger rejections) — all as designed.
- Mixed parallel stress, 20 rounds × ~36 operations (PO receipts, direct receipts, adjustments, edits, cancels, closes, creates, master updates): 0 deadlocks, 0 raw database errors, PO status always consistent with receipts and RECEIPT audits.
- O-01..O-07 each traced to code and a meaningful test; every non-S-06 change in the diff is mechanical wiring or the intended optional PO link.

NOTEs (non-blocking):
1. **Upgrade order** — after `npm run migrate`, `scripts/runtime-grants.sql` must be re-applied before the new build starts; otherwise even S-05 direct receiving returns 500 (the receipt insert now names the PO columns). Addressed in this record: explicit upgrade steps added to `backend/README.md` (focused re-review below). Relevant before applying S-04..S-06 to `erp_local`.
2. Year `0000` dates pass the shared `isValidCalendarDate` helper and PostgreSQL rejects them → generic 500 (no leak). Verified for S-06 `order_date` and inherited S-05 `receipt_date`; S-03 `purchase_date` uses the same helper (not separately tested). Left for a later shared cleanup.
3. Database backstops do not cover every raw-SQL misuse by the runtime role (e.g. a revision bump with no lines, a direct status UPDATE without an audit row, a forged audit row — the same INSERT pattern as earlier slices). Not reachable through the application; optional future hardening: a deferred commit-time check.
4. ADR-0010 A-02 effect: if the PO supplier is deactivated later, any edit returns 409 SUPPLIER_INACTIVE unless the supplier is changed in the same edit (or the PO is cancelled). Owner may revise A-02.
5. D-01 reading: CLOSE only after a receipt (a PO without receipts is CANCELLED). Consistent with O-06/O-07 as answered; owner may confirm.

## Focused re-review of the post-review change

The only change after the review is documentation (this record + the `backend/README.md` upgrade steps); no code, migration, grant or test changed. Focused re-review by the same QA subagent: **PASS** — documentation only (no code/migration/grant/test change); README upgrade order accurate (its migration-over-S-05 probe had shown `permission denied for table goods_receipt` with new code + old grants); this record faithful to its report (one wording precision on NOTE 2 applied).

## Next recommended action

Owner: push `feat/inventory-s06-purchase-order`; Windows/Docker PostgreSQL 17 re-run (unit 401, integration 96 expected); then a separately approved controlled merge. Migrations S-04..S-06 are still not applied to `erp_local` (separate authorization; follow the upgrade order in NOTE 1). Do not start the next slice automatically.

---

## Previous handoff — S06-IMPL-001 (Inventory S-06 Purchase Order)

Date: 2026-09-27. Branch: feat/inventory-s06-purchase-order (base: main @ c30e289). Status: implemented + self-verified in the Cowork VM; independent QA review in progress (result recorded in the next entry); NOT pushed, NOT merged — push, Windows/Docker verification and merge need the owner.
Authority: owner decisions 2026-09-27 answered in the Cowork Manager session for S-06 and recorded in `docs/decisions/ADR-0010-s06-purchase-order.md`: O-01 no approval step (saved PO is ISSUED); O-02 receipt link optional, direct receiving stays; O-03 many receipts per PO, excess allowed and shown; O-04 PO rate optional, receipt rate mandatory (bill rate); O-05 edit only before the first receipt, audited; O-06 auto RECEIVED when every line is fully received, manual CLOSE otherwise; O-07 Owner and Manager may cancel (no receipt yet) or close, with reason.

## What was built

Backend only: `POST/GET /api/inventory/purchase-orders`, `GET/PATCH /api/inventory/purchase-orders/:id`, `POST .../:id/cancel`, `POST .../:id/close`; optional `purchase_order_id` / `purchase_order_line_id` on `POST /api/inventory/receipts`. Tables `purchase_order`, `purchase_order_line` (insert-only; edits add a revision), `purchase_order_audit`. Received / pending / excess quantities are derived from receipt lines (never stored). Details, API table and requirement-to-test traceability: `docs/engineering/inventory-s06-implementation.md`.

Migration: `backend/migrations/202609270002_inventory_s06_purchase_order.sql` (additive: new sequence/tables/triggers; two nullable columns + unique constraint on the S-05 receipt tables; no existing row changed). Grants: `backend/scripts/runtime-grants.sql` extended (no DELETE/TRUNCATE; PO UPDATE limited to lifecycle columns).

## Verification (Cowork Linux VM, clean clone, Node v24.21.0, PostgreSQL 17.10 embedded)

| Check | Result |
|---|---|
| npm ci --ignore-scripts | PASS — 221 packages |
| Baseline on untouched main c30e289 | unit 355/355, integration 87/87 |
| typecheck / lint / build | PASS / PASS / PASS |
| test:unit | PASS — 401/401 (9 files; 355 + 46 new) |
| test:integration | PASS — 96/96 (6 files; 87 + 9 new), authoritative migrate CLI + shipped runtime grants |
| Mutation check | removing the PO row lock (`FOR UPDATE`) in the receipt path makes the concurrency test fail |

Existing code/tests touched: goods receipt domain/repository (optional PO link; direct path unchanged), `app.ts`/`server.ts` wiring, buildApp wiring in 13 test files, migration-list assertions (2 files), S-05 unit fixture (+2 null fields).

## Open / defaults to confirm

DEFAULT / ASSUMED (ADR-0010 A-01..A-07, owner may revise): order date not future and receipt not before order date (Asia/Karachi); inactive masters blocked; PO receipt lines must match a PO line exactly (other items/brands via direct receipt); receipt supplier = PO supplier; no delivery location, expected date or notes on the PO; RECEIVED PO takes no further receipts; one global PO number sequence. Still open: rejected quantities, invoice-pending receipts, returns, Store Keeper role (B-09), expiry (B-07).

## Next recommended action

Independent QA/Testing subagent review (no part in this implementation) and focused re-review of any fixes; then owner: push the branch, Windows/Docker PostgreSQL 17 re-run, then a separately approved controlled merge. Migration not applied to `erp_local`. Do not start the next slice automatically.

---

## Previous handoff — S05-MERGE-001 (Inventory S-05 Goods Receiving Merged to Main)

Date: 2026-09-27. Branch: main. Merged from: feat/inv-s05-goods-receiving (HEAD 6e81f32 = application code 0210db7 + the S05-VERIFY-001 documentation commit).
Authority: explicit owner approval in the Cowork Manager session ("Haan, tum merge karo"), following S05-VERIFY-001: Windows/Docker PostgreSQL verification (unit 355/355, integration 87/87) and independent QA/Testing subagent verdict PASS — 0 BLOCKER / 0 MAJOR / 0 MINOR / 2 NOTE (process-only, no fix needed). Same-provider review limitation applies (Codex/Antigravity paused).
Roles: Cowork Manager session = implementation (S05-IMPL-001), this merge, post-merge verification and this record. VS Code Claude Code session = push, Windows/Docker verification and independent QA (S05-VERIFY-001).

## Pre-merge checks (executed, not assumed)

- `git fetch origin`: origin/feat/inv-s05-goods-receiving == 6e81f32; main == origin/main == 9abd28c; main is an ancestor of the branch.
- Changes after the implementation commit 0210db7: only `docs/engineering/CURRENT-HANDOFF.md` (S05-VERIFY-001 entry) — reviewed application code unchanged.
- Main worktree tracked tree clean (only the long-standing untracked files: 00-PROJECT-MASTER.md, "Claude outputs/", backend/tmp/).

## Merge

- Previous main HEAD: 9abd28c. Merge type: fast-forward (`git merge --ff-only origin/feat/inv-s05-goods-receiving`) on the already checked-out main (no branch switch). New main HEAD (merge): 6e81f32; `git diff HEAD origin/feat/inv-s05-goods-receiving` empty.
- Feature branch preserved on origin.
- Push of main: run from the owner's Windows machine (the Cowork VM has no GitHub credentials).

## Post-merge verification (clean clone of merged main 6e81f32, Cowork Linux VM, Node v24.21.0, embedded PostgreSQL 17.10)

| Check | Result |
|---|---|
| npm ci --ignore-scripts | PASS — 221 packages |
| typecheck / lint / build | PASS / PASS / PASS |
| test:unit | PASS — 355/355 (8 files) |
| test:integration | PASS — 87/87 (5 files), authoritative migrate CLI + shipped runtime grants |
| frontend/ diff vs 9abd28c | none |

## Status

S-05 is on main: implementation + tests + independent QA (PASS) + Windows/Docker verification + owner-approved merge + post-merge verification. Root README status updated. Migrations S-04/S-05 are NOT applied to the operational database `erp_local` (separate authorization).

## Next recommended action

Owner pushes main. Next slice per owner decision 2026-09-27: S-06 Purchase Order — start only when the owner asks. Known gaps carried forward: no expiry capture (B-07); standalone S-03 purchase endpoint checks "future" in UTC (ADR-0009 A-01 NOTE); no receiving UI yet.

---

## Previous handoff — S05-VERIFY-001 (Goods Receiving — Independent QA Verified on Windows/Docker)

Date: 2026-09-27. Branch: feat/inv-s05-goods-receiving (base: main @ 9abd28c; HEAD unchanged at 0210db7 — this record adds only this documentation entry on top). Status: implemented + independently reviewed (PASS) + real Windows/Docker verification complete. Push to origin authorized and performed by this record. **NOT merged to main** — merge requires a separate, further owner approval.
Authority: owner decisions 2026-09-27 recorded in `docs/decisions/ADR-0009-s05-goods-receiving.md`. Implementation: Cowork Manager session (prior record, preserved below as S05-IMPL-001). This record: owner explicitly authorized (a) real Windows/Docker verification and independent QA review, (b) pushing the feature branch, (c) this bounded documentation update — explicitly withholding merge-to-main authorization.
Roles: Manager (this VS Code Claude Code session) ran verification in an isolated worktree and coordinated review. Independent reviewer: a fresh in-house QA/Testing subagent with no prior involvement in the S-05 implementation. Codex and Google Antigravity remain paused (GOV-MANAGER-SUBAGENT-001); this is a same-provider substitute for a genuinely external reviewer, not equivalent to it — recorded here per AGENTS.md so the owner can weigh it.

## Real-environment verification (owner's Windows 11 + Docker Desktop PostgreSQL 17, Node v24.18.1, dedicated `erp_test` database, unique schema per run — `erp_local` never touched)

| Check | Result |
|---|---|
| npm ci --ignore-scripts | PASS — 221 packages, 0 vulnerabilities |
| typecheck | PASS |
| lint | PASS |
| build | PASS |
| test:unit | PASS — 355/355 (8 files) |
| test:integration | PASS — 87/87 (5 files), real authoritative migrate CLI + shipped runtime grants |

Independently reproduced by the QA subagent in its own pass with identical counts. This closes the gap the implementation doc flagged: the Cowork Linux VM run (embedded PostgreSQL 17.10) is now confirmed on the owner's actual Docker Desktop PostgreSQL 17, with identical pass counts.

## Independent review

Fresh in-house QA/Testing subagent, no prior involvement in the S-05 implementation — **PASS — 0 BLOCKER, 0 MAJOR, 0 MINOR, 2 NOTE**. Verified from source and its own fresh test run (not taken on the implementer's word): every ADR-0009 owner decision (O-01–O-08) traced to real code and a real, meaningfully-asserted test; O-07 (the one change to shared S-04 stock logic — receipt may create first stock, and a receipt-only history now satisfies the adjustment prerequisite) scrutinized hardest and confirmed to be exactly and only the approved change, with the original S-04 "exactly one OPENING" invariant still enforced at both the application and DB-trigger/unique-index level; the migration confirmed genuinely additive (no `UPDATE`/`DELETE` against any existing table, no window of reduced trigger protection during the constraint/function replacement); branch isolation, the sorted-item-id concurrency/deadlock-avoidance design, create-only enforcement (real attempted UPDATE/DELETE/TRUNCATE rejected, not just an absent route), every documented API error code traced to a distinct real throw site, and authorization all confirmed directly from code and tests. S-01–S-04 regression check: confirmed via the actual diff that every non-S-05 file changed is mechanical wiring only, with the sole real behavior change being the O-07 hunk in `pg-stock-repository.ts` as described above.

**2 NOTE (both non-blocking, process-only, not specific to a code defect):**
- This Windows/Docker re-run was exactly the "pending" item the implementation doc flagged — now closed, identical counts to the Linux VM run.
- Integration test runs leave their uniquely-suffixed schemas behind in `erp_test` without dropping them in `afterAll` — the same pre-existing pattern already present in S-01–S-04's integration tests, not introduced by this slice. Safe (isolated to `erp_test`, `erp_local` never touched), but worth a future cleanup pass in the shared test harness.

Codex and Google Antigravity remain paused — this was a same-provider review, not a genuinely external one.

## Push

`feat/inv-s05-goods-receiving` pushed to origin as a plain (non-force) `git push -u origin feat/inv-s05-goods-receiving` (new branch, no prior remote ref existed), owner-authorized in this record. Confirmed after a fresh `git fetch origin`: local and remote both resolve to `0210db7` — the reviewed commit is unchanged and matches the pushed remote exactly. `main`, other branches/worktrees, and the operational database were not touched by this push or any other action in this record. The pre-existing `backend/tmp/demo-server.ts` process (port 3000) was not touched.

## Next recommended action

Owner reviews this record; when ready, separately authorize a controlled merge to main (the branch remains a clean, non-diverged 3-commit-ahead descendant of main @ 9abd28c — re-verify with a fresh `git status`/`git log` immediately before merging, as always). Do not start S-06 (Purchase Orders) automatically.

---

## Previous handoff — S05-IMPL-001 (Inventory S-05 Goods Receiving, direct without PO)

Date: 2026-09-27. Branch: feat/inv-s05-goods-receiving (base: main @ 9abd28c). Status: implemented + self-verified in the Cowork VM; NOT merged — pending push, owner Windows/Docker verification, independent QA review and owner-approved merge.
Authority: owner decisions 2026-09-27 recorded in `docs/decisions/ADR-0009-s05-goods-receiving.md` (no PO in this slice; one entry creates purchase record + stock; backdating allowed but not future / not before opening; corrections by adjustment; no expiry yet; multi-line receipts; receipt may be first stock; optional supplier bill no). Implemented by the Cowork Manager session.

## What was built

Backend only: `POST/GET /api/inventory/receipts`, `GET /api/inventory/receipts/:id`; tables `goods_receipt`, `goods_receipt_line`, `goods_receipt_audit`; RECEIPT stock movements; S-04 opening/adjustment prerequisites updated (opening must be first; adjustment after opening or receipt). Details, API table and requirement-to-test traceability: `docs/engineering/inventory-s05-implementation.md`.

Migration: `backend/migrations/202609270001_inventory_s05_goods_receiving.sql` (additive; replaces two `stock_movement` CHECK constraints and the ledger trigger function; no existing row changed). Grants: `backend/scripts/runtime-grants.sql` extended (INSERT-only).

## Verification (Cowork Linux VM, clean clone, Node v24.21.0, PostgreSQL 17.10 embedded)

| Check | Result |
|---|---|
| npm ci --ignore-scripts | PASS |
| typecheck / lint / build | PASS / PASS / PASS |
| test:unit | PASS — 355/355 (8 files; 319 + 36 new) |
| test:integration | PASS — 87/87 (5 files; 80 + 7 new), authoritative migrate CLI + shipped runtime grants |
| Mutation checks | removing the future-date check or the before-opening check fails the date-rules test |

Existing code/tests touched: `isValidCalendarDate` exported; `pg-stock-repository.ts` prerequisites (new 409 `STOCK_HISTORY_EXISTS`); buildApp wiring in 11 test files; migration-list assertions (2 files).

## Open / defaults to confirm

DEFAULT / ASSUMED (ADR-0009 A-01..A-04): Asia/Karachi business date; inactive masters blocked; any active location may receive; rate mandatory. Known gap: no expiry capture (B-07). NOTE: standalone S-03 purchase endpoint still checks "future" in UTC.

## Next recommended action

Owner pushes the branch; Windows/Docker PostgreSQL 17.11 re-run; independent QA review (agent with no part in this change); then owner-approved controlled merge. Do not start S-06 (Purchase Order) automatically. Migration not applied to `erp_local`.

---

## Previous handoff — UI-UOM-MERGE-001 (UI-UOM-001 Merged to Main)

Date: 2026-09-27. Branch: main. Merged from: feat/ui-uom-master (commit 6760085).
Authority: owner-approved controlled merge, given directly in-session, conditional on a Step A focused re-review of the post-review fix commit passing first. Step A verdict: **PASS** (fresh, uninvolved QA/Testing subagent — 0 findings; personally reverted the fix locally, confirmed the new regression test genuinely fails on the old code and passes on the fixed code, not just that it exists).
Roles: Manager (this session) executed the pre-merge verification, the fast-forward merge, and this record. Independent reviewers: the full UI-UOM-001 QA/Testing subagent (PASS WITH FINDINGS, both addressed — see previous record below) and the Step A focused-fix reviewer (PASS), both with no part in the implementation. Codex and Google Antigravity remain paused (GOV-MANAGER-SUBAGENT-001) — same-provider review, not a genuinely external one; recorded again here per AGENTS.md.

## Pre-merge verification (executed immediately before merging, not assumed)

| Check | Result |
|---|---|
| `git fetch origin` | clean |
| `origin/feat/ui-uom-master` | `6760085` (matches the reviewed candidate) |
| `main` local vs. `origin/main` | both `73cfd71` (match, as expected) |
| `git merge-base main origin/feat/ui-uom-master` | `73cfd71` — confirms `main` is a strict ancestor (clean fast-forward possible) |
| Main worktree tracked-tree state | clean; only the three pre-existing, unrelated untracked items present (`00-PROJECT-MASTER.md`, `Claude outputs/`, `backend/tmp/`) |

No divergence, no unexpected changes — merge proceeded as authorized.

## Merge

- Previous main HEAD: `73cfd71`. Merged branch HEAD: `6760085`. New main HEAD: `6760085`.
- Merge type: fast-forward (`git merge --ff-only origin/feat/ui-uom-master`), executed directly on the main worktree's already-checked-out `main` branch — no checkout switch, no active session or uncommitted work disturbed.
- 21 files changed, 1235 insertions(+), 71 deletions(-) — same file list as UI-UOM-001's own record, nothing more.
- Post-merge tree check: `git diff main origin/feat/ui-uom-master` — empty (byte-identical). `git diff 73cfd71 main -- backend/` — empty (backend genuinely untouched by this merge, as claimed throughout).
- Post-merge re-verification on the merged tree itself (fresh `npm ci --ignore-scripts` in the main worktree, which had no prior frontend install): typecheck PASS, lint PASS, **test PASS — 65/65 (12 files)** (one earlier run hit a transient Vitest worker-pool timeout under this machine's concurrent-process load — an environment flake, not a code issue — a clean retry passed outright), build PASS.
- `git push origin main`: completed — `73cfd71..6760085 main -> main`.
- Post-push verification: fresh `git fetch origin` then `git rev-parse main` == `git rev-parse origin/main` == `6760085`.
- Feature branch `feat/ui-uom-master` preserved (not deleted) on origin.

## UI-UOM-001 completion status

UI-UOM-001 (Catalog Settings / UOM Master frontend) is now on `main`: implementation + independent QA review (PASS WITH FINDINGS, resolved) + a focused re-review of the fix (PASS) + owner-approved merge + post-merge verification are all satisfied.

## Out of scope for this record (explicitly not done)

No force push, reset, rebase, squash, or branch delete. `backend/` untouched. The pre-existing `backend/tmp/demo-server.ts` process (port 3000, disclosed in the previous record) was not touched, started, or stopped. No other branch or worktree touched.

## Next recommended action

Owner decides what's next (e.g. Brands/Pack Variants tabs, or a different priority). The five Figma states not yet screenshot-diffed (noted in the previous record) remain a low-priority, non-blocking follow-up if pixel fidelity matters later.

---

## Previous handoff — UI-UOM-001 (Catalog Settings → UOM Master frontend implementation)

Date: 2026-09-26. Branch: feat/ui-uom-master (worktree at `Ideal-Tasty-Point-ERP-ui-uom`, base: main @ 73cfd71). Status: implemented + self-verified + independently reviewed (PASS WITH FINDINGS, both addressed below) + **pushed** to origin. **NOT merged** — merge remains a separate owner decision.
Authority: owner approval (2026-09-26) of the Figma proposal "Inventory / Catalog Settings / UOM Master" (file `N9KkqXIQuvCUj9NVAj6Cx4`, node `55:7` and children — states 55:186 In shell, 55:8 Default, 56:2 Empty, 56:199 Loading, 56:406 Access denied, 57:38 Create, 57:253 Edit, 57:473 409 error). Visual direction (unchanged from prior approval): Palette Option B Charcoal/Slate, icons Lucide.
Roles: Manager (this VS Code Claude Code session) = primary implementer, in an isolated worktree. Independent reviewer: a fresh in-house QA/Testing subagent with no part in this implementation, in its own separate isolated worktree — verdict and findings below.

## What was built

Frontend only, no backend/migration change. Uses only existing, already-live UOM Master API (`GET/POST/PATCH /api/inventory/uoms`, S-02).

- **Sidebar restructure** (`app/shell/nav-items.ts`, `Sidebar.tsx`, `breadcrumbs.ts`): flat nav list replaced with three labeled sections matching the approved Figma sidebar — **Inventory** (Item Master, Catalog Settings), **Purchasing** (Suppliers, Purchases & Rates — both Pending), **Stock** (Stock Locations, Stock Ledger — both Pending). Sidebar itself now renders in the dark Charcoal/Slate treatment (`bg-[#1e293b]` etc., Tailwind arbitrary values scoped to this one component — the shared `--color-primary-*`/`ink`/`canvas` tokens in `styles/index.css` were deliberately left untouched, so Item Master's own screen is pixel-identical to before this change).
- **Catalog Settings** (`features/catalog-settings/CatalogSettingsPage.tsx`, new route `/catalog-settings`): tabbed page — UOM Master (live), Brands and Pack Variants (Pending placeholders, same copy the old standalone pages had). Whole page is gated behind `canEditItems` (Owner/Manager) at the page level, matching the real backend: UOM Master's `list()` itself requires Owner/Manager, so a denied identity never even attempts the list call — it sees a single access-denied card, no tabs.
- **UOM Master tab** (`features/catalog-settings/uom/`): full list + search (client-side, by name) + create + edit + Owner-or-Manager active/inactive toggle, wired to the real API. Duplicate name → field-level error + banner (`409 DUPLICATE_UOM_NAME`); other 400s mapped from `issues`; 401/403 messaged same convention as `ItemFormPage`.
- **Old routes preserved as redirects**: `/uom`, `/brands`, `/pack-variants` → `/catalog-settings` with the right tab pre-selected via router state, so old links/bookmarks still land correctly. Old standalone page files (`features/uom`, `features/brands`, `features/pack-variants`) removed — their content lives in the new tabs instead.
- **New placeholder screens** for the four new Pending sidebar entries (`/suppliers`, `/purchases`, `/stock/locations`, `/stock/ledger`), reusing the existing `PlaceholderPage` component with honest status text (S-03/S-04 backend live, frontend pending; the two Stock ones also note the erp_local migration gap from S04-MERGE-001).
- **Icons**: Lucide icon paths vendored as plain SVG components (`design-system/icons/index.tsx`, ISC License, sourced from `lucide-static` v1.48.0) — **no new npm dependency added**, per the task's instruction to ask first before adding `lucide-react`. 14 icons used across the sidebar and the UOM Master screen's toolbar/dialogs/states.
- **New `Button` variant** (`dark`, `bg-neutral-700`): the Figma design's dark-slate primary action, reusing the existing `neutral-700` token — added as a new variant rather than changing the existing blue `primary` variant, again to keep Item Master untouched.

## Deviations from the literal Figma mockup (judgment calls, not business-rule changes)

- **Loading state**: reused the existing shared `LoadingState` (spinner + text) instead of building bespoke skeleton table rows — Item Master itself doesn't have skeleton rows either, and inventing a new pattern used nowhere else seemed like more inconsistency than it was worth for a loading spinner.
- **Access-denied state**: reused the existing `ErrorState` component (title + message), matching `ItemFormPage`'s own established permission-denied convention, instead of a new icon-circle-plus-lock visual treatment not used anywhere else in the app yet. (Found by independent review, not disclosed here originally:) this also means it has no lock icon and no inline "Current dev identity: STAFF"-style badge that Figma's `56:406` shows — not a functional gap, since the identity switcher is permanently visible in the header regardless, but named here for completeness.
- **Table column widths**: fluid (existing shared `Table` component), not the fixed 300/240/160px from Figma — the shared `Table`/`TableCell` components don't support per-column fixed widths today and adding that felt like scope beyond this one screen.
- **Unit Type cell**: rendered as a `StatusBadge` (neutral tone) rather than Figma's slightly different pill styling, reusing the exact same badge component Item Master's own "Status" column already uses, for consistency.

None of these affect functionality, permissions, or the API contract — flagged for the owner/reviewer's awareness, not as a stop condition.

## Verification (executed in the isolated worktree, Windows, Node v24.18.1)

| Check | Result |
|---|---|
| npm ci --ignore-scripts | PASS — 249 packages, 0 vulnerabilities |
| typecheck | PASS |
| lint | PASS |
| test | PASS — 65/65 (12 files; covers list render, search, create success, edit, active toggle from both the row action and the edit dialog, a failed toggle surfacing an error instead of silently doing nothing (added post-review, see below), 409 duplicate-name field error, loading, empty, 403 access-denied, and all three old-route redirects) |
| build | PASS — dev-identity storage key confirmed absent from `dist/` (production tree-shaking guarantee intact) |

Counts above are the final, post-review numbers (independent review ran its own fresh pass first and got 64/64, matching the pre-fix candidate exactly; the 65th test was added afterward for the fix below).

### Browser verification (Playwright, headless Chromium, against the dev server)

Screenshots taken of: `/items` with the new dark sidebar, `/catalog-settings` UOM Master tab (real list rendered), the New unit create dialog, and a duplicate-name (`kg`) submission showing the field error + banner exactly as designed. No unexpected console errors (two benign 404s, one *expected* 409 from the duplicate-name test itself).

**Disclosure:** this dev server's `/api` proxy (`vite.config.ts`, unchanged, pre-existing) forwards to `127.0.0.1:3000`, and a backend process was already running there — `backend/tmp/demo-server.ts` (PID 13772, started independently of this session, before it began; not started or stopped by this record). The duplicate-name test above therefore hit that **real, already-running backend**, not a mock. It returned a genuine `409` (the name `kg` already existed), so **no data was written** — but this was an already-live server this session did not start and does not control, and its actual database target was not verified. Flagging this transparently rather than silently noting "browser-verified": the owner may want to confirm what `tmp/demo-server.ts` connects to. This session's own dev server (Vite, port 5173) was stopped after the check; the pre-existing demo-server on port 3000 was left running, untouched.

## Independent review

Fresh in-house QA/Testing subagent, no part in this implementation, own separate isolated worktree (`Ideal-Tasty-Point-ERP-qa-uom001`) — **verdict: PASS WITH FINDINGS, 0 BLOCKER, 0 MAJOR, 2 MINOR, 2 NOTE**, both MINORs addressed below before this push. Independently re-ran the full clean-install check list itself (matched: 64/64 tests pre-fix, typecheck/lint/build all PASS, dev-identity string confirmed absent from `dist/`), read the real backend source (not just docs) to confirm the UOM-vs-Supplier/Stock-Location `active`-permission asymmetry is genuine backend behavior and that `list()` really does require Owner/Manager server-side, confirmed the scope boundary via diff (Item Master's own diff is empty, `Button.tsx`'s existing variants are byte-identical, no dependency added, `main`/`origin/main` untouched at `73cfd71`), and used Figma MCP itself to screenshot-compare 3 of the 8 states (Create, Access-denied, 409 error) against the rendered components, matching every quoted copy string exactly. It also independently confirmed the port-3000 process's identity and start time (`node.exe`, started 2026-09-23 — three days before this session, consistent with this record's own disclosure above) without sending it any write request.

Findings and disposition:

- **MINOR, fixed**: `handleToggleActive` in `UomMasterPanel.tsx` was silently swallowing a failed activate/deactivate (network error, 500, etc.) — the user would see the action appear to do nothing. Fixed: a failed toggle now shows `Couldn't {de}activate {name}: {reason}` as an inline banner, table stays visible. New regression test added (see the 65th test above).
- **MINOR, fixed**: the reviewer found one undisclosed deviation beyond the four already listed — the access-denied card's missing lock icon/dev-identity badge. Added to the disclosed deviations list above; no code change made (the identity switcher is already permanently visible in the header, so this is cosmetic, not a functional gap).
- **NOTE, fixed**: this record itself said "NOT pushed" while the reviewer found the branch already pushed to origin — that was this record being drafted before the push step; corrected above.
- **NOTE, open, not blocking**: the reviewer ran out of session budget before screenshot-comparing the remaining 5 of 8 Figma states (In shell, sidebar, Default list, Loading, Edit dialog) — it verified those against the task's exact-copy checklist via source code only, not a rendered visual diff. Recommend a follow-up visual pass on these 5 if pixel-level fidelity matters before final sign-off; not treated as a blocker here since the copy/structure-level check already passed and no functional risk was identified.

Codex and Google Antigravity remain paused (GOV-MANAGER-SUBAGENT-001) — this was a same-provider review, not a genuinely external one; recorded per AGENTS.md so the owner can weigh it.

## Not done (explicitly out of scope for this record)

Backend/migrations untouched. Brands/Pack Variants/Suppliers/Purchases/Stock actual screens not built (only their nav placeholders exist). No real login/session. `main` untouched. `chore/claude-code-permission-guardrails` and other worktrees/branches untouched. No merge.

## Push

`feat/ui-uom-master` pushed to origin as a plain (non-force) `git push -u origin feat/ui-uom-master` (new branch). Confirmed via `git rev-parse feat/ui-uom-master origin/feat/ui-uom-master` both resolving to the same commit. `main` untouched throughout.

## Next recommended action

Owner reviews the two fixes and the one open NOTE above; when ready, separately authorize a controlled merge to main. Optionally request the follow-up 5-state Figma visual pass first if pixel fidelity matters before that decision.

---

## Previous handoff — S04-MERGE-001 (Inventory S-04 Merged to Main)

Date: 2026-09-26. Branch: main. Merged from: feat/inv-s04-locations-opening-stock (commit 7d54b0f, application code unchanged at 16b3464 plus the S04-VERIFY-001 documentation commit — see previous record below).
Authority: owner-approved controlled merge, given directly in-session, following the S04-VERIFY-001 independent QA review verdict (PASS — ready for controlled merge, 0 BLOCKER/MAJOR) and real Windows/Docker verification recorded below. Explicit owner instruction: verify fresh remote state first and abort with a report if the candidate, main, or the reviewed application code had changed or diverged since S04-VERIFY-001 — none had.
Roles: Manager (this VS Code Claude Code session) executed the pre-merge verification, the fast-forward merge, and this record. Independent QA/Testing subagent (S04-VERIFY-001, no prior involvement in the implementation) = independent reviewer of record (PASS, owner-confirmed). Codex and Google Antigravity remain paused (GOV-MANAGER-SUBAGENT-001) — this was a same-provider substitute for a genuinely external reviewer, not equivalent to it; recorded again here per AGENTS.md so the owner can weigh it at the point of merge, not only at the point of review.

## Pre-merge fresh-state verification (executed immediately before merging, not assumed)

| Check | Result |
|---|---|
| `git fetch origin` | clean, no errors |
| Candidate branch local vs. remote | both `7d54b0f` (match) |
| `main` local vs. `origin/main` | both `971307f` (match, as expected) |
| `git merge-base main feat/inv-s04-locations-opening-stock` | `971307f` — confirms `main` is a strict ancestor of the candidate (clean fast-forward possible) |
| Application code unchanged since reviewed commit | `git diff --stat 16b3464 7d54b0f` touches only `docs/engineering/CURRENT-HANDOFF.md` (the S04-VERIFY-001 doc commit) — zero application/migration/test changes since the commit the independent QA subagent reviewed |
| Main worktree state | clean (only pre-existing, unrelated untracked files: `00-PROJECT-MASTER.md`, `Claude outputs/`, `backend/tmp/`); no uncommitted tracked work to disturb |

No divergence, no unexpected changes, no conflict risk found — merge proceeded as authorized.

## Merge

- Previous main HEAD: `971307f` (S-01 + S-02 + S-03 + UI foundation + S03-MINOR-001 leap-year coverage).
- Merged branch HEAD: `7d54b0f`.
- New main HEAD: `7d54b0f`.
- Merge type: fast-forward (`git merge --ff-only origin/feat/inv-s04-locations-opening-stock`), executed directly on the main worktree's already-checked-out `main` branch (no checkout/branch switch performed, so no active session or uncommitted work was disturbed). 31 files changed, 1499 insertions(+), 21 deletions(-) — the same file list reported in S04-VERIFY-001/S04-IMPL-001, nothing more.
- Post-merge tree check: `git diff main feat/inv-s04-locations-opening-stock` — empty, confirming `main`'s tree is byte-identical to the reviewed candidate.
- `git push origin main`: completed — `971307f..7d54b0f main -> main`.
- Post-push verification: fresh `git fetch origin` then `git rev-parse main` == `git rev-parse origin/main` == `7d54b0f`.
- Feature branch `feat/inv-s04-locations-opening-stock` preserved (not deleted) on origin, confirmed still present via `git ls-remote` at `7d54b0f`.

Test suite was not re-run for this merge: the application tree is unchanged since the commit (`16b3464`) that S04-VERIFY-001 already verified twice (Manager run + independent QA subagent run) on the owner's real Docker Desktop PostgreSQL 17.11, with identical PASS results both times. Re-running against unchanged code was judged unnecessary per project token-discipline policy; nothing in this merge introduces new risk that would require it.

## S-04 completion status

S-04 is now officially on `main`: implementation + independent QA review (PASS) + real-environment verification (Windows/Docker Desktop PostgreSQL 17.11) + owner-approved merge + post-merge tree/remote verification are all satisfied. Inventory S-01, S-02, S-03, and S-04 are all merged to main.

## Out of scope for this record (explicitly not done)

No migration or deployment was run against the operational database (`erp_local`) — the new S-04 migration has only ever been applied inside disposable, uniquely-suffixed `erp_test` schemas during testing. Applying it to `erp_local` is a separate, not-yet-authorized action. `chore/claude-code-permission-guardrails` was not touched. No cleanup of the temporary documentation worktree (`Ideal-Tasty-Point-ERP-s04-doc`) was performed — it remains on disk pending owner instruction. S-05 (Goods Receiving) was not started.

## Next recommended action

Owner decides when to authorize applying the S-04 migration to a real environment (`erp_local`, when ready for that data change) and when to start S-05. No further action is blocked by this record.

---

## Previous handoff — S04-VERIFY-001 (Stock Locations + Opening Stock — Independent QA Verified on Windows/Docker)

Date: 2026-09-26. Branch: feat/inv-s04-locations-opening-stock (base: main @ 971307f; HEAD unchanged at 16b3464 — this record adds only this documentation entry on top). Status: implemented + independently reviewed (PASS) + real owner-environment verification complete. Push to origin authorized and performed by this record. **NOT merged to main** — merge requires a separate, further owner approval.
Authority: owner decisions 2026-09-26 recorded in `docs/decisions/ADR-0008-s04-stock-locations-opening-stock.md` (slice order, freezer-level locations, correction by reasoned adjustment, quantity-only). Implementation: Cowork Manager session (prior record, preserved below as S04-IMPL-001). This record: owner explicitly authorized (a) real Windows/Docker verification and independent QA review, (b) pushing the feature branch, (c) this bounded documentation update — explicitly withholding merge-to-main authorization.
Roles: Manager (this VS Code Claude Code session) ran verification in isolated git worktrees and coordinated review; a fresh in-house QA/Testing subagent with no prior involvement in the S-04 implementation independently re-ran every check and independently verified code-level safety properties from source. Codex and Google Antigravity remain paused (GOV-MANAGER-SUBAGENT-001); this is a same-provider substitute for a genuinely external reviewer, not equivalent to it — recorded here per AGENTS.md so the owner can weigh it.

## What was built

Backend only. Stock Location master (branch-owned STORE/KITCHEN/FREEZER, freezer under a STORE/KITCHEN parent), append-only stock ledger with OPENING and ADJUSTMENT movements in Base UOM, current balances and movement history. Full details, API table and requirement-to-test traceability: `docs/engineering/inventory-s04-implementation.md`. No files changed by this verification record beyond this handoff entry.

Migration: `backend/migrations/202609260001_inventory_s04_locations_opening_stock.sql` (new tables only). Grants: `backend/scripts/runtime-grants.sql` extended — INSERT-only on the ledger.

## Real-environment verification (owner's Windows 11 + Docker Desktop PostgreSQL 17.11, Node v24.18.1, dedicated `erp_test` database, unique schema per run — `erp_local` never touched)

Run twice, independently, with identical results both times: once by the Manager session in an isolated worktree, once freshly reproduced from scratch by the independent QA subagent in its own separate isolated worktree.

| Check | Result |
|---|---|
| npm ci --ignore-scripts | PASS — 221 packages, 0 vulnerabilities |
| typecheck | PASS |
| lint | PASS |
| build | PASS |
| test:unit | PASS — 319/319 (7 files; 268 + 51 new) |
| test:integration | PASS — 80/80 (4 files; 61 + 19 new), real authoritative migrate CLI + shipped runtime grants |

This closes the gap both the implementation doc and the prior handoff entry (below) flagged: the Cowork Linux VM run (PostgreSQL 17.10 embedded) is now confirmed on the owner's actual Docker Desktop PostgreSQL 17.11 environment, with identical pass counts.

## Independent review

Fresh in-house QA/Testing subagent, no prior involvement in the S-04 implementation — **PASS — ready for controlled merge**. 0 BLOCKER, 0 MAJOR. Independently confirmed from source code (not taken on the traceability doc's word): branch isolation on every stock read/write; append-only ledger enforced at three layers (no PATCH/DELETE route, INSERT-only runtime grants, BEFORE UPDATE/DELETE/TRUNCATE triggers that reject even the schema owner); non-negative balance enforced at both application and DB-trigger level; exactly one OPENING per item+location enforced by a DB unique index (race-safe, proven with a genuine 6-way concurrent test); Owner-only location activation, including the bundled-with-rename attack case; full-snapshot immutable audit tables; quantity-only scope (grepped the whole new schema/code for cost/value/rate/price — no real match); no scope creep — the diff outside new files is mechanical `buildApp` wiring and migration-list assertion updates only, no frontend files, no other module's business logic touched. Every acceptance-criteria row in `inventory-s04-implementation.md`'s requirement table was cross-checked against the actual test bodies (not just file/title existence).

**1 NOTE (non-blocking, pre-existing pattern, not specific to S-04):** integration test runs leave their uniquely-suffixed schemas behind in `erp_test` (28 accumulated across S-01–S-04 at time of review) instead of dropping them in `afterAll`. Safe — isolated to `erp_test`, `erp_local` never touched — but worth a future cleanup pass in the shared test harness.

## Process deviation recorded (transparency, not a merge blocker)

While assembling its own isolated verification worktree, the independent QA subagent removed a prior temporary verification worktree (`Ideal-Tasty-Point-ERP-s04-verify`, created earlier in this same review chain for the Manager's own first verification pass) as part of establishing a "clean slate," and later removed its own temporary worktree (`Ideal-Tasty-Point-ERP-s04-qa`) after finishing. Neither action was explicitly pre-authorized under the task's standing "no cleanup" instruction for this review round. No application file, branch history, commit, or the feature branch itself was affected — only disposable local verification worktrees, which are not part of any deliverable. Reported to the owner for awareness; no objection raised.

## Push

`feat/inv-s04-locations-opening-stock` pushed to origin as a plain (non-force) `git push origin feat/inv-s04-locations-opening-stock` (new branch, no prior remote ref existed), owner-authorized in this record. Confirmed after a fresh `git fetch origin`: local `git rev-parse feat/inv-s04-locations-opening-stock` and `git rev-parse origin/feat/inv-s04-locations-opening-stock` both resolve to `16b3464`, and `git ls-remote origin feat/inv-s04-locations-opening-stock` independently returns the same `16b3464` — the reviewed commit is unchanged and matches the pushed remote exactly. `main`, the `chore/claude-code-permission-guardrails` branch (explicitly out of scope, untouched throughout this whole review), the operational database (`erp_local`), and the other unrelated worktrees were not touched by this push or any other action in this record.

## Open / defaults to confirm

DEFAULT / ASSUMED (ADR-0008 D-04, D-05): balance never below zero in S-04; locations with stock or active freezers cannot be deactivated. No frontend screens in this slice.

## Next recommended action

Owner reviews this record; when ready, separately authorize a controlled merge to main (the branch remains a strict fast-forward descendant of main @ 971307f, so no conflicts expected — re-verify with a fresh `git status`/`git log` immediately before merging, as always). Do not start receiving (S-05) automatically.

---

## Previous handoff — S04-IMPL-001 (Stock Locations + Opening Stock, quantity-only)

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
