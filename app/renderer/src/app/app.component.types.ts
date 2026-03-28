/**
 * Type guards and interfaces for AppComponent
 */
import type { ClarificationPrompt } from '@clarityokr/contracts';

/** Type guard for objects with a question property */
export function hasQuestionProperty(obj: unknown): obj is { question: unknown } {
  if (typeof obj !== 'object' || obj === null) return false;
  const record = obj as Record<string, unknown>;
  return 'question' in record && record.question !== undefined;
}

/** Draft response from LLM */
export interface DraftResponse {
  draft?: {
    objectives?: Array<{ title?: string }>;
  };
}

/** Type guard for DraftResponse validation */
export function isDraftResponse(obj: unknown): obj is DraftResponse {
  if (typeof obj !== 'object' || obj === null) return false;
  const record = obj as Record<string, unknown>;
  return record.draft !== undefined && typeof record.draft === 'object' && record.draft !== null;
}

/** Helper type for history turns */
export interface HistoryTurn {
  questionId: string;
  optionId: string;
  timestamp: string;
}

/** Clarification option selected by user */
export interface SelectedOption {
  promptId: string;
  optionId: string;
}

/** Re-export for convenience */
export type { ClarificationPrompt };
