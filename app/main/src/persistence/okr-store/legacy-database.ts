import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

function timestamp(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

/** True when the file is a SQLite database created before schema versioning (user_version = 0 with tables). */
export function isLegacyDatabase(dbPath: string): boolean {
  if (!existsSync(dbPath)) {
    return false;
  }
  const db = new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true });
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
  } finally {
    db.close();
  }
}

/**
 * Moves a pre-versioning database out of the way so a fresh schema can be created.
 * The old data is kept (renamed, never deleted) and is not imported.
 *
 * @returns the new path of the retired file, or null when nothing needed retiring.
 */
export function retireLegacyDatabase(
  dbPath: string,
  backupsDir: string,
  now: Date = new Date(),
): string | null {
  if (!isLegacyDatabase(dbPath)) {
    return null;
  }
  mkdirSync(backupsDir, { recursive: true });
  const target = join(backupsDir, `${basename(dbPath, '.db')}-${timestamp(now)}.db.bak`);
  renameSync(dbPath, target);
  // WAL side files belong to the retired database and must not be reused by the new one.
  for (const suffix of ['-wal', '-shm']) {
    const side = `${dbPath}${suffix}`;
    if (existsSync(side)) {
      renameSync(side, `${target}${suffix}`);
    }
  }
  return target;
}

export function defaultBackupsDir(dbPath: string): string {
  return join(dirname(dbPath), 'backups');
}
