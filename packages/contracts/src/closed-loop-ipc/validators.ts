/** Closed-loop IPC request validators and event readers (split from closed-loop-ipc.ts, #164). */

import { TEXT_LIMITS, isPeriod } from '../okr-model.js';
import { EXIT_CONFIRM_REASON_ORDER, type ExitConfirmation } from './exit-confirmation.js';
import type { Parsed } from './result.js';
import {
  EXPORT_FORMATS,
  type ConfirmExitEvent,
  type ExitAnswer,
  type ExportRequest,
  type ImportCommitRequest,
  type ImportConflictChoice,
  type ImportTokenRequest,
  type KrIdRequest,
  type OkrIdRequest,
  type ReplaceProgressRequest,
  type RestartRequest,
  type RestartResultEvent,
  type RevealRequest,
  type SaveReviewRequest,
  type SetAlwaysOnTopRequest,
  type SetPeriodRequest,
  type SetProgressRequest,
  type UnsavedReport,
  type ExportFormat,
  type UnsavedFlags,
} from './types.js';
import {
  MAX_PATH_LENGTH,
  asRecord,
  invalid,
  isFailure,
  parseIdOnly,
  readId,
  readProgressValue,
  readStatus,
  readText,
  type Rec,
} from './validation.js';

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
