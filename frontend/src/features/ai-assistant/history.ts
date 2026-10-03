import type { AiHistoryTurn } from './types';
import { MAX_HISTORY_CHARS, MAX_HISTORY_TURNS, MAX_HISTORY_TURN_CHARS } from './limits';

/** One finished question/answer pair of the local (client-only) conversation. */
export interface CompletedExchange {
  question: string;
  answer: string;
}

/**
 * Builds the `history` field for POST /api/ai/chat from the finished
 * exchanges of this tab (UI-AI-001 contract gap 2: the API is stateless and
 * the client sends recent turns). Rules:
 *  - newest exchanges are kept, oldest dropped first;
 *  - whole question/answer pairs only, so the model never sees an answer
 *    without its question;
 *  - at most MAX_HISTORY_TURNS turns and MAX_HISTORY_CHARS characters in
 *    total (the backend rejects more with 400);
 *  - a pair with a turn longer than the backend's per-turn limit (or an
 *    empty one) ends the history there — older context is not sent past a
 *    gap, so the conversation the model sees stays contiguous.
 * Failed questions are never part of `exchanges`.
 */
export function buildHistory(exchanges: readonly CompletedExchange[]): AiHistoryTurn[] {
  const pairs: AiHistoryTurn[][] = [];
  let turns = 0;
  let chars = 0;
  for (let index = exchanges.length - 1; index >= 0; index -= 1) {
    const exchange = exchanges[index];
    if (!exchange) break;
    const question = exchange.question.trim();
    const answer = exchange.answer.trim();
    if (!question || !answer) break;
    if (question.length > MAX_HISTORY_TURN_CHARS || answer.length > MAX_HISTORY_TURN_CHARS) break;
    const pairChars = question.length + answer.length;
    if (turns + 2 > MAX_HISTORY_TURNS || chars + pairChars > MAX_HISTORY_CHARS) break;
    turns += 2;
    chars += pairChars;
    pairs.unshift([
      { role: 'user', content: question },
      { role: 'assistant', content: answer },
    ]);
  }
  return pairs.flat();
}
