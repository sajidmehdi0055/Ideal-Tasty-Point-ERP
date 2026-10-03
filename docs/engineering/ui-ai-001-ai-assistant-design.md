# UI-AI-001 — AI Assistant screen (Figma design, owner-approved)

Date: 2026-09-30. Track: PARALLEL TRACK (design only — no frontend code, no backend/API/migration change).
Authority: owner approved the Figma proposal "with the 2 small corrections" (2026-09-30); both corrections applied before this record.
Backend contract: AI-S01 on main 5b39a3c — `GET /api/ai/status`, `POST /api/ai/chat` ([AI_ARCHITECTURE.md](../architecture/AI_ARCHITECTURE.md) §6).
Design source: Figma file `N9KkqXIQuvCUj9NVAj6Cx4`, section `104:3226` "APPROVED 2026-09-30 — AI Assistant (UI-AI-001)". Colours = variable collection `ITP / Theme` (Light + Dark). Shell = approved ERP Shell v2 components (section `86:2`).

## Decision: where it lives

Slide-over panel opened from an "Ask AI" button in the header, usable from any screen (Option B). Rejected: a sidebar entry with a full page (Option A) — the user would have to leave the screen they are checking the answer against.

Reasons: no loss of context; the chat request's `module` field (inventory / purchasing / stock) carries the current screen's module; same overlay idea as the approved sidebar Peek (no layout shift); "Expand" widens the panel for tables.

## Behaviour

- Header "Ask AI" button (left of the branch switcher) on every screen; ✕ or Esc closes; the conversation stays while moving between screens in the same tab.
- Desktop (mouse): 440 px panel under the header, over the content, no scrim; Expand → 760 px.
- Tablet (touch): 480 px full-height sheet with scrim; tap outside closes; 36 px tap targets.
- Mobile (< 768 px): full-screen sheet with the same components (not drawn).
- Button visibility from `GET /api/ai/status`: `available: true` → normal; `enabled: false` (DISABLED / MISCONFIGURED) → button stays, the panel explains; `available: false` → button hidden.
- Composer: Enter sends, Shift+Enter new line, 4,000-character counter; locked while waiting (one question at a time). "New chat" clears the local history.
- UI labels in English (like the rest of the ERP); the assistant answers in the user's language (Roman Urdu / Urdu / English).

## States (Light frames; each has a Dark twin in the same section)

| # | State | Figma (Light) |
|---|---|---|
| 01 | Welcome / empty — suggestions only for the AI-S01 read-only tools; "not available yet: sales, cash, wastage, HR, attendance, low-stock alerts" | 105:3228 |
| 02 | Waiting for answer — generic indicator + elapsed timer (no streaming) | 105:3647 |
| 03 | Answer with "ERP data used" chips (from `tool_calls`) + meta line | 105:4020 |
| 04 | Long answer with table — Expanded 760 px | 105:4442 |
| 05 | Roman Urdu conversation | 105:4861 |
| 06 | 503 AI_PROVIDER_UNAVAILABLE — "AI model is offline" + Retry | 105:5276 |
| 07 | 429 AI_RATE_LIMITED — warning + Retry | 106:4964 |
| 08 | 500 AI_AUDIT_FAILED — "Stopped for safety" + Retry; composer shows the 4,000-char check (400) | 106:5372 |
| 09 | 503 AI_DISABLED — turned off by admin (AI_UNAVAILABLE variant text inside) | 106:5750 |
| 10 | 403 AI_FORBIDDEN — not available for this role | 106:6083 |
| 11 | FUTURE (AI-S02, not Phase 1) — approval card for `proposed_action`: Approve / Edit / Reject | 106:6411 |
| 12 | Tablet (touch) — sheet with scrim | 106:6874 |

Tool → chip labels, chip status icons and the full error → state table are on the board `104:3288` in the same section.

## Frontend contract gaps (the UI must not pretend these exist)

1. No real login/session yet — no fake user; 401 is a shell-level state (future).
2. Conversation history is client-side only (stateless API, ≤ 20 turns / 32,000 chars as `history`); lost on refresh; not a stored record.
3. No streaming — tool-by-tool progress cannot be shown.
4. No cancel endpoint — the client may stop waiting; the server still finishes and audits.
5. 429 carries no Retry-After value — UI text "wait about a minute".
6. `message` is plain model text — tables need safe Markdown rendering (no raw HTML).
7. `tool_calls` carry only name / mode / status — no row counts or truncation flag.
8. No branch in the AI response — branch shown in the header only once a real branch contract exists.
9. `proposed_action` shape not defined — approval card is FUTURE (AI-S02 adds approval storage + endpoint).
10. Do not call `status?check=true` when the panel opens (real model call, rate-limited).
11. No feedback (thumbs) API — not designed.

## Open items for the implementation slice (UI-AI-002)

Status 2026-10-03: implemented on `feat/ui-ai-002-assistant-panel` (not merged) — see [ui-ai-002-implementation.md](ui-ai-002-implementation.md). The items below are kept as written at design approval.

- Add "Ask AI" as a slot of `Shell/Header` (hidden when `available: false`) plus an icon-only version for the mobile header — the approved `Shell/Header` Figma component was intentionally not modified yet.
- Depends on ERP Shell v2 (`feat/ui-shell-v2`, implemented + reviewed, not yet pushed/merged) because the header and theme tokens live there.
- Sample data in the frames (suppliers, GRN/PO numbers, rates) is illustrative only.
- The Cowork "Ideal Tasty Point" Design System artifact still holds stale navy / Source Serif light-only tokens (doc 05 §10); not used here; reconcile separately.
