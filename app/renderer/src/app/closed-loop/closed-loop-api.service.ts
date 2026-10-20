import { Injectable } from '@angular/core';
import {
  IPC_CHANNELS,
  ipcFail,
  type CopyReply,
  type BackupReply,
  type ProgressHistoryReply,
  type ExportReply,
  type ExportRequest,
  type ImportCommitRequest,
  type ImportReply,
  type ImportTokenRequest,
  type IpcResult,
  type KrIdRequest,
  type OkrIdRequest,
  type OkrDetail,
  type OkrListReply,
  type PinReply,
  type RegenerateKrsReply,
  type RegenerateKrsRequest,
  type RevealReply,
  type RevealRequest,
  type ReviewReply,
  type SaveReviewRequest,
  type StorageModeName,
  type ProgressChangeReply,
  type ReplaceProgressRequest,
  type SetPeriodReply,
  type SetPeriodRequest,
  type SetProgressRequest,
  type OpenWizardReply,
  type RestartReply,
  type RestartRequest,
  type UnsavedReport,
  type UnsavedReportReply,
  type ExitAnswer,
  type ExitAnswerReply,
  type ExitPendingReply,
  type HideWindowReply,
  type WindowStateReply,
} from '@clarityokr/contracts';
import type { GoReviewOutcome } from './reminder-navigator.service';

function isIpcResult(value: unknown): value is IpcResult<unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as { ok?: unknown; error?: unknown };
  return record.ok === true || (record.ok === false && typeof record.error === 'object');
}

/**
 * Typed client for the closed-loop IPC channels. It only talks to whitelisted channels
 * through the preload bridge and never throws: a missing bridge, a rejected invoke or a
 * malformed reply all come back as an `INTERNAL` failure with a generic message.
 */
@Injectable({ providedIn: 'root' })
export class ClosedLoopApi {
  list(): Promise<IpcResult<OkrListReply>> {
    return this.call(IPC_CHANNELS.OKR_LIST, undefined);
  }

  open(request: OkrIdRequest): Promise<IpcResult<OkrDetail>> {
    return this.call(IPC_CHANNELS.OKR_OPEN, request);
  }

  /** §3.7: regenerate all (no `krIds`) or the selected key results. */
  regenerateKrs(request: RegenerateKrsRequest): Promise<IpcResult<RegenerateKrsReply>> {
    return this.call(IPC_CHANNELS.OKR_REGENERATE_KRS, request);
  }

  pin(request: OkrIdRequest): Promise<IpcResult<PinReply>> {
    return this.call(IPC_CHANNELS.OKR_PIN, request);
  }

  setPeriod(request: SetPeriodRequest): Promise<IpcResult<SetPeriodReply>> {
    return this.call(IPC_CHANNELS.OKR_SET_PERIOD, request);
  }

  setProgress(request: SetProgressRequest): Promise<IpcResult<ProgressChangeReply>> {
    return this.call(IPC_CHANNELS.KR_SET_PROGRESS, request);
  }

  revertProgress(request: KrIdRequest): Promise<IpcResult<ProgressChangeReply>> {
    return this.call(IPC_CHANNELS.KR_REVERT_PROGRESS, request);
  }

  /** #53: every progress entry of one key result, oldest first. */
  progressHistory(request: KrIdRequest): Promise<IpcResult<ProgressHistoryReply>> {
    return this.call(IPC_CHANNELS.KR_PROGRESS_HISTORY, request);
  }

  replaceProgress(request: ReplaceProgressRequest): Promise<IpcResult<ProgressChangeReply>> {
    return this.call(IPC_CHANNELS.KR_REPLACE_PROGRESS, request);
  }

  getReview(request: OkrIdRequest): Promise<IpcResult<ReviewReply>> {
    return this.call(IPC_CHANNELS.REVIEW_GET, request);
  }

  saveReview(request: SaveReviewRequest): Promise<IpcResult<ReviewReply>> {
    return this.call(IPC_CHANNELS.REVIEW_SAVE, request);
  }

  /** Opens the system save dialog in the main process; the reply never has a path unless saved. */
  /** #50: every OKR into one backup file (system save dialog in the main process). */
  exportBackup(): Promise<IpcResult<BackupReply>> {
    return this.call(IPC_CHANNELS.EXPORT_BACKUP, undefined);
  }

  exportOkr(request: ExportRequest): Promise<IpcResult<ExportReply>> {
    return this.call(IPC_CHANNELS.EXPORT_SAVE, request);
  }

  /** Only the path of the last successful export is accepted by the main process. */
  reveal(request: RevealRequest): Promise<IpcResult<RevealReply>> {
    return this.call(IPC_CHANNELS.EXPORT_REVEAL, request);
  }

