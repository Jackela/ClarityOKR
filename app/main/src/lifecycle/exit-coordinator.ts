import {
  IPC_CHANNELS,
  ipcFail,
  ipcOk,
  type ConfirmExitEvent,
  type ExitAnswer,
  type ExitAnswerReply,
  type ExitConfirmation,
  type IpcResult,
  type RestartReply,
  type RestartResultEvent,
  type UnsavedFlags,
} from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';

/** The part of a window's renderer the coordinator talks to (a `WebContents` + its window). */
export interface ExitWindow {
  /** `webContents.id`: the same id the IPC sender carries. */
  id: number;
  send(channel: string, payload: unknown): void;
  isDestroyed(): boolean;
  /** Shows and focuses the window. */
  focus(): void;
}

export interface ExitCoordinatorDeps {
  /** The quit / restart rule (`AppRestartService.evaluate`). */
  evaluate: (unsaved: UnsavedFlags) => ExitConfirmation;
  /** Flags every window reported through `app:report-unsaved`. */
  reportedUnsaved: () => UnsavedFlags;
  /** Shows and focuses (creating when needed) a window; `null` when it cannot be shown. */
  showWindow: (which: 'main' | 'sticky') => Promise<ExitWindow | null>;
  /** Really quits (the `before-quit` guard lets this one through). */
  quit: () => void;
  /** `app.relaunch()` + quit; may throw. */
  relaunch: () => void;
}

export type QuitOutcome = 'quitting' | 'confirm_pending';

interface Pending {
  event: ConfirmExitEvent;
  /** Unset while the window is still being shown. */
  host: ExitWindow | null;
}

const or = (a: UnsavedFlags, b: UnsavedFlags): UnsavedFlags => ({
  wizard: a.wizard || b.wizard,
  textEdit: a.textEdit || b.textEdit,
  reviewDraft: a.reviewDraft || b.reviewDraft,
});

/**
 * One place for quitting and restarting (spec §1.2c / §7a.4). Every quit path (app menu, tray,
 * ⌘Q, last-resort `before-quit`) and 「重启应用」 in either window come here.
 *
 * - The decision uses the flags of EVERY window (plus the asking window's own flags).
 * - Nothing to lose → quit / relaunch at once.
 * - Otherwise the windows holding the content are shown, then the dialog is sent to ONE
 *   window: for a quit the one `decideExitConfirmation` names, for a restart always the main
 *   window. Only that window may answer.
 * - Only one dialog exists at a time: asking again while it is open (a second click, the other
 *   window, the tray) just brings that window to the front. A restart asked meanwhile is
 *   remembered, so its window hears the outcome too.
 * - The windows that asked for a restart get `app:restart-result` (`cancelled` / `failed`).
 */
export class ExitCoordinator {
  private pending: Pending | null = null;
  private exiting = false;
  private readonly restartOrigins = new Map<number, ExitWindow>();

  constructor(private readonly deps: ExitCoordinatorDeps) {}

  /** The dialog that `windowId` should be showing (for a window that just loaded). */
  pendingFor(windowId: number): ConfirmExitEvent | null {
    return this.pending?.host?.id === windowId ? this.pending.event : null;
  }

  isExiting(): boolean {
    return this.exiting;
  }

  async requestQuit(): Promise<QuitOutcome> {
    if (this.exiting) return 'quitting';
    if (this.pending) {
      this.pending.host?.focus();
      return 'confirm_pending';
    }
    const confirmation = this.evaluate(this.deps.reportedUnsaved());
    if (!confirmation.needsConfirm) {
      this.exiting = true;
      this.deps.quit();
      return 'quitting';
    }
    await this.open({ kind: 'quit', confirmation }, confirmation.dialogWindow);
    return 'confirm_pending';
  }

  async requestRestart(origin: ExitWindow | null, unsaved: UnsavedFlags): Promise<RestartReply> {
    if (this.exiting) return { outcome: 'restarting' };
    if (this.pending) {
      if (origin) this.restartOrigins.set(origin.id, origin);
      this.pending.host?.focus();
      return { outcome: 'confirm_pending' };
    }
    const confirmation = this.evaluate(or(unsaved, this.deps.reportedUnsaved()));
    if (!confirmation.needsConfirm) {
      return this.relaunch() ? { outcome: 'restarting' } : this.failedReply();
    }
    if (origin) this.restartOrigins.set(origin.id, origin);
    // §7a.4: the restart dialog is always in the main window, even when asked from the sticky.
    await this.open({ kind: 'restart', confirmation }, 'main');
    return { outcome: 'confirm_pending' };
  }

  answer(senderId: number, answer: ExitAnswer): IpcResult<ExitAnswerReply> {
    const pending = this.pending;
    if (!pending || pending.host?.id !== senderId || pending.event.kind !== answer.kind) {
      return ipcFail('INVALID_REQUEST', 'No such dialog is open in this window');
    }
    this.pending = null;
    if (!answer.confirmed) {
      this.notifyOrigins({ outcome: 'cancelled' });
      return ipcOk({ accepted: true });
    }
    if (answer.kind === 'quit') {
      this.exiting = true;
      this.deps.quit();
    } else if (!this.relaunch()) {
      this.notifyOrigins({ outcome: 'failed' });
    }
    return ipcOk({ accepted: true });
  }

  /** A window went away: a dialog it hosted counts as cancelled; it no longer hears results. */
  windowGone(windowId: number): void {
    this.restartOrigins.delete(windowId);
    if (this.pending?.host?.id === windowId) {
      this.pending = null;
      this.notifyOrigins({ outcome: 'cancelled' });
    }
  }

  private evaluate(unsaved: UnsavedFlags): ExitConfirmation {
    return this.deps.evaluate(unsaved);
  }

  private async open(event: ConfirmExitEvent, hostKind: 'main' | 'sticky'): Promise<void> {
    const pending: Pending = { event, host: null };
    this.pending = pending;
    try {
      // Show the windows holding the content first, the dialog's window last (it ends focused).
      for (const which of event.confirmation.windowsToShow) {
        if (which !== hostKind) await this.deps.showWindow(which);
      }
      let host = await this.deps.showWindow(hostKind);
      if (!host && hostKind === 'sticky') host = await this.deps.showWindow('main');
      if (this.pending !== pending) return;
      if (!host) throw new Error('No window can host the dialog');
      pending.host = host;
      host.send(IPC_CHANNELS.APP_CONFIRM_EXIT, event);
    } catch (error) {
      Logger.error('[exit] Could not open the confirmation dialog', error);
      if (this.pending === pending) this.pending = null;
      this.notifyOrigins({ outcome: 'failed' });
    }
  }

  private relaunch(): boolean {
    this.exiting = true;
    try {
      this.deps.relaunch();
      return true;
    } catch (error) {
      // Not restarting after all: later requests are evaluated normally.
      this.exiting = false;
      Logger.error('[restart] Relaunch failed', error);
      return false;
    }
  }

  private failedReply(): RestartReply {
    return { outcome: 'failed', category: 'relaunch_failed' };
  }

  private notifyOrigins(result: RestartResultEvent): void {
    for (const origin of this.restartOrigins.values()) {
      if (origin.isDestroyed()) continue;
      origin.send(IPC_CHANNELS.APP_RESTART_RESULT, result);
      origin.focus();
    }
    this.restartOrigins.clear();
  }
}
