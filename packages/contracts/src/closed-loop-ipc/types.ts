/** Closed-loop IPC request / reply types (split from closed-loop-ipc.ts, #164). */

import type { StructuredImportIssue } from '../import-issue-copy.js';
import type {
  KeyResultRecord,
  KrStatus,
  ObjectiveWithKeyResults,
  Period,
  ProgressEntryRecord,
  ReviewRecord,
} from '../okr-model.js';
import type { ExitConfirmation } from './exit-confirmation.js';

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

/** Bytes in one MB as the import limits count them (MiB). */
export const BYTES_PER_MB = 1024 * 1024;
/** #89: the single-OKR limit in MB, the one number the copy names (「5 MB」). */
export const IMPORT_MAX_MB = 5;
/**
 * Largest single-OKR file the import reads: exactly 5 × 1024 × 1024 bytes is allowed, one byte
 * more is too large (#89). The one definition used by main, the renderer and the tests.
 */
export const IMPORT_MAX_BYTES = IMPORT_MAX_MB * BYTES_PER_MB;
/** #93: the backup limit in MB, the number the backup copy names (「50 MB」). */
export const BACKUP_MAX_MB = 50;
/**
 * #50 B5 / #93: largest full backup the import reads: exactly 50 × 1024 × 1024 bytes is allowed,
 * one byte more is too large.
 */
export const IMPORT_BACKUP_MAX_BYTES = BACKUP_MAX_MB * BYTES_PER_MB;

/** #89: true when a single-OKR file of `bytes` is over the limit (the limit itself is fine). */
export function exceedsImportLimit(bytes: number): boolean {
  return bytes > IMPORT_MAX_BYTES;
}
/** #89: true when a backup file of `bytes` is over the backup limit. */
export function exceedsBackupLimit(bytes: number): boolean {
  return bytes > IMPORT_BACKUP_MAX_BYTES;
}

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
