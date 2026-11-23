/** Closed-loop IPC result envelope and error shape (split from closed-loop-ipc.ts, #164). */

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

/** Outcome of a request validator: the parsed request or an INVALID_REQUEST failure. */
export type Parsed<T> = { ok: true; value: T } | IpcFailure;
