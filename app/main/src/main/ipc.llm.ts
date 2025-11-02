import type { IpcChannel } from '../bootstrap/ipc-channels.js';

export type ClarificationTurn = { questionId: string; optionId: string; timestamp: string };
export type ClarificationContext = { turns: ClarificationTurn[] };
export type LastChoice = { questionId: string; optionId: string };

export type LlmNextQuestionRequest = {
  context: ClarificationContext;
  lastChoice: LastChoice;
};

export type LlmNextQuestionResponse = {
  question: {
    id: string;
    text: string;
    options: Array<{ id: string; label: string; value?: string }>;
  };
};

export type OkrDraftRequest = {
  context?: ClarificationContext;
};

export type OkrDraftResponse = {
  okr: unknown;
  session: unknown;
};

export type LlmIpcHandler<Req, Res> = (
  channel: IpcChannel,
  handler: (_event: unknown, payload: Req) => Promise<Res>
) => void;

// This module provides types for the LLM-related IPC handlers. The actual
// registrations occur in the window controller to keep wiring centralized.