  /** #49: system open dialog + read + validate in the main process (no path ever comes back). */
  importPick(): Promise<IpcResult<ImportReply>> {
    return this.call(IPC_CHANNELS.IMPORT_PICK, undefined);
  }

  importCommit(request: ImportCommitRequest): Promise<IpcResult<ImportReply>> {
    return this.call(IPC_CHANNELS.IMPORT_COMMIT, request);
  }

  /** Q8-3: re-read the same file (kept by the main process behind the token). */
  importRetry(request: ImportTokenRequest): Promise<IpcResult<ImportReply>> {
    return this.call(IPC_CHANNELS.IMPORT_RETRY, request);
  }

  importDiscard(request: ImportTokenRequest): Promise<IpcResult<{ discarded: boolean }>> {
    return this.call(IPC_CHANNELS.IMPORT_DISCARD, request);
  }

  /** 「复制为 Markdown」: the main process puts the same text as the .md file on the clipboard. */
  copyMarkdown(request: OkrIdRequest): Promise<IpcResult<CopyReply>> {
    return this.call(IPC_CHANNELS.CLIPBOARD_EXPORT, request);
  }

  /**
   * Where this run keeps its data. The channel takes no arguments and answers a bare
   * `{ storageMode }` (no path). Anything unexpected counts as "normal": the memory-mode
   * wording is only added when the main process says so.
   */
  async getStorageMode(): Promise<StorageModeName> {
    const bridge = typeof window === 'undefined' ? undefined : window.clarifyOkr;
    if (!bridge) return 'normal';
    try {
      const reply = (await bridge.invoke(IPC_CHANNELS.STORAGE_STATE_GET, undefined)) as {
        storageMode?: unknown;
      } | null;
      const mode = reply?.storageMode;
      return mode === 'memory' || mode === 'fresh-file' ? mode : 'normal';
    } catch {
      return 'normal';
    }
  }

  /**
   * 「重启应用」: same confirmation rule as quitting. `confirm_pending` means the dialog is open
   * in the main window; the outcome then arrives as `app:restart-result`.
   */
  restart(request: RestartRequest): Promise<IpcResult<RestartReply>> {
    return this.call(IPC_CHANNELS.APP_RESTART, request);
  }

  /** 「新建 OKR」: the main process shows the main window and resets / asks in its wizard. */
  openWizard(): Promise<IpcResult<OpenWizardReply>> {
    return this.call(IPC_CHANNELS.WINDOW_OPEN_WIZARD, undefined);
  }

  /** Tells the main process which unsaved-input flags of this window changed. */
  reportUnsaved(report: UnsavedReport): Promise<IpcResult<UnsavedReportReply>> {
    return this.call(IPC_CHANNELS.APP_REPORT_UNSAVED, report);
  }

  /** The answer to the quit / restart dialog shown in this window. */
  exitAnswer(answer: ExitAnswer): Promise<IpcResult<ExitAnswerReply>> {
    return this.call(IPC_CHANNELS.APP_EXIT_ANSWER, answer);
  }

  /** The quit / restart dialog this window should be showing (asked once when it loads). */
  exitPending(): Promise<IpcResult<ExitPendingReply>> {
    return this.call(IPC_CHANNELS.APP_EXIT_PENDING, undefined);
  }

  /** 「隐藏」: hides the sticky note window (the app keeps running). */
  hideWindow(): Promise<IpcResult<HideWindowReply>> {
    return this.call(IPC_CHANNELS.WINDOW_HIDE, undefined);
  }

  getWindowState(): Promise<IpcResult<WindowStateReply>> {
    return this.call(IPC_CHANNELS.WINDOW_GET_STATE, undefined);
  }

  /** 「窗口始终在最前」 on / off. */
  setAlwaysOnTop(enabled: boolean): Promise<IpcResult<WindowStateReply>> {
    return this.call(IPC_CHANNELS.WINDOW_SET_ALWAYS_ON_TOP, { enabled });
  }

  /** `{ legacyDatabaseRetired }` (bare reply, no path). Anything unexpected counts as false. */
  async getLegacyNotice(): Promise<boolean> {
    const bridge = typeof window === 'undefined' ? undefined : window.clarifyOkr;
    if (!bridge) return false;
    try {
      const reply = (await bridge.invoke(IPC_CHANNELS.LEGACY_NOTICE_GET, undefined)) as {
        legacyDatabaseRetired?: unknown;
      } | null;
      return reply?.legacyDatabaseRetired === true;
    } catch {
      return false;
    }
  }

