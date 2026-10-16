import type { StructuredImportIssue } from './import-issue-copy.js';
/**
 * Closed-loop IPC contract (PR-C2): request validation, reply shapes and error codes.
 *
 * Everything here is pure so the main process (authoritative validation) and the renderer
 * (instant form validation) share one implementation, including the grapheme text counter.
 */

import {
  TEXT_LIMITS,
  checkText,
  isKrStatus,
  isPeriod,
  type KeyResultRecord,
  type KrStatus,
  type ObjectiveWithKeyResults,
  type Period,
  type ProgressEntryRecord,
  type ReviewRecord,
} from './okr-model.js';

// ---------------------------------------------------------------------------
// Result envelope and error shape
// ---------------------------------------------------------------------------

export type ClosedLoopErrorCode =
  /** The request failed validation (wrong type, unknown field, range, text limit...). */
  | 'INVALID_REQUEST'
  /** The okrId / krId does not exist. */
  | 'NOT_FOUND'
  /** The key result was removed by a regeneration and can no longer be edited. */
  | 'KEY_RESULT_REMOVED'
  /** The key result has no progress entry to revert or edit. */
  | 'NOTHING_TO_REVERT'
  /** The newest entry is already a revert; a revert cannot be reverted again. */
  | 'LATEST_IS_REVERT'
  /** The regeneration request failed (LLM, response or save); nothing was changed. */
  | 'REGENERATE_FAILED'
  /** `export:reveal` was asked for a path the main process did not just return. */
  | 'PATH_NOT_ALLOWED'
  /** Anything unexpected. The message is generic: no paths, no raw error text. */
  | 'INTERNAL';

export type FieldReason =
  | 'missing'
  | 'wrong_type'
  | 'unknown_field'
  | 'empty'
  | 'not_integer'
  | 'below_min'
  | 'above_max'
  | 'too_long'
  | 'cluster_too_long'
  | 'invalid_value';

export interface ClosedLoopError {
  code: ClosedLoopErrorCode;
  /** Name of the offending request field (only for INVALID_REQUEST). */
  field?: string;
  /** Machine-readable reason (only for INVALID_REQUEST); the UI picks its own wording. */
  reason?: FieldReason;
  /** Short English description for logs/tests. Never contains a filesystem path. */
  message: string;
}

export interface IpcFailure {
  ok: false;
  error: ClosedLoopError;
}

export interface IpcSuccess<T> {
  ok: true;
  data: T;
}

export type IpcResult<T> = IpcSuccess<T> | IpcFailure;

export function ipcOk<T>(data: T): IpcSuccess<T> {
  return { ok: true, data };
}

