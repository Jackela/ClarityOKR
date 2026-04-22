/**
 * IPC Channel Definitions
 *
 * This file contains all allowed IPC channel names for secure communication
 * between the main process and renderer process.
 */

/**
 * Whitelist of allowed IPC channels.
 * Only these channels can be used for IPC communication.
 * Any attempt to use a channel not in this list will be rejected.
 */
export const ALLOWED_CHANNELS = [
  'clarityokr:clarification:prompt',
  'clarityokr:clarification:respond',
  'clarityokr:okr:generate',
  'clarityokr:okr:regenerate',
  'clarityokr:llm:next-question',
  'clarityokr:llm:generate-draft',
  'clarityokr:session:persist',
  'clarityokr:clipboard:export',
  'clarityokr:sticky:reopen',
  'clarityokr:okr:latest',
  'clarityokr:error:report',
] as const;

/**
 * Type representing all allowed IPC channel names
 */
export type AllowedChannel = (typeof ALLOWED_CHANNELS)[number];

/**
 * IPC Channel constants for use throughout the application
 */
export const IPC_CHANNELS = {
  CLARIFICATION_PROMPT: 'clarityokr:clarification:prompt',
  CLARIFICATION_RESPOND: 'clarityokr:clarification:respond',
  OKR_GENERATE: 'clarityokr:okr:generate',
  OKR_REGENERATE: 'clarityokr:okr:regenerate',
  LLM_NEXT_QUESTION: 'clarityokr:llm:next-question',
  LLM_GENERATE_DRAFT: 'clarityokr:llm:generate-draft',
  SESSION_PERSIST: 'clarityokr:session:persist',
  CLIPBOARD_EXPORT: 'clarityokr:clipboard:export',
  STICKY_REOPEN: 'clarityokr:sticky:reopen',
  OKR_LATEST: 'clarityokr:okr:latest',
  ERROR_REPORT: 'clarityokr:error:report',
} as const;

/**
 * Type for IPC channel keys
 */
export type IpcChannelKey = keyof typeof IPC_CHANNELS;

/**
 * Type for IPC channel values
 */
export type IpcChannel = (typeof IPC_CHANNELS)[IpcChannelKey];

/**
 * Validate that a channel is in the whitelist
 * @param channel - The channel to validate
 * @throws Error if the channel is not in the whitelist
 */
export function validateChannel(channel: string): asserts channel is AllowedChannel {
  if (!ALLOWED_CHANNELS.includes(channel as AllowedChannel)) {
    throw new Error(`Unauthorized IPC channel: ${channel}. This channel is not in the allowlist.`);
  }
}

/**
 * Type guard to check if a channel is allowed
 * @param channel - The channel to check
 * @returns true if the channel is in the whitelist
 */
export function isAllowedChannel(channel: string): channel is AllowedChannel {
  return ALLOWED_CHANNELS.includes(channel as AllowedChannel);
}

// ============================================================================
// IPC Payload Types for LLM Channels
// ============================================================================

import type {
  ClarificationTurn,
  ClarificationContext,
  LastChoice,
} from './llm-gateway.contract.js';

export type { ClarificationTurn, ClarificationContext, LastChoice };

/** New format for LLM_NEXT_QUESTION payload */
export interface LlmNextQuestionPayloadNew {
  sessionId: string;
  currentQuestionId: string;
  context: ClarificationContext;
}

/** Old format for LLM_NEXT_QUESTION payload (backward compatibility) */
export interface LlmNextQuestionPayloadOld {
  context: ClarificationContext;
  lastChoice: LastChoice;
}

/** Union type for LLM_NEXT_QUESTION payload - supports both formats */
export type LlmNextQuestionPayload = LlmNextQuestionPayloadNew | LlmNextQuestionPayloadOld;

/** New format for LLM_GENERATE_DRAFT payload */
export interface LlmGenerateDraftPayloadNew {
  sessionId: string;
}

/** Old format for LLM_GENERATE_DRAFT payload (backward compatibility) */
export interface LlmGenerateDraftPayloadOld {
  context: ClarificationContext;
}

/** Union type for LLM_GENERATE_DRAFT payload - supports both formats */
export type LlmGenerateDraftPayload = LlmGenerateDraftPayloadNew | LlmGenerateDraftPayloadOld;

/**
 * Type guard to check if payload is new format for LLM_NEXT_QUESTION
 * @param payload - The payload to check
 * @returns true if payload uses new format with sessionId and currentQuestionId
 */
export function isLlmNextQuestionPayloadNew(
  payload: unknown,
): payload is LlmNextQuestionPayloadNew {
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
 * Type guard to check if payload is old format for LLM_NEXT_QUESTION
 * @param payload - The payload to check
 * @returns true if payload uses old format with context and lastChoice
 */
export function isLlmNextQuestionPayloadOld(
  payload: unknown,
): payload is LlmNextQuestionPayloadOld {
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
 * Type guard to check if payload is new format for LLM_GENERATE_DRAFT
 * @param payload - The payload to check
 * @returns true if payload uses new format with sessionId
 */
export function isLlmGenerateDraftPayloadNew(
  payload: unknown,
): payload is LlmGenerateDraftPayloadNew {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'sessionId' in payload &&
    typeof (payload as Record<string, unknown>).sessionId === 'string'
  );
}

/**
 * Type guard to check if payload is old format for LLM_GENERATE_DRAFT
 * @param payload - The payload to check
 * @returns true if payload uses old format with context
 */
export function isLlmGenerateDraftPayloadOld(
  payload: unknown,
): payload is LlmGenerateDraftPayloadOld {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'context' in payload &&
    typeof (payload as Record<string, unknown>).context === 'object' &&
    (payload as Record<string, unknown>).context !== null
  );
}
