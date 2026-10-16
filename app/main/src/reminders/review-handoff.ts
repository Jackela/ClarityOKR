import { IPC_CHANNELS } from '@clarityokr/contracts';
import type { IpcMain } from 'electron';

/** What the hand-off needs from the sticky window (kept small for tests). */
export interface ReviewHost {
  /** Shows the sticky shell (creating it when needed); false when there is none to show. */
  bringToFront(): Promise<boolean>;
  /** Tells the sticky shell a request is waiting (no-op while it is still loading). */
  notify(): void;
}

/**
 * #84 review: the review page lives in the sticky shell only. 「去复盘」 pressed in a window
 * without one (the main-window results panel) is handed over here: main keeps the request,
 * brings the shell forward and tells it; the shell takes it — at once when it is already up, or
 * on start when it was just created. One pending request at most; the newest wins.
 */
export class ReviewHandoff {
  private pending: string | null = null;

  constructor(private readonly host: ReviewHost) {}

  async request(okrId: string): Promise<boolean> {
    this.pending = okrId;
    const shown = await this.host.bringToFront();
    if (!shown) {
      this.pending = null;
      return false;
    }
    this.host.notify();
    return true;
  }

  take(): string | null {
    const okrId = this.pending;
    this.pending = null;
    return okrId;
  }
}

export function registerReviewHandoffHandlers(
  ipcMain: Pick<IpcMain, 'handle'>,
  handoff: ReviewHandoff,
): void {
  ipcMain.handle(IPC_CHANNELS.REMINDERS_GO_REVIEW, async (_event, payload: { okrId?: unknown }) => {
    const okrId = payload?.okrId;
    if (typeof okrId !== 'string' || okrId === '') return { opened: false };
    return { opened: await handoff.request(okrId) };
  });
  ipcMain.handle(IPC_CHANNELS.REMINDERS_TAKE_REVIEW, () => ({ okrId: handoff.take() }));
}
