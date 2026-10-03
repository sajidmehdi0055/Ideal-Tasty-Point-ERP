/** Backend limits (AI_ARCHITECTURE.md §8 / ai/routes.ts) — the UI enforces the same numbers. */
export const MAX_MESSAGE_CHARS = 4000;
export const MAX_HISTORY_TURNS = 20;
export const MAX_HISTORY_CHARS = 32000;
/** Per-turn limit of the backend `history[].content` schema. */
export const MAX_HISTORY_TURN_CHARS = 8000;
