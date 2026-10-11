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

  constructor(dir: string) {
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

  /** The user clicked "知道了": never show it again. */
  acknowledge(): void {
    if (this.read().pending) {
      this.write({ pending: false });
    }
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

  private write(state: NoticeState): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(state));
    } catch (error) {
      Logger.warn('[legacy-notice] Could not persist notice state', error);
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
  ipcMain.handle(IPC_CHANNELS.LEGACY_NOTICE_ACK, () => {
    notice.acknowledge();
    return { acknowledged: true };
  });
}
