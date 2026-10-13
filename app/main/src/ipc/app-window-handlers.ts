import {
  IPC_CHANNELS,
  ipcFail,
  ipcOk,
  parseEmptyRequest,
  parseExitAnswer,
  parseRestartRequest,
  parseSetAlwaysOnTop,
  parseUnsavedReport,
  type ExitAnswerReply,
  type ExitPendingReply,
  type HideWindowReply,
  type IpcResult,
  type RestartReply,
  type WindowStateReply,
  type OpenWizardReply,
  type UnsavedFlags,
  type UnsavedReport,
  type UnsavedReportReply,
} from '@clarityokr/contracts';
import type { IpcMain } from 'electron';

import { Logger } from '../core/logger.js';
import type { ExitCoordinator, ExitWindow } from '../lifecycle/exit-coordinator.js';

const NONE: UnsavedFlags = { wizard: false, textEdit: false, reviewDraft: false };

/**
 * Unsaved-input flags reported by each window (keyed by `webContents.id`). A restart or quit
 * evaluation ORs the aggregate with the flags of the request, so a window that is not the
 * one asking still counts. A closed window is forgotten.
 */
export class UnsavedRegistry {
  private readonly bySender = new Map<number, UnsavedFlags>();

  report(senderId: number, report: UnsavedReport): void {
    const current = this.bySender.get(senderId) ?? NONE;
    this.bySender.set(senderId, { ...current, ...report });
  }

  forget(senderId: number): void {
    this.bySender.delete(senderId);
  }

  aggregate(): UnsavedFlags {
    const result = { ...NONE };
    for (const flags of this.bySender.values()) {
      result.wizard ||= flags.wizard;
      result.textEdit ||= flags.textEdit;
      result.reviewDraft ||= flags.reviewDraft;
    }
    return result;
  }
}

/** The part of a sender this module needs (a `WebContents`). */
export interface ReportingSender {
  id: number;
  once(event: 'destroyed', listener: () => void): unknown;
}

export interface AppWindowHandlerDeps {
  unsaved: UnsavedRegistry;
  /**
   * Shows and focuses the main window (creating it when needed). Returns a sender for the
   * main window's renderer, or `null` when the window was just created (its wizard is
   * already empty, so no event is needed).
   */
  showMainWindow: () => Promise<{ send(channel: string): void } | null>;
  /** Quit / restart decisions and the single confirmation dialog. */
  exit: Pick<ExitCoordinator, 'requestRestart' | 'answer' | 'pendingFor' | 'windowGone'>;
  /** The window behind an IPC sender (`null` when it is gone). */
  windowOf: (senderId: number) => ExitWindow | null;
  /** The sticky note window; only its renderer may hide it or switch 「窗口始终在最前」. */
  sticky: {
    isSticky: (senderId: number) => boolean;
    hide: () => void;
    isAlwaysOnTop: () => boolean;
    setAlwaysOnTop: (enabled: boolean) => void;
  };
}

const NOT_STICKY = 'Only the sticky note window can do this';

/**
 * Registers the window / app-lifecycle channels: `window:open-wizard`, `app:report-unsaved`,
 * `app:restart`, `app:exit-answer`, `app:exit-pending`, `window:hide`, `window:get-state`,
 * `window:set-always-on-top`. Every payload is validated; handlers never throw across IPC.
 */
export function registerAppWindowHandlers(
  ipcMain: Pick<IpcMain, 'handle'>,
  deps: AppWindowHandlerDeps,
): void {
  const tracked = new Set<number>();

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_OPEN_WIZARD,
    async (_event, payload: unknown): Promise<IpcResult<OpenWizardReply>> => {
      const parsed = parseEmptyRequest(payload);
      if (!parsed.ok) return parsed;
      try {
        const target = await deps.showMainWindow();
        target?.send(IPC_CHANNELS.WIZARD_NEW_OKR);
        return ipcOk({ opened: true });
      } catch (error) {
        Logger.error('[ipc] open-wizard failed', error);
        return ipcFail('INTERNAL', 'Something went wrong');
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_REPORT_UNSAVED,
    (event, payload: unknown): IpcResult<UnsavedReportReply> => {
      const parsed = parseUnsavedReport(payload);
      if (!parsed.ok) return parsed;
      const sender = event.sender as unknown as ReportingSender;
      deps.unsaved.report(sender.id, parsed.value);
      track(sender);
      return ipcOk({ recorded: true });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_RESTART,
    async (event, payload: unknown): Promise<IpcResult<RestartReply>> => {
      const parsed = parseRestartRequest(payload);
      if (!parsed.ok) return parsed;
      const sender = event.sender as unknown as ReportingSender;
      track(sender);
      try {
        return ipcOk(
          await deps.exit.requestRestart(deps.windowOf(sender.id), parsed.value.unsaved),
        );
      } catch (error) {
        Logger.error('[ipc] restart failed', error);
        return ipcOk({ outcome: 'failed', category: 'relaunch_failed' });
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_EXIT_ANSWER,
    (event, payload: unknown): IpcResult<ExitAnswerReply> => {
      const parsed = parseExitAnswer(payload);
      if (!parsed.ok) return parsed;
      return deps.exit.answer(senderId(event), parsed.value);
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_EXIT_PENDING,
    (event, payload: unknown): IpcResult<ExitPendingReply> => {
      const parsed = parseEmptyRequest(payload);
      if (!parsed.ok) return parsed;
      return ipcOk({ pending: deps.exit.pendingFor(senderId(event)) });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_HIDE,
    (event, payload: unknown): IpcResult<HideWindowReply> => {
      const parsed = parseEmptyRequest(payload);
      if (!parsed.ok) return parsed;
      if (!deps.sticky.isSticky(senderId(event))) return ipcFail('INVALID_REQUEST', NOT_STICKY);
      deps.sticky.hide();
      return ipcOk({ hidden: true });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_GET_STATE,
    (event, payload: unknown): IpcResult<WindowStateReply> => {
      const parsed = parseEmptyRequest(payload);
      if (!parsed.ok) return parsed;
      if (!deps.sticky.isSticky(senderId(event))) return ipcFail('INVALID_REQUEST', NOT_STICKY);
      return ipcOk({ alwaysOnTop: deps.sticky.isAlwaysOnTop() });
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_SET_ALWAYS_ON_TOP,
    (event, payload: unknown): IpcResult<WindowStateReply> => {
      const parsed = parseSetAlwaysOnTop(payload);
      if (!parsed.ok) return parsed;
      if (!deps.sticky.isSticky(senderId(event))) return ipcFail('INVALID_REQUEST', NOT_STICKY);
      deps.sticky.setAlwaysOnTop(parsed.value.enabled);
      return ipcOk({ alwaysOnTop: deps.sticky.isAlwaysOnTop() });
    },
  );

  function track(sender: ReportingSender): void {
    if (tracked.has(sender.id)) return;
    tracked.add(sender.id);
    sender.once('destroyed', () => {
      tracked.delete(sender.id);
      deps.unsaved.forget(sender.id);
      deps.exit.windowGone(sender.id);
    });
  }
}

function senderId(event: unknown): number {
  return (event as { sender: { id: number } }).sender.id;
}
