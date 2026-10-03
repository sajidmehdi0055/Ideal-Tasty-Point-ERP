# UI-AI-002 — AI Assistant panel (frontend implementation)

Date: 2026-10-03. Track: PARALLEL TRACK (frontend only — no backend, API, migration or auth change; no new npm dependency).
Branch: `feat/ui-ai-002-assistant-panel` (from main 889a5e2). Status: implemented + independently reviewed; merged to main 2026-10-03 (fast-forward, UI-AI-002-MERGE-001).
Design: [ui-ai-001-ai-assistant-design.md](ui-ai-001-ai-assistant-design.md) (UI-AI-001, Figma section `104:3226`, board `104:3288`). Contract: [AI_ARCHITECTURE.md](../architecture/AI_ARCHITECTURE.md) §6.
Scope: Phase 1 = states 01–10, 12 (tablet) and the mobile full-screen sheet. State 11 (`proposed_action` approval card) is AI-S02 — not built.

## Code

`frontend/src/features/ai-assistant/`

| File | Purpose |
|---|---|
| `api.ts`, `types.ts` | `GET /api/ai/status` (plain — never `?check=true`), `POST /api/ai/chat`; types mirror the backend |
| `AiAssistantProvider.tsx` | Tab-level state above the routes: status/availability, panel open/expanded, conversation (memory only), draft, error state; one request at a time |
| `history.ts`, `limits.ts` | Client history: newest whole pairs, ≤ 20 turns / 32,000 chars, stop at a turn > 8,000 chars, trimmed, NUL removed, failed questions excluded |
| `module.ts` | Request `module` from the screen: Item Master / Catalog Settings → `inventory`, Suppliers / Purchases → `purchasing`, Stock → `stock`; other routes send none |
| `tool-labels.ts` | Chip labels and status tones from board 104:3288; unknown tools show their raw name |
| `errors.ts` | Error → UI state mapping (board 104:3288) |
| `markdown.tsx` | In-house safe Markdown subset (React elements only — no `dangerouslySetInnerHTML`, no links/images/URLs, raw HTML shown as text); memoised; inline parse bounded (lines > 4,000 chars shown as plain text) |
| `components/AskAiButton.tsx` | Header button; text label ≥ 1280 px, icon-only below (as in the tablet frame and mobile header) |
| `components/AiAssistantPanel.tsx` | Desktop 440 px non-modal under the header (Expand 760), touch 480 px modal sheet with scrim, mobile full-screen modal; Esc/✕ close and focus return |
| `components/Composer.tsx`, `Messages.tsx`, `PanelContent.tsx` | Composer rules, answers/chips/meta/copy, waiting state, error cards, welcome and full-panel states |

Shell changes: `Header.tsx` (button first in the right-hand group — the branch switcher is not rendered yet), `AppShell.tsx` (renders the panel; whole shell `inert` while the tablet/mobile sheet is open), `App.tsx` (provider above the routes). 20 Lucide icons added to `design-system/icons` (lucide-static 1.48.0, ISC).

## Behaviour decisions inside the approved design

- Status is read once per page load. `available: true` → button; `enabled: false` → button + explanation (DISABLED → frame 09, MISCONFIGURED → AI_UNAVAILABLE text); `available: false` → no button. If the status call itself fails (e.g. 401 before real auth, network) the button stays hidden — availability cannot be confirmed and no sign-in state is invented.
- A chat answer of 403 AI_FORBIDDEN / 503 AI_DISABLED / AI_UNAVAILABLE switches the panel to the full state until the page is reloaded ("New chat" does not clear it).
- 503 AI_PROVIDER_UNAVAILABLE sets the status pill to "Model offline" until the next successful answer.
- Retry resends the identical request (same question, module and history) and is offered only on the latest failed question.
- A suggestion fills the composer; it is not sent automatically (some suggestions need a supplier/item name).
- Status pill / meta line: provider `local` → "Local model", `openai` / `anthropic` → "Cloud model"; `fallback_used` → "(fallback)". The model name is not shown.
- Over-length is checked on the raw text length (the backend trims first, so the client is at most a few whitespace characters stricter).

## Contract gaps (design doc list) — how the UI handles them

1. No login: no fake user. A 401 from chat is shown as a plain "Not signed in" card without Retry (interim until the shell-level sign-in state exists).
2. History is client-side only, memory for the tab; lost on refresh; "New chat" clears it.
3. No streaming: generic "Checking ERP data…" indicator + elapsed seconds (hidden from screen readers so it is not read out every second).
4. No cancel: closing the panel only stops waiting visibly; the answer still arrives and is shown on reopen. "New chat" is disabled while waiting.
5. 429 has no Retry-After: text "Wait about a minute, then press Retry".
6. Plain model text: safe Markdown subset above.
7. Chips show only name/status — no row counts or truncation claims. `limit_reached` → "Answer may be incomplete".
8. No branch in the header or panel.
9. `proposed_action` is never rendered (AI-S02).
10. `status?check=true` is never called (test + `dist/` grep).
11. No feedback buttons. "Copy" copies the answer text to the clipboard (client-only).

## Known deviations / limitations

- Mobile: the long composer placeholder is clipped (Chromium does not ellipsize a textarea placeholder).
- The composer grows to about 5 lines (Figma frame 08 shows 3) before it scrolls.
- Visual check was done against the Figma renders with Playwright/Chromium on the production build with mocked API responses (Catalog Settings shows its own "no access" message in the production build because there is no real session — pre-existing, out of scope).
