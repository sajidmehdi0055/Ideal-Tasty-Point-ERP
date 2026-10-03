import { apiClient } from '../../lib/api-client';
import type { AiChatRequest, AiChatResponse, AiStatusResponse } from './types';

/**
 * Plain status only. `?check=true` is deliberately never used by the UI: it
 * makes a real, rate-limited model call (UI-AI-001 contract gap 10).
 */
export function getAiStatus(): Promise<AiStatusResponse> {
  return apiClient.get<AiStatusResponse>('/api/ai/status');
}

export function sendAiChat(request: AiChatRequest): Promise<AiChatResponse> {
  return apiClient.post<AiChatResponse>('/api/ai/chat', request);
}
