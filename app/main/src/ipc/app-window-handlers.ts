import {
  IPC_CHANNELS,
  ipcFail,
  ipcOk,
  parseEmptyRequest,
  parseUnsavedReport,
  type IpcResult,
  type OpenWizardReply,
  type UnsavedFlags,
  type UnsavedReport,
  type UnsavedReportReply,
} from '@clarityokr/contracts';
import type { IpcMain } from 'electron';

import { Logger } from '../core/logger.js';

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
}

/** Registers `window:open-wizard` and `app:report-unsaved`. Handlers never throw across IPC. */
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
      if (!tracked.has(sender.id)) {
        tracked.add(sender.id);
        sender.once('destroyed', () => {
          tracked.delete(sender.id);
          deps.unsaved.forget(sender.id);
        });
      }
      return ipcOk({ recorded: true });
    },
  );
}
