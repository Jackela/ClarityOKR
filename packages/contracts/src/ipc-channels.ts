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
  'clarityokr:okr:update',
  'clarityokr:llm:next-question',
  'clarityokr:llm:generate-draft',
  'clarityokr:session:persist',
  'clarityokr:clipboard:export',
  'clarityokr:sticky:reopen',
  'clarityokr:okr:latest',
  'clarityokr:error:report',
  'clarityokr:app:legacy-notice:get',
  'clarityokr:app:legacy-notice:ack',
  'clarityokr:app:storage-state',
  'clarityokr:okr:list',
  'clarityokr:okr:open',
  'clarityokr:okr:pin',
  'clarityokr:okr:set-period',
  'clarityokr:kr:set-progress',
  'clarityokr:kr:revert-progress',
  'clarityokr:kr:replace-progress',
  'clarityokr:kr:progress-history',
  'clarityokr:review:get',
  'clarityokr:review:save',
  'clarityokr:export:save',
  'clarityokr:export:reveal',
  'clarityokr:export:backup',
  'clarityokr:import:pick',
  'clarityokr:import:commit',
  'clarityokr:import:retry',
  'clarityokr:import:discard',
  'clarityokr:app:restart',
  'clarityokr:window:open-wizard',
  'clarityokr:wizard:new-okr',
  'clarityokr:app:report-unsaved',
  'clarityokr:app:confirm-exit',
  'clarityokr:app:exit-answer',
  'clarityokr:app:exit-pending',
  'clarityokr:app:restart-result',
  'clarityokr:window:hide',
  'clarityokr:window:get-state',
  'clarityokr:window:set-always-on-top',
  'clarityokr:okr:regenerate-krs',
  'clarityokr:reminders:get',
  'clarityokr:reminders:dismiss',
  'clarityokr:reminders:tick',
  'clarityokr:reminders:go-review',
  'clarityokr:reminders:take-review',
  'clarityokr:reminders:open-review',
  'clarityokr:reminders:review-ready',
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
  OKR_UPDATE: 'clarityokr:okr:update',
  LLM_NEXT_QUESTION: 'clarityokr:llm:next-question',
  LLM_GENERATE_DRAFT: 'clarityokr:llm:generate-draft',
  SESSION_PERSIST: 'clarityokr:session:persist',
  CLIPBOARD_EXPORT: 'clarityokr:clipboard:export',
  STICKY_REOPEN: 'clarityokr:sticky:reopen',
  OKR_LATEST: 'clarityokr:okr:latest',
  ERROR_REPORT: 'clarityokr:error:report',
  /** Reply: `{ legacyDatabaseRetired: boolean }` (no path is ever sent). */
  LEGACY_NOTICE_GET: 'clarityokr:app:legacy-notice:get',
  /** The user dismissed the one-time legacy database notice. */
  LEGACY_NOTICE_ACK: 'clarityokr:app:legacy-notice:ack',
  /** Reply: `{ storageMode: 'normal' | 'fresh-file' | 'memory' }` (no path is ever sent). */
  STORAGE_STATE_GET: 'clarityokr:app:storage-state',
  /**
   * Closed-loop channels (PR-C2). All replies are `IpcResult<...>` (see closed-loop-ipc.ts);
   * validation happens in the main process and the handlers never throw across IPC.
   */
  /** History list, most recently updated first. Payload is ignored. */
  OKR_LIST: 'clarityokr:okr:list',
  /** Read one OKR with its key results, progress summaries and review. */
  OKR_OPEN: 'clarityokr:okr:open',
  /** Make one OKR the single pinned sticky note. */
  OKR_PIN: 'clarityokr:okr:pin',
  /** Set or clear the quarter (`YYYY-Qn`). */
  OKR_SET_PERIOD: 'clarityokr:okr:set-period',
  /** Write a progress/status entry for one key result. */
  KR_SET_PROGRESS: 'clarityokr:kr:set-progress',
  /** Revert the latest `set` entry of one key result. */
  KR_REVERT_PROGRESS: 'clarityokr:kr:revert-progress',
  /** #53: every progress entry of one key result (removed ones too), oldest first. `{ krId }`. */
  KR_PROGRESS_HISTORY: 'clarityokr:kr:progress-history',
  /** #54: `{ now, dismissedQuarters }` — the clock (fakeable in e2e) and closed review banners. */
  REMINDERS_GET: 'clarityokr:reminders:get',
  /** #54: close the review banner of one quarter: `{ period }` → `{ saved }`. */
  REMINDERS_DISMISS: 'clarityokr:reminders:dismiss',
  /** #54: main → renderer: re-evaluate now (window focus, resume, 5-minute timer). */
  REMINDERS_TICK: 'clarityokr:reminders:tick',
  /**
   * #84 review: 「去复盘」 from a window without a review page (the main-window results panel):
   * `{ okrId }` → `{ opened }`. Main brings the sticky shell forward and hands the request over.
   */
  REMINDERS_GO_REVIEW: 'clarityokr:reminders:go-review',
  /** The sticky shell takes a handed-over request once it is up: → `{ okrId }` or `{ okrId: null }`. */
  REMINDERS_TAKE_REVIEW: 'clarityokr:reminders:take-review',
  /** Main → sticky shell event: a request is waiting (call REMINDERS_TAKE_REVIEW). */
  REMINDERS_OPEN_REVIEW: 'clarityokr:reminders:open-review',
  /** #88: the sticky shell shows its first OKR and listens; main may deliver a waiting request. */
  REMINDERS_REVIEW_READY: 'clarityokr:reminders:review-ready',
  /** Atomically revert the latest `set` entry and write a new one ("edit this one"). */
  KR_REPLACE_PROGRESS: 'clarityokr:kr:replace-progress',
  /** Read the saved review (or null). */
  REVIEW_GET: 'clarityokr:review:get',
  /** Save the review texts (the first save freezes the key result snapshot). */
  REVIEW_SAVE: 'clarityokr:review:save',
  /** Export the OKR as Markdown or JSON through the system save dialog. */
  EXPORT_SAVE: 'clarityokr:export:save',
  /** Reveal a file in the file manager; only the path of the last successful export is accepted. */
  EXPORT_REVEAL: 'clarityokr:export:reveal',
  /** #50: every OKR into one backup file through the system save dialog. Payload: none. */
  EXPORT_BACKUP: 'clarityokr:export:backup',
  /** #49 import: open dialog → read → validate (→ write when nothing needs confirming). Payload: none. */
  IMPORT_PICK: 'clarityokr:import:pick',
  /** Write a confirmed import: `{ token, onConflict }`. */
  IMPORT_COMMIT: 'clarityokr:import:commit',
  /** Re-read the same file after a failed write (Q8-3): `{ token }`. */
  IMPORT_RETRY: 'clarityokr:import:retry',
  /** The import dialog was closed: forget the file (`{ token }`). */
  IMPORT_DISCARD: 'clarityokr:import:discard',
  /** Relaunch the app, through the same confirmation rule as quitting. */
  APP_RESTART: 'clarityokr:app:restart',
  /** Show and focus the main window and ask its wizard to start a new OKR. Payload: none. */
  WINDOW_OPEN_WIZARD: 'clarityokr:window:open-wizard',
  /** Main → main-window renderer event: the user asked for a new OKR (no payload). */
  WIZARD_NEW_OKR: 'clarityokr:wizard:new-okr',
  /** A window reports which of its unsaved-input flags changed (partial `UnsavedFlags`). */
  APP_REPORT_UNSAVED: 'clarityokr:app:report-unsaved',
  /** Main → renderer event: show the quit / restart dialog (`ConfirmExitEvent`). */
  APP_CONFIRM_EXIT: 'clarityokr:app:confirm-exit',
  /** The answer to that dialog (`ExitAnswer`); only the window hosting it may answer. */
  APP_EXIT_ANSWER: 'clarityokr:app:exit-answer',
  /** A window that just loaded asks whether it should be showing the dialog. Payload: none. */
  APP_EXIT_PENDING: 'clarityokr:app:exit-pending',
  /** Main → renderer event to the window(s) that asked for a restart (`RestartResultEvent`). */
  APP_RESTART_RESULT: 'clarityokr:app:restart-result',
  /** 「隐藏」: hide the sticky window (the app keeps running). Payload: none. */
  WINDOW_HIDE: 'clarityokr:window:hide',
  /** `{ alwaysOnTop }` of the sticky window. Payload: none. */
  WINDOW_GET_STATE: 'clarityokr:window:get-state',
  /** 「窗口始终在最前」 switch: `{ enabled: boolean }`. */
  WINDOW_SET_ALWAYS_ON_TOP: 'clarityokr:window:set-always-on-top',
  /** §3.7 regenerate all / the selected key results. `{ okrId, krIds? }` → `RegenerateKrsReply`. */
  OKR_REGENERATE_KRS: 'clarityokr:okr:regenerate-krs',
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