  /** `{ acknowledged }`; false (or any failure) means the state file could not be saved. */
  async ackLegacyNotice(): Promise<boolean> {
    const bridge = typeof window === 'undefined' ? undefined : window.clarifyOkr;
    if (!bridge) return false;
    try {
      const reply = (await bridge.invoke(IPC_CHANNELS.LEGACY_NOTICE_ACK, undefined)) as {
        acknowledged?: unknown;
      } | null;
      return reply?.acknowledged === true;
    } catch {
      return false;
    }
  }

  /** #54: the reminder clock (fakeable in e2e) and closed review banners; null on failure. */
  async getReminders(): Promise<{ now: string; dismissedQuarters: string[] } | null> {
    const bridge = typeof window === 'undefined' ? undefined : window.clarifyOkr;
    if (!bridge) return null;
    try {
      const reply = (await bridge.invoke(IPC_CHANNELS.REMINDERS_GET, undefined)) as {
        now?: unknown;
        dismissedQuarters?: unknown;
      } | null;
      if (typeof reply?.now !== 'string' || !Array.isArray(reply.dismissedQuarters)) return null;
      return {
        now: reply.now,
        dismissedQuarters: reply.dismissedQuarters.filter(
          (q): q is string => typeof q === 'string',
        ),
      };
    } catch {
      return null;
    }
  }

  /** #54: close one quarter's review banner; false when it could not be saved. */
  async dismissReminder(period: string): Promise<boolean> {
    const bridge = typeof window === 'undefined' ? undefined : window.clarifyOkr;
    if (!bridge) return false;
    try {
      const reply = (await bridge.invoke(IPC_CHANNELS.REMINDERS_DISMISS, { period })) as {
        saved?: unknown;
      } | null;
      return reply?.saved === true;
    } catch {
      return false;
    }
  }

  /**
   * #84 review / #88: ask main to open this OKR's review in the sticky shell. Resolves when the
   * shell took it (`opened`), or it could not (`unavailable`, `timeout`), or a newer request
   * replaced it (`superseded`).
   */
  async goReviewElsewhere(okrId: string): Promise<GoReviewOutcome> {
    const bridge = typeof window === 'undefined' ? undefined : window.clarifyOkr;
    if (!bridge) return 'unavailable';
    try {
      const reply = (await bridge.invoke(IPC_CHANNELS.REMINDERS_GO_REVIEW, { okrId })) as {
        outcome?: unknown;
      } | null;
      const outcome = reply?.outcome;
      return outcome === 'opened' || outcome === 'timeout' || outcome === 'superseded'
        ? outcome
        : 'unavailable';
    } catch {
      return 'unavailable';
    }
  }

  /** #88: this sticky shell shows its first OKR and listens; main may now hand a request over. */
  async reviewReady(): Promise<void> {
    const bridge = typeof window === 'undefined' ? undefined : window.clarifyOkr;
    if (!bridge) return;
    try {
      await bridge.invoke(IPC_CHANNELS.REMINDERS_REVIEW_READY, undefined);
    } catch {
      // main went away: nothing to hand over
    }
  }

  /** #84 review: the review request handed over by main, if any (taken once). */
  async takeReviewRequest(): Promise<string | null> {
    const bridge = typeof window === 'undefined' ? undefined : window.clarifyOkr;
    if (!bridge) return null;
    try {
      const reply = (await bridge.invoke(IPC_CHANNELS.REMINDERS_TAKE_REVIEW, undefined)) as {
        okrId?: unknown;
      } | null;
      return typeof reply?.okrId === 'string' ? reply.okrId : null;
    } catch {
      return null;
    }
  }

  /** Subscribes to a main → renderer event; returns the unsubscribe function. */
  onEvent(channel: string, listener: () => void): () => void {
    const bridge = typeof window === 'undefined' ? undefined : window.clarifyOkr;
    if (!bridge?.on) return () => undefined;
    try {
      return bridge.on(channel, () => listener());
    } catch {
      return () => undefined;
    }
  }

  /** Like `onEvent`, with the event payload (the caller validates it). */
  onPayload(channel: string, listener: (payload: unknown) => void): () => void {
    const bridge = typeof window === 'undefined' ? undefined : window.clarifyOkr;
    if (!bridge?.on) return () => undefined;
    try {
      return bridge.on(channel, (_event: unknown, payload: unknown) => listener(payload));
    } catch {
      return () => undefined;
    }
  }

  private async call<T>(channel: string, payload: unknown): Promise<IpcResult<T>> {
    const bridge = typeof window === 'undefined' ? undefined : window.clarifyOkr;
    if (!bridge) return ipcFail('INTERNAL', 'The IPC bridge is not available');
    try {
      const reply = await bridge.invoke(channel, payload);
      return isIpcResult(reply) ? (reply as IpcResult<T>) : ipcFail('INTERNAL', 'Malformed reply');
    } catch {
      return ipcFail('INTERNAL', 'The request failed');
    }
  }
}