export function ipcFail(
  code: ClosedLoopErrorCode,
  message: string,
  extra: { field?: string; reason?: FieldReason } = {},
): IpcFailure {
  const error: ClosedLoopError = { code, message };
  if (extra.field !== undefined) error.field = extra.field;
  if (extra.reason !== undefined) error.reason = extra.reason;
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// Request / reply types
// ---------------------------------------------------------------------------

export interface OkrIdRequest {
  okrId: string;
}

export interface SetPeriodRequest {
  okrId: string;
  period: Period | null;
}

export interface SetProgressRequest {
  krId: string;
  status: KrStatus;
  /** Omitted: keep the current value (status-only change). `null`: clear the progress. */
  value?: number | null;
}

export interface KrIdRequest {
  krId: string;
}

export interface ReplaceProgressRequest {
  krId: string;
  /** The corrected value; `null` clears it. Required. */
  value: number | null;
  /** Omitted: keep the current status. */
  status?: KrStatus;
}

export interface SaveReviewRequest {
  okrId: string;
  wentWell: string;
  fellShort: string;
  nextSteps: string;
}

export const EXPORT_FORMATS = ['md', 'json'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export interface ExportRequest {
  okrId: string;
  format: ExportFormat;
}

export interface RevealRequest {
  path: string;
}

export interface UnsavedFlags {
  /** The wizard holds input that was not turned into an OKR yet. */
  wizard: boolean;
  /** A text edit (including metrics) is open and not committed. */
  textEdit: boolean;
  /** The review tab holds text that was not saved. */
  reviewDraft: boolean;
}

export interface RestartRequest {
  /** The asking window's own flags; the main process ORs them with what every window reported. */
  unsaved: UnsavedFlags;
}

/** Payload of `clarityokr:app:report-unsaved`: only the flags this window owns. */
export type UnsavedReport = Partial<UnsavedFlags>;

export interface UnsavedReportReply {
  recorded: true;
}

export interface OpenWizardReply {
  opened: true;
}

export interface OkrListItem {
  id: string;
  title: string;
  period: Period | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  /** Average over non-removed key results with a value; null when none. */
  overallProgress: number | null;
  /** Non-removed key results. */
  keyResultCount: number;
  filledKeyResultCount: number;
  allDone: boolean;
  reviewed: boolean;
}

export interface OkrListReply {
  items: OkrListItem[];
}

/** Data for the "latest update" row of one key result. */
export interface KrProgressInfo {
  latest: ProgressEntryRecord | null;
  /** Value and status before the latest entry (null without entries). */
  before: { value: number | null; status: KrStatus } | null;
  /** The newest entry is a `set`: "revert" and "edit this one" are available. */
  canRevert: boolean;
}

export interface OkrDetail {
  objective: ObjectiveWithKeyResults;
  /** Keyed by key result id, covers removed key results too. */
  progress: Record<string, KrProgressInfo>;
  review: ReviewRecord | null;
}

export interface ProgressChangeReply {
  /** False when nothing was written because the request equals the current state. */
  changed: boolean;
  keyResult: KeyResultRecord;
  overallProgress: number | null;
  progress: KrProgressInfo;
}

export interface PinReply {
  okrId: string;
  pinned: true;
}

export interface SetPeriodReply {
  okrId: string;
  period: Period | null;
  updatedAt: string;
}

export interface ReviewReply {
  review: ReviewRecord | null;
}

export type ExportFailureCategory =
  | 'permission'
  | 'disk_full'
  | 'not_found'
  | 'busy'
  /** The extension we appended produced a name that is already taken; nothing was written. */
  | 'exists'
  | 'other';

export type ExportReply =
  | { outcome: 'saved'; format: ExportFormat; fileName: string; path: string }
  | { outcome: 'cancelled' }
  | { outcome: 'failed'; category: ExportFailureCategory };

// ---------------------------------------------------------------------------
// Import (#49, spec S1§8). The renderer never sees a path: the main process keeps the chosen
// file behind a one-time token, which `commit` / `retry` / `discard` refer to.
// ---------------------------------------------------------------------------

/** Largest single-OKR file the import reads (5 MB). */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
/** #50 B5: largest full backup the import reads (50 MB). */
export const IMPORT_BACKUP_MAX_BYTES = 50 * 1024 * 1024;

export type ImportReadCategory = 'permission' | 'not_found' | 'busy' | 'other';
export type ImportWriteCategory = 'disk_full' | 'busy' | 'other';
export type ImportConflictChoice = 'skip' | 'copy';

/** Why a file was rejected. Nothing was written in any of these cases. */
export type ImportProblem =
  /** `backup`: the limit was the backup one (also for a file over it whose kind is unknown). */
  | { kind: 'too_large'; sizeBytes: number; limitBytes: number; backup: boolean }
  | { kind: 'not_json' }
  | { kind: 'unsupported_version'; version: string }
  /** The first problem (path + Chinese reason) and how many more there are. */
  | {
      kind: 'invalid';
      /** First issue as one plain sentence (`field` is always '' since #69). */
      field: string;
      reason: string;
      more: number;
      /** #69: the first issues, structured (≤ MAX_REPORTED_ISSUES); the renderer words them. */
      issues?: StructuredImportIssue[];
      /** #69: how many issues the file has in all. */
      total?: number;
      /** Backups: the 0-based index of the OKR that failed (the whole file is refused). */
      okrIndex?: number;
    }
  /** A backup with `okrs: []`. */
  | { kind: 'empty_backup' }
  | { kind: 'read_failed'; category: ImportReadCategory };

export interface ImportItem {
  title: string;
  createdAt: string;
}

export interface ImportConflict extends ImportItem {
  /** Index in `items`. */
  index: number;
  /** `existing`: an OKR in the history has the same title + creation time; `in_file`: an earlier item of the same file does (Q9-5). */
  source: 'existing' | 'in_file';
}

export interface ImportedOkr {
  okrId: string;
  title: string;
}

export type ImportReply =
  | { outcome: 'cancelled' }
  | { outcome: 'rejected'; problem: ImportProblem }
  /**
   * Valid, not written yet: there are conflicts, or the app runs on the in-memory database
   * (Q8-6: the user confirms first). Answer with `import:commit` or `import:discard`.
   */
  | {
      outcome: 'confirm';
      token: string;
      items: ImportItem[];
      conflicts: ImportConflict[];
      memory: boolean;
      /** Set for a backup file (#50): always previewed before writing. */
      backup?: { exportedAt: string; appVersion: string };
    }
  | { outcome: 'imported'; imported: ImportedOkr[]; skipped: ImportItem[]; memory: boolean }
  /** The transaction was rolled back. `token` re-reads the same file (`import:retry`). */
  | { outcome: 'write_failed'; category: ImportWriteCategory; token: string }
  /** `import:retry` could not read the original file any more (Q8-3): pick a file again. */
  | { outcome: 'original_missing' };

export interface ImportTokenRequest {
  token: string;
}

export interface ImportCommitRequest {
  token: string;
  /** What to do with every conflicting item. */
  onConflict: ImportConflictChoice;
  /** Per item (index in `items`), overriding `onConflict` (#50 backup preview). */
  choices?: Record<string, ImportConflictChoice>;
}

/** #53 `clarityokr:kr:progress-history`: the raw entries, oldest first (read-only). */
export interface ProgressHistoryReply {
  krId: string;
  entries: ProgressEntryRecord[];
}

/** #50 `clarityokr:export:backup`: `count` = OKRs in the file (0 is a valid backup). */
export type BackupReply =
  | { outcome: 'saved'; fileName: string; path: string; count: number }
  | { outcome: 'cancelled' }
  | { outcome: 'failed'; category: ExportFailureCategory };

/** Reply of `clarityokr:clipboard:export`: the Markdown of the OKR is on the clipboard. */
export interface CopyReply {
  copied: true;
}

export interface RevealReply {
  revealed: true;
}

export type RestartFailureCategory = 'relaunch_failed';

/**
 * - `restarting`: the app relaunches now (nothing to confirm);
 * - `confirm_pending`: the restart dialog is open in the MAIN window (spec §7a.4); the answer
 *   comes back to the asking window as `app:restart-result` (`cancelled` / `failed`), or the
 *   app relaunches;
 * - `failed`: relaunching did not work (no exception text, no path).
 */
export type RestartReply =
  | { outcome: 'restarting' }
  | { outcome: 'confirm_pending' }
  | { outcome: 'failed'; category: RestartFailureCategory };

export type ExitKind = 'quit' | 'restart';

/** Main → renderer `clarityokr:app:confirm-exit`: open the quit / restart dialog in this window. */
export interface ConfirmExitEvent {
  /** N12: identifies this one dialog; the answer must carry it back. */
  requestId: number;
  kind: ExitKind;
  confirmation: ExitConfirmation;
}

/** Renderer → main `clarityokr:app:exit-answer`: the user's answer to that dialog. */
export interface ExitAnswer {
  /** N12: the `requestId` of the dialog being answered (a stale answer is refused). */
  requestId: number;
  kind: ExitKind;
  /** `true` = 「放弃并退出 / 放弃并重启」, `false` = the safe button or Esc. */
  confirmed: boolean;
}

export interface ExitAnswerReply {
  accepted: true;
}

/** Reply of `clarityokr:app:exit-pending`: the dialog this window should be showing, if any. */
export interface ExitPendingReply {
  pending: ConfirmExitEvent | null;
}

/** Main → renderer `clarityokr:app:restart-result`, sent to the window(s) that asked. */
export interface RestartResultEvent {
  outcome: 'cancelled' | 'failed';
}

/** Reply of `clarityokr:window:get-state` / `set-always-on-top`. */
export interface WindowStateReply {
  alwaysOnTop: boolean;
  /** N15: 「隐藏」 would quit (no tray icon, last visible window; Windows / Linux). */
  hideQuits: boolean;
}

export interface SetAlwaysOnTopRequest {
  enabled: boolean;
}

export interface HideWindowReply {
  /** false = nothing was hidden: it was the last visible window without a tray, so a quit was
   *  asked instead (N15). */
  hidden: boolean;
}

// ---------------------------------------------------------------------------
// Exit / restart confirmation (pure decision)
// ---------------------------------------------------------------------------

export type StorageModeName = 'normal' | 'fresh-file' | 'memory';

export type ExitConfirmReason = 'wizard' | 'text_edit' | 'review_draft' | 'memory_data';

/** Display order is fixed by the design spec (§1.2c). */
export const EXIT_CONFIRM_REASON_ORDER: readonly ExitConfirmReason[] = [
  'wizard',
  'text_edit',
  'review_draft',
  'memory_data',
];

export interface ExitConfirmationInput {
  storageMode: StorageModeName;
  /** Any objective or saved review exists in the database. */
  dbHasData: boolean;
  unsaved: UnsavedFlags;
}

export interface ExitConfirmation {
  needsConfirm: boolean;
  /** Which sentences the dialog shows, in the fixed order. */
  reasons: ExitConfirmReason[];
  /** Only the in-memory-data reason applies: the safe button reads "not now" instead of "keep editing". */
  memoryOnly: boolean;
  /** The window that hosts the dialog: the sticky note only when it is the single class involved. */
  dialogWindow: 'main' | 'sticky';
  /** Windows that must be visible before the dialog opens. */
  windowsToShow: Array<'main' | 'sticky'>;
}

/**
 * Decides whether quitting (or restarting) needs the user's confirmation.
 *
 * - Wizard input, an uncommitted text edit and an unsaved review draft always ask.
 * - In `memory` storage mode it also asks when the database holds any objective or saved
 *   review; an empty in-memory database asks nothing by itself.
 * - `normal` and `fresh-file` modes never ask because of stored data (it is on disk).
 * - Progress updates are saved immediately and are not an input here.
 */
export function decideExitConfirmation(input: ExitConfirmationInput): ExitConfirmation {
  const active = new Set<ExitConfirmReason>();
  if (input.unsaved.wizard) active.add('wizard');
  if (input.unsaved.textEdit) active.add('text_edit');
  if (input.unsaved.reviewDraft) active.add('review_draft');
  if (input.storageMode === 'memory' && input.dbHasData) active.add('memory_data');

  const reasons = EXIT_CONFIRM_REASON_ORDER.filter((reason) => active.has(reason));
  const windowsToShow: Array<'main' | 'sticky'> = [];
  if (active.has('wizard') || active.has('memory_data')) windowsToShow.push('main');
  if (active.has('text_edit') || active.has('review_draft')) windowsToShow.push('sticky');

  const stickyOnly =
    reasons.length > 0 && reasons.every((r) => r === 'text_edit' || r === 'review_draft');
  return {
    needsConfirm: reasons.length > 0,
    reasons,
    memoryOnly: reasons.length === 1 && reasons[0] === 'memory_data',
    dialogWindow: stickyOnly ? 'sticky' : 'main',
    windowsToShow,
  };
}

// ---------------------------------------------------------------------------
// Request validators
// ---------------------------------------------------------------------------

export type Parsed<T> = { ok: true; value: T } | IpcFailure;

type Rec = Record<string, unknown>;

const MAX_ID_LENGTH = 128;
const MAX_PATH_LENGTH = 4096;

function invalid(field: string, reason: FieldReason, message?: string): IpcFailure {
  return ipcFail('INVALID_REQUEST', message ?? `Invalid request field "${field}": ${reason}`, {
    field,
    reason,
  });
}

function asRecord(payload: unknown, allowed: readonly string[]): Rec | IpcFailure {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return invalid('payload', 'wrong_type', 'The request must be an object');
  }
  const record = payload as Rec;
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) return invalid(key, 'unknown_field');
  }
  return record;
}

