import { dirname, join } from 'node:path';

import { Logger } from '../core/logger.js';
import { ConnectionManager } from '../persistence/connection-manager.js';
import {
  LegacyRetireError,
  SchemaVersionError,
  moveDatabaseAside,
  retireLegacyDatabase,
  type LegacyFileOps,
} from '../persistence/okr-store/index.js';
import type { LegacyDatabaseNotice } from './legacy-notice.js';

export interface OpenDatabaseOptions {
  dbPath: string;
  backupsDir: string;
  notice: LegacyDatabaseNotice;
  now?: Date;
  fileOps?: LegacyFileOps;
}

export interface OpenedDatabase {
  connectionManager: ConnectionManager;
  /** The path actually in use (differs from the requested one when a fallback was needed). */
  activePath: string;
  /** An old or unreadable database file was set aside on this launch. */
  legacyRetired: boolean;
  /** `fallback-path`: the original file could not be used or moved; `memory`: nothing on disk worked. */
  degraded: 'fallback-path' | 'memory' | null;
}

function fallbackPath(dbPath: string): string {
  return join(dirname(dbPath), 'clarityokr-fresh.db');
}

function tryInitialize(path: string): ConnectionManager {
  const manager = new ConnectionManager({ dbPath: path });
  try {
    manager.initialize();
    // A file that kept a valid header but lost pages (truncated, corrupt) opens fine and
    // only fails on later queries, so check the structure up front.
    const check = manager.getDb().pragma('quick_check', { simple: true });
    if (check !== 'ok') {
      throw new Error(`Database integrity check failed: ${String(check)}`);
    }
    return manager;
  } catch (error) {
    try {
      manager.close();
    } catch {
      // closing a half-open connection is best effort
    }
    throw error;
  }
}

/**
 * Opens the application database without ever throwing:
 * 1. a pre-versioning, corrupt or non-SQLite file is renamed into backups/ (copy + delete
 *    when renaming is refused), and a fresh database is created at the normal path;
 * 2. if the file cannot be moved (locked, permissions) or still cannot be opened, a fresh
 *    database is created next to it at `clarityokr-fresh.db`;
 * 3. if even that fails, an in-memory database keeps the app running.
 * Every step is logged. A database from a newer app version is never moved aside.
 */
export function openDatabaseSafely(options: OpenDatabaseOptions): OpenedDatabase {
  const { dbPath, backupsDir, notice, now, fileOps } = options;
  let legacyRetired = false;

  const noteRetired = (backupPath: string): void => {
    legacyRetired = true;
    notice.recordRetired();
    Logger.info('[startup] Previous database kept at', backupPath);
  };

  let usable = true;
  try {
    const backupPath = retireLegacyDatabase(dbPath, backupsDir, now, fileOps);
    if (backupPath) {
      noteRetired(backupPath);
    }
  } catch (error) {
    usable = false;
    if (error instanceof LegacyRetireError && error.backupPath) {
      // The data is safe in a copy, but the original is still in the way.
      legacyRetired = true;
      notice.recordRetired();
    }
    Logger.error('[startup] Could not set the previous database aside', error);
  }

  if (usable) {
    try {
      return {
        connectionManager: tryInitialize(dbPath),
        activePath: dbPath,
        legacyRetired,
        degraded: null,
      };
    } catch (error) {
      Logger.error('[startup] Database could not be opened', error);
      if (!(error instanceof SchemaVersionError)) {
        // Passed the header check but is unusable (e.g. truncated after page 1): keep it aside and start fresh.
        try {
          noteRetired(moveDatabaseAside(dbPath, backupsDir, now, fileOps));
          return {
            connectionManager: tryInitialize(dbPath),
            activePath: dbPath,
            legacyRetired,
            degraded: null,
          };
        } catch (retryError) {
          Logger.error('[startup] Recovery at the normal path failed', retryError);
        }
      }
    }
  }

  const alternate = fallbackPath(dbPath);
  try {
    return {
      connectionManager: tryInitialize(alternate),
      activePath: alternate,
      legacyRetired,
      degraded: 'fallback-path',
    };
  } catch (error) {
    Logger.error('[startup] Fallback database failed, using an in-memory database', error);
    return {
      connectionManager: tryInitialize(':memory:'),
      activePath: ':memory:',
      legacyRetired,
      degraded: 'memory',
    };
  }
}
