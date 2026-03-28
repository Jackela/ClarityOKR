/**
 * IPC Payload Types for Clarification Controller
 *
 * This module defines all payload types used for IPC communication between
 * the main process and renderer. It supports both new and legacy payload
 * formats for backward compatibility.
 *
 * @module windows/clarification-ipc-payloads
 */

/**
 * Represents a single turn in the clarification conversation.
 */
export interface ClarificationTurn {
  /** Unique identifier for the question */
  questionId: string;
  /** Selected option identifier */
  optionId: string;
  /** ISO timestamp of when the selection was made */
  timestamp: string;
}

/**
 * Context containing the history of clarification turns.
 */
export interface ClarificationContext {
  /** Array of question-answer pairs from the current session */
  turns: ClarificationTurn[];
}

/**
 * Represents the user's most recent selection.
 */
export interface LastChoice {
  /** Question that was answered */
  questionId: string;
  /** Option that was selected */
  optionId: string;
}

/**
 * New format for LLM_NEXT_QUESTION IPC channel.
 * Preferred format using explicit session and question IDs.
 */
export interface NextQuestionPayloadNew {
  /** Active session identifier */
  sessionId: string;
  /** Current question being answered */
  currentQuestionId: string;
  /** Clarification context with turn history */
  context: ClarificationContext;
}

/**
 * Legacy format for LLM_NEXT_QUESTION IPC channel.
 * Used for backward compatibility with older renderer versions.
 */
export interface NextQuestionPayloadOld {
  /** Clarification context with turn history */
  context: ClarificationContext;
  /** User's most recent selection */
  lastChoice: LastChoice;
}

/**
 * Union type supporting both new and legacy payload formats.
 */
export type NextQuestionPayload = NextQuestionPayloadNew | NextQuestionPayloadOld;

/**
 * New format for LLM_GENERATE_DRAFT IPC channel.
 * Preferred format using explicit session ID.
 */
export interface GenerateDraftPayloadNew {
  /** Active session identifier */
  sessionId: string;
}

/**
 * Legacy format for LLM_GENERATE_DRAFT IPC channel.
 * Used for backward compatibility with older renderer versions.
 */
export interface GenerateDraftPayloadOld {
  /** Clarification context with turn history */
  context: ClarificationContext;
}

/**
 * Union type supporting both new and legacy payload formats.
 */
export type GenerateDraftPayload = GenerateDraftPayloadNew | GenerateDraftPayloadOld;

/**
 * Type guard to check if payload uses the new format for LLM_NEXT_QUESTION.
 *
 * @param payload - The payload to check
 * @returns True if the payload matches the new format with sessionId and currentQuestionId
 */
export function isNextQuestionPayloadNew(payload: unknown): payload is NextQuestionPayloadNew {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'sessionId' in payload &&
    typeof (payload as Record<string, unknown>).sessionId === 'string' &&
    'currentQuestionId' in payload &&
    typeof (payload as Record<string, unknown>).currentQuestionId === 'string'
  );
}

/**
 * Type guard to check if payload uses the legacy format for LLM_NEXT_QUESTION.
 *
 * @param payload - The payload to check
 * @returns True if the payload matches the legacy format with context and lastChoice
 */
export function isNextQuestionPayloadOld(payload: unknown): payload is NextQuestionPayloadOld {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'context' in payload &&
    'lastChoice' in payload &&
    typeof (payload as Record<string, unknown>).lastChoice === 'object' &&
    (payload as Record<string, unknown>).lastChoice !== null &&
    'questionId' in ((payload as Record<string, unknown>).lastChoice as Record<string, unknown>)
  );
}

/**
 * Type guard to check if payload uses the new format for LLM_GENERATE_DRAFT.
 *
 * @param payload - The payload to check
 * @returns True if the payload matches the new format with sessionId
 */
export function isGenerateDraftPayloadNew(payload: unknown): payload is GenerateDraftPayloadNew {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'sessionId' in payload &&
    typeof (payload as Record<string, unknown>).sessionId === 'string'
  );
}