function isFailure(value: unknown): value is IpcFailure {
  return typeof value === 'object' && value !== null && (value as IpcFailure).ok === false;
}

function readId(record: Rec, field: string): string | IpcFailure {
  const value = record[field];
  if (value === undefined) return invalid(field, 'missing');
  if (typeof value !== 'string') return invalid(field, 'wrong_type');
  if (value.length === 0 || value.trim().length === 0) return invalid(field, 'empty');
  if (value.length > MAX_ID_LENGTH) return invalid(field, 'too_long');
  return value;
}

function readStatus(record: Rec, field: string): KrStatus | IpcFailure {
  const value = record[field];
  if (value === undefined) return invalid(field, 'missing');
  if (typeof value !== 'string') return invalid(field, 'wrong_type');
  if (!isKrStatus(value)) return invalid(field, 'invalid_value');
  return value;
}

/** Progress is an integer 0-100 or null (cleared). */
function readProgressValue(value: unknown, field: string): number | null | IpcFailure {
  if (value === null) return null;
  if (typeof value !== 'number') return invalid(field, 'wrong_type');
  if (!Number.isFinite(value) || !Number.isInteger(value)) return invalid(field, 'not_integer');
  if (value < 0) return invalid(field, 'below_min');
  if (value > 100) return invalid(field, 'above_max');
  return value;
}

