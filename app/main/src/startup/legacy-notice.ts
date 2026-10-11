import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { IpcMain } from 'electron';

import { IPC_CHANNELS } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';

export const LEGACY_NOTICE_FILE_NAME = 'legacy-db-notice.json';

interface NoticeState {
  /** A legacy database was retired and the user has not acknowledged the notice yet. */
  pending: boolean;
}

/**
 * Remembers across launches that an old database was set aside and the user has not been
 * told yet. The state is a small file next to the database. The notice carries no path:
 * the renderer only learns "show it or not".
 */
export class LegacyDatabaseNotice {
  private readonly filePath: string;

  /** `writeFile` is injectable so tests can simulate a state file that cannot be saved. */
  constructor(
    dir: string,
    private readonly writeFile: (path: string, content: string) => void = writeFileSync,
  ) {
    this.filePath = join(dir, LEGACY_NOTICE_FILE_NAME);
  }

  /** Call when this launch retired a legacy database. */
  recordRetired(): void {
    this.write({ pending: true });
  }

  /** True until the user acknowledges the notice (it survives restarts until then). */
  shouldShow(): boolean {
    return this.read().pending;
  }

  /**
   * The user clicked "知道了": never show it again. Returns false when the state could not be
   * saved; the notice then stays pending and the user can try again.
   */
  acknowledge(): boolean {
    if (!this.read().pending) {
      return true;
    }
    return this.write({ pending: false });
  }

  private read(): NoticeState {
    try {
      if (!existsSync(this.filePath)) {
        return { pending: false };
      }
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<NoticeState>;
      return { pending: parsed.pending === true };
    } catch (error) {
      Logger.warn('[legacy-notice] Unreadable notice state, treating as already shown', error);
      return { pending: false };
    }
  }

  private write(state: NoticeState): boolean {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      this.writeFile(this.filePath, JSON.stringify(state));
      return true;
    } catch (error) {
      Logger.warn('[legacy-notice] Could not persist notice state', error);
      return false;
    }
  }
}

/** Registers the two renderer-facing channels. Payloads are ignored; the reply is a plain boolean. */
export function registerLegacyNoticeHandlers(
  ipcMain: Pick<IpcMain, 'handle'>,
  notice: LegacyDatabaseNotice,
): void {
  ipcMain.handle(IPC_CHANNELS.LEGACY_NOTICE_GET, () => ({
    legacyDatabaseRetired: notice.shouldShow(),
  }));
  // `acknowledged: false` means the state could not be saved: the notice stays and the
  // renderer may call ack again.
  ipcMain.handle(IPC_CHANNELS.LEGACY_NOTICE_ACK, () => ({
    acknowledged: notice.acknowledge(),
  }));
}
