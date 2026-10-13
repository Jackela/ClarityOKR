import {
  decideExitConfirmation,
  type ExitConfirmation,
  type StorageModeName,
  type UnsavedFlags,
} from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';

export interface RestartServiceDeps {
  getStorageMode: () => StorageModeName;
  /** Any objective or saved review in the database (OkrStore.hasAnyData). */
  dbHasData: () => boolean;
}

/**
 * The quit / restart rule. The renderers report their unsaved-content flags; the main process
 * owns the storage mode and the database, so it decides. `ExitCoordinator` asks this for every
 * quit and restart.
 */
export class AppRestartService {
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
}