function readText(record: Rec, field: string, limit: number): string | IpcFailure {
  const value = record[field];
  if (value === undefined) return invalid(field, 'missing');
  if (typeof value !== 'string') return invalid(field, 'wrong_type');
  const check = checkText(value, limit);
  if (!check.ok) return invalid(field, check.reason);
  return value;
}

function parseIdOnly<K extends string>(payload: unknown, key: K): Parsed<Record<K, string>> {
  const record = asRecord(payload, [key]);
  if (isFailure(record)) return record;
  const id = readId(record, key);
  if (isFailure(id)) return id;
  return { ok: true, value: { [key]: id } as Record<K, string> };
}

export function parseOkrIdRequest(payload: unknown): Parsed<OkrIdRequest> {
  return parseIdOnly(payload, 'okrId');
}

export function parseKrIdRequest(payload: unknown): Parsed<KrIdRequest> {
  return parseIdOnly(payload, 'krId');
}

export function parseSetPeriodRequest(payload: unknown): Parsed<SetPeriodRequest> {
  const record = asRecord(payload, ['okrId', 'period']);
  if (isFailure(record)) return record;
  const okrId = readId(record, 'okrId');
  if (isFailure(okrId)) return okrId;
  const period = record.period;
  if (period === undefined) return invalid('period', 'missing');
  if (period === null) return { ok: true, value: { okrId, period: null } };
  if (typeof period !== 'string') return invalid('period', 'wrong_type');
  if (!isPeriod(period)) return invalid('period', 'invalid_value');
  return { ok: true, value: { okrId, period } };
}

