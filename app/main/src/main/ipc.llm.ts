import type { IpcChannel } from '../bootstrap/ipc-channels.js';

export interface ClarificationTurn { questionId: string; optionId: string; timestamp: string }
export interface ClarificationContext { turns: ClarificationTurn[] }
export interface LastChoice { questionId: string; optionId: string }

export interface LlmNextQuestionRequest {
  context: ClarificationContext;
  lastChoice: LastChoice;
}

export interface LlmNextQuestionResponse {
  question: {
    id: string;
    text: string;
    options: Array<{ id: string; label: string; value?: string }>;
  };
}

export interface OkrDraftRequest {
  context?: ClarificationContext;
  sessionId?: string;
}

export interface OkrDraftResponse {
  okr: unknown;
  session: unknown;
}

export type LlmIpcHandler<Req, Res> = (
  channel: IpcChannel,
  handler: (_event: unknown, payload: Req) => Promise<Res>
) => void;

// This module provides types for the LLM-related IPC handlers. The actual
// registrations occur in the window controller to keep wiring centralized.

