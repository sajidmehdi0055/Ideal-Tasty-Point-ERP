import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { useLocation } from 'react-router-dom';
import { getAiStatus, sendAiChat } from './api';
import { classifyChatError, type AiBlockedKind, type AiCardKind } from './errors';
import { buildHistory } from './history';
import { MAX_MESSAGE_CHARS } from './limits';
import { moduleForPath } from './module';
import type { AiChatRequest, AiChatResponse, AiModule, AiStatusResponse } from './types';

/**
 * What GET /api/ai/status allows (UI-AI-001 "Button visibility"):
 *  - `ready`        available: true → button + normal panel
 *  - `disabled`     enabled: false, state DISABLED → button stays, panel explains (frame 09)
 *  - `misconfigured` enabled: false, state MISCONFIGURED → same, AI_UNAVAILABLE text
 *  - `hidden`       available: false → no button
 *  - `unknown`      still loading, or the status call itself failed (401 before
 *                   real auth exists, network error, …) → no button: the UI
 *                   cannot confirm the assistant is usable and must not
 *                   pretend it is (contract gap 1: no fake login state).
 */
export type AiAvailability = 'unknown' | 'hidden' | 'ready' | 'disabled' | 'misconfigured';

export function availabilityFromStatus(status: AiStatusResponse): AiAvailability {
  if (!status.enabled) return status.state === 'MISCONFIGURED' ? 'misconfigured' : 'disabled';
  return status.available === true ? 'ready' : 'hidden';
}

export interface AiTurnError {
  kind: AiCardKind;
  status: number;
  code: string;
  message: string;
}

export interface AiTurn {
  id: number;
  question: string;
  /** Exactly what was (or will be re-)sent — Retry resends the same request. */
  request: AiChatRequest;
  state: 'waiting' | 'answered' | 'failed';
  startedAt: number;
  elapsedMs?: number | undefined;
  response?: AiChatResponse | undefined;
  error?: AiTurnError | undefined;
}

export interface AiAssistantContextValue {
  availability: AiAvailability;
  status: AiStatusResponse | null;
  /** Set by a chat error (403 / 503 AI_DISABLED / AI_UNAVAILABLE); overrides the conversation. */
  blocked: AiBlockedKind | null;
  /** The last chat failed with 503 AI_PROVIDER_UNAVAILABLE and nothing has succeeded since. */
  providerOffline: boolean;
  open: boolean;
  expanded: boolean;
  turns: AiTurn[];
  waiting: boolean;
  draft: string;
  composerError: string | null;
  currentModule: AiModule | undefined;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  toggleExpanded: () => void;
  setDraft: (text: string) => void;
  send: () => void;
  retry: (turnId: number) => void;
  newChat: () => void;
}

const AiAssistantContext = createContext<AiAssistantContextValue | null>(null);
// Kept out of the main value so components never read a ref during render.
const AiTriggerRefContext = createContext<RefObject<HTMLButtonElement | null> | null>(null);

/** The header "Ask AI" button — focus returns to it when the panel closes. */
export function useAiTriggerRef(): RefObject<HTMLButtonElement | null> | null {
  return useContext(AiTriggerRefContext);
}

/** Optional on purpose: shell pieces rendered without the provider (unit tests) simply show no AI UI. */
export function useAiAssistant(): AiAssistantContextValue | null {
  return useContext(AiAssistantContext);
}

/**
 * Holds the AI Assistant state for the browser tab: status, panel open /
 * expanded, the local conversation and the composer draft. Mounted above
 * the routes, so the conversation survives moving between screens; it is
 * memory only — lost on refresh and never stored (contract gap 2).
 */