export function parseSetProgressRequest(payload: unknown): Parsed<SetProgressRequest> {
  const record = asRecord(payload, ['krId', 'status', 'value']);
  if (isFailure(record)) return record;
  const krId = readId(record, 'krId');
  if (isFailure(krId)) return krId;
  const status = readStatus(record, 'status');
  if (isFailure(status)) return status;
  if (!('value' in record) || record.value === undefined) {
    return { ok: true, value: { krId, status } };
  }
  const value = readProgressValue(record.value, 'value');
  if (isFailure(value)) return value;
  return { ok: true, value: { krId, status, value } };
}

export function parseReplaceProgressRequest(payload: unknown): Parsed<ReplaceProgressRequest> {
  const record = asRecord(payload, ['krId', 'value', 'status']);
  if (isFailure(record)) return record;
  const krId = readId(record, 'krId');
  if (isFailure(krId)) return krId;
  if (!('value' in record) || record.value === undefined) return invalid('value', 'missing');
  const value = readProgressValue(record.value, 'value');
  if (isFailure(value)) return value;
  if (!('status' in record) || record.status === undefined) {
    return { ok: true, value: { krId, value } };
  }
  const status = readStatus(record, 'status');
  if (isFailure(status)) return status;
  return { ok: true, value: { krId, value, status } };
}

