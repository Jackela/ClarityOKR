import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

import BetterSqlite3 from 'better-sqlite3';

import { Logger } from '../core/logger.js';
import { ConnectionManager } from '../persistence/connection-manager.js';
import {
  IntegrityCheckError,
  LATEST_SCHEMA_VERSION,
  LegacyRetireError,
  SchemaVersionError,
  getSchemaVersion,
  isCorruptionError,
  moveDatabaseAside,
  retireLegacyDatabase,
  type LegacyFileOps,
} from '../persistence/okr-store/index.js';
import type { LegacyDatabaseNotice } from './legacy-notice.js';

/** `normal`: the regular file; `fresh-file`: a separate empty file next to it; `memory`: nothing is saved. */
export type StorageMode = 'normal' | 'fresh-file' | 'memory';

export interface RetryOptions {
  /** Total tries for a step that failed with a transient error (default 3). */
  attempts?: number;
  /** Pause between tries in milliseconds (default 100). */
  delayMs?: number;
  /** Blocking pause; replaceable so tests do not wait. */
  sleep?: (ms: number) => void;
}

export interface OpenDatabaseOptions {
  dbPath: string;
  backupsDir: string;
  notice: LegacyDatabaseNotice;
  now?: Date;
  fileOps?: LegacyFileOps;
  retry?: RetryOptions;
  /** How long a locked database is waited for per try (default 2000 ms). */
  busyTimeoutMs?: number;
  /** Opens and verifies a database at a path; replaceable to simulate I/O errors in tests. */
  initialize?: (path: string, busyTimeoutMs: number) => ConnectionManager;
}

export interface OpenedDatabase {
  connectionManager: ConnectionManager;
  /** The path actually in use (differs from the requested one when a fallback was needed). */
  activePath: string;
  /** An old or unreadable database file was set aside on this launch. */
  legacyRetired: boolean;
  storageMode: StorageMode;
}

function fallbackPath(dbPath: string): string {
  return join(dirname(dbPath), 'clarityokr-fresh.db');
}

function blockingSleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Runs a step, trying again after a short pause when it fails for a reason that says
 * nothing about the file's content (busy, I/O, cannot open, permission, ...). Corruption,
 * a newer schema and failed moves are final and are not retried.
 */
function withRetries<T>(step: () => T, retry: RetryOptions = {}): T {
  const attempts = Math.max(1, retry.attempts ?? 3);
  const delayMs = retry.delayMs ?? 100;
  const sleep = retry.sleep ?? blockingSleep;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return step();
    } catch (error) {
      const final =
        isCorruptionError(error) ||
        error instanceof SchemaVersionError ||
        error instanceof LegacyRetireError;
      if (final || attempt >= attempts) {
        throw error;
      }
      Logger.warn(`[startup] Transient database error, retry ${attempt}/${attempts - 1}`, error);
      sleep(delayMs);
    }
  }
}

/**
 * Throws SchemaVersionError for an existing database from a newer app version, reading it
 * read-only. Connecting normally would already switch its journal mode, which would change
 * a file this version must leave exactly as it is.
 */
function assertNotNewerSchema(path: string, busyTimeoutMs: number): void {
  if (path === ':memory:' || !existsSync(path) || statSync(path).size === 0) {
    return;
  }
  const probe = new BetterSqlite3(path, {
    readonly: true,
    fileMustExist: true,
    timeout: busyTimeoutMs,
  });
  try {
    const version = getSchemaVersion(probe);
    if (version > LATEST_SCHEMA_VERSION) {
      throw new SchemaVersionError(version, LATEST_SCHEMA_VERSION);
    }
  } finally {
    probe.close();
  }
}

/** Opens the database at a path, brings the schema up to date and verifies its integrity. */
export function initializeConnection(path: string, busyTimeoutMs: number): ConnectionManager {
  assertNotNewerSchema(path, busyTimeoutMs);
  const manager = new ConnectionManager({ dbPath: path, busyTimeoutMs });
  try {
    manager.initialize();
    // A file that kept a valid header but lost pages (truncated, corrupt) opens fine and
    // only fails on later queries, so check the structure up front.
    const check = manager.getDb().pragma('quick_check', { simple: true });
    if (check !== 'ok') {
      throw new IntegrityCheckError(String(check));
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
 * Opens the application database without ever throwing.
 *
 * A file is moved into backups/ only on positive evidence that it is not a usable database
 * for this app: a pre-versioning schema, SQLITE_CORRUPT / SQLITE_NOTADB, or a failed
 * integrity check. Busy, locked, I/O, cannot-open and permission errors are retried a few
 * times and never move the file; a database from a newer app version is never moved either.
 *
 * Order of fallbacks, each logged:
 * 1. the regular path (after moving a legacy/corrupt file aside, when that worked);
 * 2. `clarityokr-fresh.db` next to it, leaving the original untouched;
 * 3. an in-memory database, so the app still starts.
 */
export function openDatabaseSafely(options: OpenDatabaseOptions): OpenedDatabase {
  const { dbPath, backupsDir, notice, now, fileOps, retry } = options;
  const busyTimeoutMs = options.busyTimeoutMs ?? 2000;
  const open = options.initialize ?? initializeConnection;
  const tryInitialize = (path: string): ConnectionManager => open(path, busyTimeoutMs);
  let legacyRetired = false;

  const noteRetired = (backupPath: string): void => {
    legacyRetired = true;
    notice.recordRetired();
    Logger.info('[startup] Previous database kept at', backupPath);
  };
  /** Records a retirement that left a usable copy behind even though the move did not finish. */
  const noteFailedRetire = (error: unknown): void => {
    if (error instanceof LegacyRetireError && error.backupPath && !legacyRetired) {
      noteRetired(error.backupPath);
    }
    Logger.error('[startup] Could not set the previous database aside', error);
  };

  let normalPathUsable = true;
  try {
    const backupPath = withRetries(
      () => retireLegacyDatabase(dbPath, backupsDir, now, fileOps, busyTimeoutMs),
      retry,
    );
    if (backupPath) {
      noteRetired(backupPath);
    }
  } catch (error) {
    normalPathUsable = false;
    noteFailedRetire(error);
  }

  if (normalPathUsable) {
    try {
      return {
        connectionManager: withRetries(() => tryInitialize(dbPath), retry),
        activePath: dbPath,
        legacyRetired,
        storageMode: 'normal',
      };
    } catch (error) {
      Logger.error('[startup] Database could not be opened', error);
      if (isCorruptionError(error)) {
        // Header looked fine but the content is damaged: keep it aside and start fresh.
        try {
          noteRetired(moveDatabaseAside(dbPath, backupsDir, now, fileOps));
          return {
            connectionManager: withRetries(() => tryInitialize(dbPath), retry),
            activePath: dbPath,
            legacyRetired,
            storageMode: 'normal',
          };
        } catch (retryError) {
          noteFailedRetire(retryError);
        }
      }
      // Anything else (busy, I/O, permission, newer schema): the original stays untouched.
    }
  }

  const alternate = fallbackPath(dbPath);
  try {
    return {
      connectionManager: withRetries(() => tryInitialize(alternate), retry),
      activePath: alternate,
      legacyRetired,
      storageMode: 'fresh-file',
    };
  } catch (error) {
    Logger.error('[startup] Fallback database failed, using an in-memory database', error);
    return {
      connectionManager: tryInitialize(':memory:'),
      activePath: ':memory:',
      legacyRetired,
      storageMode: 'memory',
    };
  }
}