export function AiAssistantProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const currentModule = moduleForPath(location.pathname);

  const [status, setStatus] = useState<AiStatusResponse | null>(null);
  const [availability, setAvailability] = useState<AiAvailability>('unknown');
  const [blocked, setBlocked] = useState<AiBlockedKind | null>(null);
  const [providerOffline, setProviderOffline] = useState(false);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [draft, setDraftState] = useState('');
  const [composerError, setComposerError] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const nextIdRef = useRef(1);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  // Bumped by "New chat"; a late answer from before the reset is dropped.
  const conversationRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    getAiStatus().then(
      result => {
        if (ignore) return;
        setStatus(result);
        setAvailability(availabilityFromStatus(result));
      },
      () => {
        if (!ignore) setAvailability('unknown');
      },
    );
    return () => {
      ignore = true;
    };
  }, []);

  const waiting = turns.some(turn => turn.state === 'waiting');

  const runRequest = useCallback((turnId: number, request: AiChatRequest) => {
    const conversation = conversationRef.current;
    const startedAt = Date.now();
    inFlightRef.current = true;
    sendAiChat(request).then(
      response => {
        inFlightRef.current = false;
        if (!mountedRef.current || conversation !== conversationRef.current) return;
        setProviderOffline(false);
        setTurns(current =>
          current.map(turn =>
            turn.id === turnId
              ? { ...turn, state: 'answered', response, elapsedMs: Date.now() - startedAt, error: undefined }
              : turn,
          ),
        );
      },
      (error: unknown) => {
        inFlightRef.current = false;
        if (!mountedRef.current || conversation !== conversationRef.current) return;
        const outcome = classifyChatError(error);
        if (outcome.target === 'composer') {
          // 400: the question goes back into the composer with the reason under it.
          setTurns(current => current.filter(turn => turn.id !== turnId));
          setDraftState(request.message);
          setComposerError(outcome.message);
          return;
        }
        if (outcome.target === 'blocked') {
          setTurns(current => current.filter(turn => turn.id !== turnId));
          setBlocked(outcome.kind);
          return;
        }
        if (outcome.kind === 'offline') setProviderOffline(true);
        setTurns(current =>
          current.map(turn =>
            turn.id === turnId
              ? {
                  ...turn,
                  state: 'failed',
                  elapsedMs: Date.now() - startedAt,
                  error: { kind: outcome.kind, status: outcome.status, code: outcome.code, message: outcome.message },
                }
              : turn,
          ),
        );
      },
    );
  }, []);

  const send = useCallback(() => {
    // One question at a time (composer is locked while waiting).
    if (inFlightRef.current || blocked || availability !== 'ready') return;
    const message = draft;
    if (message.trim() === '' || message.length > MAX_MESSAGE_CHARS) return;
    const history = buildHistory(
      turns
        .filter(turn => turn.state === 'answered' && turn.response)
        .map(turn => ({ question: turn.question, answer: turn.response?.message ?? '' })),
    );
    const request: AiChatRequest = { message };
    if (currentModule) request.module = currentModule;
    if (history.length > 0) request.history = history;
    const id = nextIdRef.current;
    nextIdRef.current += 1;
    setTurns(current => [...current, { id, question: message, request, state: 'waiting', startedAt: Date.now() }]);
    setDraftState('');
    setComposerError(null);
    runRequest(id, request);
  }, [availability, blocked, currentModule, draft, runRequest, turns]);

  const retry = useCallback(
    (turnId: number) => {
      if (inFlightRef.current || blocked) return;
      const turn = turns.find(candidate => candidate.id === turnId);
      if (!turn || turn.state !== 'failed') return;
      setTurns(current =>
        current.map(candidate =>
          candidate.id === turnId
            ? { ...candidate, state: 'waiting', startedAt: Date.now(), error: undefined, elapsedMs: undefined }
            : candidate,
        ),
      );
      runRequest(turnId, turn.request);
    },
    [blocked, runRequest, turns],
  );

  const newChat = useCallback(() => {
    if (inFlightRef.current) return;
    conversationRef.current += 1;
    setTurns([]);
    setComposerError(null);
  }, []);

  const setDraft = useCallback((text: string) => {
    setDraftState(text);
    setComposerError(null);
  }, []);

  const openPanel = useCallback(() => setOpen(true), []);
  const closePanel = useCallback(() => setOpen(false), []);
  const togglePanel = useCallback(() => setOpen(current => !current), []);
  const toggleExpanded = useCallback(() => setExpanded(current => !current), []);

  const value = useMemo<AiAssistantContextValue>(
    () => ({
      availability,
      status,
      blocked,
      providerOffline,
      open: open && availability !== 'unknown' && availability !== 'hidden',
      expanded,
      turns,
      waiting,
      draft,
      composerError,
      currentModule,
      openPanel,
      closePanel,
      togglePanel,
      toggleExpanded,
      setDraft,
      send,
      retry,
      newChat,
    }),
    [
      availability,
      status,
      blocked,
      providerOffline,
      open,
      expanded,
      turns,
      waiting,
      draft,
      composerError,
      currentModule,
      openPanel,
      closePanel,
      togglePanel,
      toggleExpanded,
      setDraft,
      send,
      retry,
      newChat,
    ],
  );

  return (
    <AiTriggerRefContext.Provider value={triggerRef}>
      <AiAssistantContext.Provider value={value}>{children}</AiAssistantContext.Provider>
    </AiTriggerRefContext.Provider>
  );
}