export function parseSaveReviewRequest(payload: unknown): Parsed<SaveReviewRequest> {
  const record = asRecord(payload, ['okrId', 'wentWell', 'fellShort', 'nextSteps']);
  if (isFailure(record)) return record;
  const okrId = readId(record, 'okrId');
  if (isFailure(okrId)) return okrId;
  const wentWell = readText(record, 'wentWell', TEXT_LIMITS.reviewSection);
  if (isFailure(wentWell)) return wentWell;
  const fellShort = readText(record, 'fellShort', TEXT_LIMITS.reviewSection);
  if (isFailure(fellShort)) return fellShort;
  const nextSteps = readText(record, 'nextSteps', TEXT_LIMITS.reviewSection);
  if (isFailure(nextSteps)) return nextSteps;
  if ([wentWell, fellShort, nextSteps].every((text) => text.trim().length === 0)) {
    return invalid('review', 'empty', 'At least one review section must have text');
  }
  return { ok: true, value: { okrId, wentWell, fellShort, nextSteps } };
}

export function parseExportRequest(payload: unknown): Parsed<ExportRequest> {
  const record = asRecord(payload, ['okrId', 'format']);
  if (isFailure(record)) return record;
  const okrId = readId(record, 'okrId');
  if (isFailure(okrId)) return okrId;
  const format = record.format;
  if (format === undefined) return invalid('format', 'missing');
  if (typeof format !== 'string') return invalid('format', 'wrong_type');
  if (!(EXPORT_FORMATS as readonly string[]).includes(format)) {
    return invalid('format', 'invalid_value');
  }
  return { ok: true, value: { okrId, format: format as ExportFormat } };
}

export function parseRevealRequest(payload: unknown): Parsed<RevealRequest> {
  const record = asRecord(payload, ['path']);
  if (isFailure(record)) return record;
  const path = record.path;
  if (path === undefined) return invalid('path', 'missing');
  if (typeof path !== 'string') return invalid('path', 'wrong_type');
  if (path.length === 0) return invalid('path', 'empty');
  if (path.length > MAX_PATH_LENGTH) return invalid('path', 'too_long');
  return { ok: true, value: { path } };
}

export function parseRestartRequest(payload: unknown): Parsed<RestartRequest> {
  const record = asRecord(payload, ['unsaved']);
  if (isFailure(record)) return record;
  const unsavedRaw = record.unsaved;
  if (unsavedRaw === undefined) return invalid('unsaved', 'missing');
  if (typeof unsavedRaw !== 'object' || unsavedRaw === null || Array.isArray(unsavedRaw)) {
    return invalid('unsaved', 'wrong_type');
  }
  const unsavedRecord = unsavedRaw as Rec;
  const flagNames = ['wizard', 'textEdit', 'reviewDraft'] as const;
  for (const key of Object.keys(unsavedRecord)) {
    if (!(flagNames as readonly string[]).includes(key))
      return invalid(`unsaved.${key}`, 'unknown_field');
  }
  const flags = {} as UnsavedFlags;
  for (const name of flagNames) {
    const flag = unsavedRecord[name];
    if (flag === undefined) return invalid(`unsaved.${name}`, 'missing');
    if (typeof flag !== 'boolean') return invalid(`unsaved.${name}`, 'wrong_type');
    flags[name] = flag;
  }
  return { ok: true, value: { unsaved: flags } };
}

