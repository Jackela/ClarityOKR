import { copyFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type { Database } from 'better-sqlite3';

import { Logger } from '../../core/logger.js';
import { errorCode, isCorruptionError } from './db-errors.js';

/** File operations used to move a database aside; injectable so failures can be simulated. */
export interface LegacyFileOps {
  renameSync: (from: string, to: string) => void;
  copyFileSync: (from: string, to: string) => void;
  unlinkSync: (path: string) => void;
}

const defaultFileOps: LegacyFileOps = { renameSync, copyFileSync, unlinkSync };

/** The database file could not be moved out of the way (locked, permissions, ...). */
export class LegacyRetireError extends Error {
  constructor(
    message: string,
    /** Where a copy of the old file was saved, when copying worked but removing the original did not. */
    readonly backupPath: string | null,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = 'LegacyRetireError';
  }
}

function timestamp(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

/**
 * True when the file cannot be used as a current database and should be kept aside:
 * a SQLite file from before schema versioning (user_version = 0 with tables), or a file
 * that is not a readable SQLite database (garbage bytes, truncated or corrupt).
 * A zero-byte file is a fresh database for SQLite and is left alone. Only SQLITE_CORRUPT /
 * SQLITE_NOTADB count as unusable; any other error (busy, locked, I/O, cannot open,
 * permission) is rethrown so the caller never moves a possibly healthy file away.
 */
export function isLegacyDatabase(dbPath: string, busyTimeoutMs?: number): boolean {
  if (!existsSync(dbPath)) {
    return false;
  }
  if (statSync(dbPath).size === 0) {
    return false;
  }
  let db: Database;
  try {
    db = new BetterSqlite3(dbPath, {
      readonly: true,
      fileMustExist: true,
      ...(busyTimeoutMs === undefined ? {} : { timeout: busyTimeoutMs }),
    });
  } catch (error) {
    if (isCorruptionError(error)) {
      Logger.warn('[legacy-database] File is not a SQLite database, treating as unusable', error);
      return true;
    }
    throw error;
  }
  try {
    const version = db.pragma('user_version', { simple: true }) as number;
    if (version !== 0) {
      return false;
    }
    const row = db
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'")
      .get() as {
      n: number;
    };
    return row.n > 0;
  } catch (error) {
    if (isCorruptionError(error)) {
      Logger.warn('[legacy-database] File is not a readable SQLite database', error);
      return true;
    }
    throw error;
  } finally {
    db.close();
  }
}

/** Moves one file; when renaming fails (locked, cross-device) copies it and removes the original. */
function moveFile(from: string, to: string, ops: LegacyFileOps): 'rename' | 'copy' {
  try {
    ops.renameSync(from, to);
    return 'rename';
  } catch (renameError) {
    Logger.warn(`[legacy-database] Rename failed (${errorCode(renameError)}), copying instead`);
    try {
      ops.copyFileSync(from, to);
    } catch (copyError) {
      throw new LegacyRetireError(`Could not move or copy ${from} to ${to}`, null, copyError);
    }
    try {
      ops.unlinkSync(from);
    } catch (unlinkError) {
      throw new LegacyRetireError(
        `Copied ${from} to ${to} but could not remove the original`,
        to,
        unlinkError,
      );
    }
    return 'copy';
  }
}

/**
 * Moves a database file (and its WAL side files) into backupsDir as
 * `<name>-<yyyyMMdd-HHmmss>.db.bak`. Data is kept, never deleted or imported.
 *
 * @throws LegacyRetireError when the file or one of its WAL side files cannot be moved away;
 *   the path must then not be reused for a new database.
 */
export function moveDatabaseAside(
  dbPath: string,
  backupsDir: string,
  now: Date = new Date(),
  ops: LegacyFileOps = defaultFileOps,
): string {
  mkdirSync(backupsDir, { recursive: true });
  const target = join(backupsDir, `${basename(dbPath, '.db')}-${timestamp(now)}.db.bak`);
  moveFile(dbPath, target, ops);
  // WAL side files belong to the retired database and must not be reused by the new one.
  for (const suffix of ['-wal', '-shm']) {
    const side = `${dbPath}${suffix}`;
    if (existsSync(side)) {
      try {
        moveFile(side, `${target}${suffix}`, ops);
      } catch (error) {
        // A leftover WAL next to the path could be replayed into a new database created there.
        throw new LegacyRetireError(
          `Moved the database but could not remove its side file ${side}`,
          target,
          error,
        );
      }
    }
  }
  for (const suffix of ['-wal', '-shm']) {
    if (existsSync(`${dbPath}${suffix}`)) {
      throw new LegacyRetireError(
        `Side file ${dbPath}${suffix} is still present after moving the database`,
        target,
      );
    }
  }
  return target;
}

/**
 * Moves a pre-versioning (or unreadable) database out of the way so a fresh schema can
 * be created. The old data is kept and is not imported.
 *
 * @returns the new path of the retired file, or null when nothing needed retiring.
 * @throws LegacyRetireError when the file needs retiring but cannot be moved.
 */
export function retireLegacyDatabase(
  dbPath: string,
  backupsDir: string,
  now: Date = new Date(),
  ops: LegacyFileOps = defaultFileOps,
  busyTimeoutMs?: number,
): string | null {
  if (!isLegacyDatabase(dbPath, busyTimeoutMs)) {
    return null;
  }
  return moveDatabaseAside(dbPath, backupsDir, now, ops);
}

export function defaultBackupsDir(dbPath: string): string {
  return join(dirname(dbPath), 'backups');
}
