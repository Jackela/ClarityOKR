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
  unsaved: UnsavedFlags;
  /** The user already answered the confirmation dialog with "discard and restart". */
  confirmed?: boolean;
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

export interface RevealReply {
  revealed: true;
}

export type RestartFailureCategory = 'relaunch_failed';

export type RestartReply =
  | { outcome: 'restarting' }
  | { outcome: 'confirm_required'; confirmation: ExitConfirmation }
  | { outcome: 'failed'; category: RestartFailureCategory };

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
  const record = asRecord(payload, ['unsaved', 'confirmed']);
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
  const confirmed = record.confirmed;
  if (confirmed !== undefined && typeof confirmed !== 'boolean') {
    return invalid('confirmed', 'wrong_type');
  }
  return {
    ok: true,
    value: confirmed === undefined ? { unsaved: flags } : { unsaved: flags, confirmed },
  };
}