/** Channels without a request body accept `undefined`/`null` or an empty object only. */
export function parseEmptyRequest(payload: unknown): Parsed<Record<string, never>> {
  if (payload === undefined || payload === null) return { ok: true, value: {} };
  const record = asRecord(payload, []);
  if (isFailure(record)) return record;
  return { ok: true, value: {} };
}

export function parseUnsavedReport(payload: unknown): Parsed<UnsavedReport> {
  const record = asRecord(payload, ['wizard', 'textEdit', 'reviewDraft']);
  if (isFailure(record)) return record;
  const value: UnsavedReport = {};
  for (const name of ['wizard', 'textEdit', 'reviewDraft'] as const) {
    const flag = record[name];
    if (flag === undefined) continue;
    if (typeof flag !== 'boolean') return invalid(name, 'wrong_type');
    value[name] = flag;
  }
  if (Object.keys(value).length === 0) return invalid('payload', 'missing', 'No flag was reported');
  return { ok: true, value };
}

export function parseExitAnswer(payload: unknown): Parsed<ExitAnswer> {
  const record = asRecord(payload, ['requestId', 'kind', 'confirmed']);
  if (isFailure(record)) return record;
  const requestId = record.requestId;
  if (requestId === undefined) return invalid('requestId', 'missing');
  if (typeof requestId !== 'number') return invalid('requestId', 'wrong_type');
  if (!Number.isSafeInteger(requestId)) return invalid('requestId', 'not_integer');
  if (requestId < 1) return invalid('requestId', 'below_min');
  const kind = record.kind;
  if (kind === undefined) return invalid('kind', 'missing');
  if (kind !== 'quit' && kind !== 'restart') return invalid('kind', 'wrong_type');
  const confirmed = record.confirmed;
  if (confirmed === undefined) return invalid('confirmed', 'missing');
  if (typeof confirmed !== 'boolean') return invalid('confirmed', 'wrong_type');
  return { ok: true, value: { requestId, kind, confirmed } };
}

/** §3.7: regenerate every key result (`krIds` omitted) or only the selected ones. */
export interface RegenerateKrsRequest {
  okrId: string;
  krIds?: string[];
}

/**
 * Which result-banner case applies (spec §3.7 table):
 * - `updated`: all ids came back, same order and count;
 * - `reordered`: all ids came back in another order;
 * - `changed`: some kept, some new and/or some removed (`missingIds` > 0 = some came back
 *   without a usable id, the 「id 缺失」 wording);
 * - `partial_updated` / `partial_removed`: a partial regeneration.
 */
export type RegenerateOutcome =
  'updated' | 'reordered' | 'changed' | 'partial_updated' | 'partial_removed';

export interface RegenerateSummary {
  outcome: RegenerateOutcome;
  /** Key results asked to be regenerated (all active ones, or the selection). */
  requested: number;
  kept: number;
  added: number;
  removed: number;
  /** New key results that came back without a usable id (counted in `added`). */
  missingIds: number;
  /** Ids of the new key results (shown with the 「新增」 tag). */
  addedIds: string[];
  /** Ids of the key results the regeneration rewrote or added (the rows that were regenerated). */
  touchedIds: string[];
}

export interface RegenerateKrsReply {
  detail: OkrDetail;
  summary: RegenerateSummary;
}

export const MAX_REGENERATE_SELECTION = 10;

export function parseRegenerateKrsRequest(payload: unknown): Parsed<RegenerateKrsRequest> {
  const record = asRecord(payload, ['okrId', 'krIds']);
  if (isFailure(record)) return record;
  const okrId = readId(record, 'okrId');
  if (isFailure(okrId)) return okrId;
  const krIds = record.krIds;
  if (krIds === undefined) return { ok: true, value: { okrId } };
  if (!Array.isArray(krIds)) return invalid('krIds', 'wrong_type');
  if (krIds.length === 0) return invalid('krIds', 'empty');
  if (krIds.length > MAX_REGENERATE_SELECTION) return invalid('krIds', 'above_max');
  const ids: string[] = [];
  for (const id of krIds) {
    if (typeof id !== 'string') return invalid('krIds', 'wrong_type');
    if (id.trim() === '') return invalid('krIds', 'empty');
    if (id.length > MAX_ID_LENGTH) return invalid('krIds', 'too_long');
    if (!ids.includes(id)) ids.push(id);
  }
  return { ok: true, value: { okrId, krIds: ids } };
}

