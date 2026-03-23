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
