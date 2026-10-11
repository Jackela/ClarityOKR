import {
  decideExitConfirmation,
  type ExitConfirmation,
  type RestartReply,
  type RestartRequest,
  type StorageModeName,
  type UnsavedFlags,
} from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';

export interface RestartServiceDeps {
  getStorageMode: () => StorageModeName;
  /** Any objective or saved review in the database (OkrStore.hasAnyData). */
  dbHasData: () => boolean;
  /** Relaunches the app (Electron: `app.relaunch()` then `app.quit()`). */
  relaunch: () => void;
}

/**
 * Restart goes through the same confirmation rule as quitting. The renderer owns the
 * unsaved-content flags; the main process owns the storage mode and the database, so it
 * decides. Quit from the menu or tray (PR-D) uses `evaluate` with flags it gathers itself.
 */
export class AppRestartService {
  private restarting = false;

  constructor(private readonly deps: RestartServiceDeps) {}

  evaluate(unsaved: UnsavedFlags): ExitConfirmation {
    let dbHasData: boolean;
    try {
      dbHasData = this.deps.dbHasData();
    } catch (error) {
      // When the database cannot be read, assume there is something to lose.
      Logger.warn(
        '[restart] Could not check the database for data; asking for confirmation',
        error,
      );
      dbHasData = true;
    }
    return decideExitConfirmation({
      storageMode: this.deps.getStorageMode(),
      dbHasData,
      unsaved,
    });
  }

  requestRestart(request: RestartRequest): RestartReply {
    if (this.restarting) {
      return { outcome: 'restarting' };
    }
    const confirmation = this.evaluate(request.unsaved);
    if (confirmation.needsConfirm && request.confirmed !== true) {
      return { outcome: 'confirm_required', confirmation };
    }
    this.restarting = true;
    try {
      this.deps.relaunch();
    } catch (error) {
      // Not restarting after all: allow later requests to be evaluated normally.
      this.restarting = false;
      Logger.error('[restart] Relaunch failed', error);
      return { outcome: 'failed', category: 'relaunch_failed' };
    }
    return { outcome: 'restarting' };
  }
}
