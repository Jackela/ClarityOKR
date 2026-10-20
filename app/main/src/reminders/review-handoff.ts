import { IPC_CHANNELS } from '@clarityokr/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

/** What the hand-off needs from the sticky window (kept small for tests). */
export interface ReviewHost {
  /**
   * Shows the sticky shell (creating it when needed); false when there is none to show. For a new
   * window it resolves only after its document has been sent, so a request delivered later can
   * never be overtaken by that document (#88).
   */
  bringToFront(): Promise<boolean>;
  /** `webContents.id` of the sticky shell now, or null. */
  currentShell(): number | null;
  /** Tells the sticky shell a request is waiting (it then calls REMINDERS_TAKE_REVIEW). */
  notify(): void;
}

export interface HandoffTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/**
 * opened: the shell took it. unavailable: no sticky shell this run. timeout: the shell did not
 * get ready (one silent retry included). superseded: a newer 去复盘 replaced it (only the last
 * one opens).
 */
export type HandoffOutcome = 'opened' | 'unavailable' | 'timeout' | 'superseded';

/** #88: how long main waits for the sticky shell to say it is ready, per attempt (2 attempts). */
export const READY_WAIT_MS = 5_000;

interface Pending {
  okrId: string;
  resolve: (outcome: HandoffOutcome) => void;
  retried: boolean;
  timer: unknown;
}

/**
 * #84 review / #88: the review page lives in the sticky shell only. 「去复盘」 pressed in a window
 * without one (the main-window results panel) is handed over here. Main keeps the request,
 * brings the shell forward, and delivers it only when both are true:
 *  - the shell has said it is ready (REMINDERS_REVIEW_READY: its own first OKR is on screen), and
 *  - no bring-to-front is still in flight (a new window's document has been sent before).
 * Main → renderer messages keep their order, so the shell always sees its first document before
 * the request and the request wins (the N55 (1) race, #88). One pending request at most; the
 * newest wins. Not ready after READY_WAIT_MS: one silent retry (raise again, notify when ready),
 * then the request is dropped and answered `timeout`.
 */
export class ReviewHandoff {
  private pending: Pending | null = null;
  private readonly ready = new Set<number>();
  private raising = 0;

  constructor(
    private readonly host: ReviewHost,
    private readonly timers: HandoffTimers = {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
  ) {}

  request(okrId: string): Promise<HandoffOutcome> {
    this.settle('superseded');
    return new Promise<HandoffOutcome>((resolve) => {
      const entry: Pending = { okrId, resolve, retried: false, timer: null };
      this.pending = entry;
      entry.timer = this.timers.setTimeout(() => void this.onTimeout(entry), READY_WAIT_MS);
      void this.raise().then((shown) => {
        if (this.pending !== entry) return;
        if (!shown) this.settle('unavailable');
        // shown: raise() delivers on its way out once no raise is in flight
      });
    });
  }

  /** The sticky shell `id` shows its first OKR and listens (REMINDERS_REVIEW_READY). */
  shellReady(id: number): void {
    this.ready.add(id);
    this.deliverIfReady();
  }

  /** The shell's renderer went away (window closed or reloaded). */
  shellGone(id: number): void {
    this.ready.delete(id);
  }

  take(): string | null {
    const entry = this.pending;
    if (!entry) return null;
    this.settle('opened');
    return entry.okrId;
  }

  private async raise(): Promise<boolean> {
    this.raising += 1;
    try {
      return await this.host.bringToFront();
    } finally {
      this.raising -= 1;
      // the last raise in flight finished (maybe an older request's): deliver what waits now
      if (this.raising === 0) this.deliverIfReady();
    }
  }

  private deliverIfReady(): void {
    const shell = this.host.currentShell();
    if (!this.pending || this.raising > 0 || shell === null || !this.ready.has(shell)) return;
    this.host.notify();
  }

  private async onTimeout(entry: Pending): Promise<void> {
    if (this.pending !== entry) return;
    if (entry.retried) return this.settle('timeout');
    // one silent retry: raise again (a window that went away is created anew) and wait again
    entry.retried = true;
    entry.timer = this.timers.setTimeout(() => void this.onTimeout(entry), READY_WAIT_MS);
    const shown = await this.raise();
    if (this.pending !== entry) return;
    if (!shown) this.settle('unavailable');
  }

  private settle(outcome: HandoffOutcome): void {
    const entry = this.pending;
    if (!entry) return;
    this.pending = null;
    this.timers.clearTimeout(entry.timer);
    entry.resolve(outcome);
  }
}

export function registerReviewHandoffHandlers(
  ipcMain: Pick<IpcMain, 'handle'>,
  handoff: ReviewHandoff,
): void {
  ipcMain.handle(IPC_CHANNELS.REMINDERS_GO_REVIEW, async (_event, payload: { okrId?: unknown }) => {
    const okrId = payload?.okrId;
    if (typeof okrId !== 'string' || okrId === '') return { opened: false, outcome: 'unavailable' };
    const outcome = await handoff.request(okrId);
    return { opened: outcome === 'opened', outcome };
  });
  ipcMain.handle(IPC_CHANNELS.REMINDERS_TAKE_REVIEW, () => ({ okrId: handoff.take() }));
  ipcMain.handle(IPC_CHANNELS.REMINDERS_REVIEW_READY, (event: IpcMainInvokeEvent) => {
    const id = event.sender.id;
    handoff.shellReady(id);
    event.sender.once('destroyed', () => handoff.shellGone(id));
    event.sender.once('did-navigate', () => handoff.shellGone(id));
    return { ok: true };
  });
}