export function parseSetAlwaysOnTop(payload: unknown): Parsed<SetAlwaysOnTopRequest> {
  const record = asRecord(payload, ['enabled']);
  if (isFailure(record)) return record;
  const enabled = record.enabled;
  if (enabled === undefined) return invalid('enabled', 'missing');
  if (typeof enabled !== 'boolean') return invalid('enabled', 'wrong_type');
  return { ok: true, value: { enabled } };
}

const REASONS: readonly string[] = EXIT_CONFIRM_REASON_ORDER;

/**
 * Renderer-side check of a `confirm-exit` event payload (the main process is trusted, but a
 * malformed event must never open a broken dialog). Returns `null` when it does not fit.
 */
export function readConfirmExitEvent(payload: unknown): ConfirmExitEvent | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { requestId, kind, confirmation } = payload as Rec;
  if (typeof requestId !== 'number' || !Number.isSafeInteger(requestId) || requestId < 1) {
    return null;
  }
  if (kind !== 'quit' && kind !== 'restart') return null;
  if (typeof confirmation !== 'object' || confirmation === null) return null;
  const c = confirmation as Rec;
  if (
    typeof c.needsConfirm !== 'boolean' ||
    typeof c.memoryOnly !== 'boolean' ||
    (c.dialogWindow !== 'main' && c.dialogWindow !== 'sticky') ||
    !Array.isArray(c.reasons) ||
    !c.reasons.every((r) => typeof r === 'string' && REASONS.includes(r)) ||
    !Array.isArray(c.windowsToShow) ||
    !c.windowsToShow.every((w) => w === 'main' || w === 'sticky')
  ) {
    return null;
  }
  return { requestId, kind, confirmation: c as unknown as ExitConfirmation };
}

/** Renderer-side check of a `restart-result` event payload. */
export function readRestartResultEvent(payload: unknown): RestartResultEvent | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const outcome = (payload as Rec).outcome;
  return outcome === 'cancelled' || outcome === 'failed' ? { outcome } : null;
}

export function parseImportTokenRequest(payload: unknown): Parsed<ImportTokenRequest> {
  const record = asRecord(payload, ['token']);
  if (isFailure(record)) return record;
  const token = readId(record, 'token');
  if (isFailure(token)) return token;
  return { ok: true, value: { token } };
}

export function parseImportCommitRequest(payload: unknown): Parsed<ImportCommitRequest> {
  const record = asRecord(payload, ['token', 'onConflict', 'choices']);
  if (isFailure(record)) return record;
  const token = readId(record, 'token');
  if (isFailure(token)) return token;
  const choice = record.onConflict;
  if (choice === undefined) return invalid('onConflict', 'missing');
  if (typeof choice !== 'string') return invalid('onConflict', 'wrong_type');
  if (choice !== 'skip' && choice !== 'copy') return invalid('onConflict', 'invalid_value');
  const raw = record.choices;
  if (raw === undefined) return { ok: true, value: { token, onConflict: choice } };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return invalid('choices', 'wrong_type');
  }
  const choices: Record<string, ImportConflictChoice> = {};
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > 10_000) return invalid('choices', 'too_long');
  for (const [key, value] of entries) {
    if (!/^(0|[1-9]\d{0,5})$/.test(key)) return invalid('choices', 'invalid_value');
    if (value !== 'skip' && value !== 'copy') return invalid('choices', 'invalid_value');
    choices[key] = value;
  }
  return { ok: true, value: { token, onConflict: choice, choices } };
}
