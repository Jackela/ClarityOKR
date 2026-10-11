import { createHash } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';

import {
  LATEST_SCHEMA_VERSION,
  OkrStore,
  OkrStoreRepository,
  applySchema,
  getSchemaVersion,
  isLegacyDatabase,
  retireLegacyDatabase,
  LegacyRetireError,
  type LegacyFileOps,
} from '../../../../app/main/src/persistence/okr-store/index.js';
import { resolveDbPath } from '../../../../app/main/src/startup/db-path.js';
import {
  LEGACY_NOTICE_FILE_NAME,
  LegacyDatabaseNotice,
  registerLegacyNoticeHandlers,
} from '../../../../app/main/src/startup/legacy-notice.js';
import {
  initializeConnection,
  openDatabaseSafely,
} from '../../../../app/main/src/startup/open-database.js';
import { FallbackKeyProvider } from '../../../../app/main/src/services/secure-storage/fallback-key-provider.js';
import { LlmConfigStore } from '../../../../app/main/src/services/secure-storage/llm-config-store.js';
import { IPC_CHANNELS } from '@clarityokr/contracts';

/**
 * Builds a database exactly as the previous app version created it: tables from the old
 * ConnectionManager.createTables (sessions, okr_documents, action_logs, migrations),
 * WAL mode, and no PRAGMA user_version.
 */
function buildOldVersionDb(path: string): void {
  const db = new BetterSqlite3(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      initial_intent TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'collecting',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      steps TEXT NOT NULL,
      selected_options TEXT NOT NULL,
      confidence REAL NOT NULL,
      pending_question_id TEXT
    );
    CREATE TABLE IF NOT EXISTS okr_documents (
      id TEXT PRIMARY KEY,
      objective TEXT NOT NULL,
      key_results TEXT NOT NULL,
      source_session_id TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      last_edited_at TEXT,
      regeneration_policy TEXT NOT NULL,
      manual_edits TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS action_logs (
      id TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      session_id TEXT NOT NULL,
      okr_id TEXT,
      payload_summary TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      version TEXT NOT NULL,
      migrated_at TEXT NOT NULL,
      source TEXT
    );
  `);
  db.prepare(
    `INSERT INTO okr_documents VALUES ('old-okr', 'Old objective', '[{"id":"k1","statement":"Old KR"}]',
       'old-session', '2026-01-01T00:00:00.000Z', NULL, 'overwrite', '[]')`,
  ).run();
  db.prepare(
    `INSERT INTO sessions VALUES ('old-session', 'intent', 'completed', 'x', 'x', '[]', '[]', 0.9, NULL)`,
  ).run();
  db.prepare(
    `INSERT INTO migrations (version, migrated_at, source) VALUES ('1', 'x', 'test')`,
  ).run();
  db.close();
}

const sha = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

/** A healthy database of the current app version (rollback-journal mode, one session row). */
function buildCurrentVersionDb(path: string, userVersion?: number): void {
  const db = new BetterSqlite3(path);
  applySchema(db);
  db.prepare(
    `INSERT INTO sessions (id, initial_intent, created_at, updated_at, steps, selected_options, confidence)
     VALUES ('keep-me', 'intent', 'x', 'x', '[]', '[]', 0.5)`,
  ).run();
  if (userVersion !== undefined) {
    db.pragma(`user_version = ${userVersion}`);
  }
  db.close();
}

const sqliteError = (code: string): Error =>
  Object.assign(new Error(`simulated ${code}`), { code });

function sessionCount(path: string): number {
  const db = new BetterSqlite3(path, { readonly: true });
  try {
    return (db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n;
  } finally {
    db.close();
  }
}

function tableNames(path: string): string[] {
  const db = new BetterSqlite3(path, { readonly: true });
  try {
    return (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
        name: string;
      }>
    ).map((r) => r.name);
  } finally {
    db.close();
  }
}

function backupFiles(dir: string): string[] {
  const backups = join(dir, 'backups');
  return existsSync(backups) ? readdirSync(backups).filter((f) => f.endsWith('.db.bak')) : [];
}

describe('startup: opening the database', () => {
  let userData: string;
  let dbPath: string;
  const backupsDir = (): string => join(userData, 'backups');
  const launch = (extra: Partial<Parameters<typeof openDatabaseSafely>[0]> = {}) =>
    openDatabaseSafely({
      dbPath,
      backupsDir: backupsDir(),
      notice: new LegacyDatabaseNotice(userData),
      now: new Date(2026, 9, 12, 8, 30, 15),
      ...extra,
    });

  beforeEach(() => {
    userData = mkdtempSync(join(tmpdir(), 'okr-userdata-'));
    dbPath = resolveDbPath({ e2eTest: false, userDataDir: userData });
  });
  afterEach(() => rmSync(userData, { recursive: true, force: true }));

  describe('real old-version database fixture', () => {
    it('is recognised as legacy: no user_version, old tables only', () => {
      buildOldVersionDb(dbPath);
      expect(isLegacyDatabase(dbPath)).toBe(true);
      const names = tableNames(dbPath);
      expect(names).toEqual(expect.arrayContaining(['okr_documents', 'migrations']));
      expect(names).not.toContain('objectives');
    });

    it('first launch keeps the old file in backups/ and starts an empty, usable latest-schema database', async () => {
      buildOldVersionDb(dbPath);
      const opened = launch();

      expect(opened.legacyRetired).toBe(true);
      expect(opened.storageMode).toBe('normal');
      expect(opened.activePath).toBe(dbPath);

      // old file is kept with its data, byte-for-byte readable
      const backups = backupFiles(userData);
      expect(backups).toEqual(['clarityokr-20261012-083015.db.bak']);
      const old = new BetterSqlite3(join(backupsDir(), backups[0]!), { readonly: true });
      expect(old.prepare('SELECT objective FROM okr_documents').get()).toEqual({
        objective: 'Old objective',
      });
      old.close();

      // new database: latest schema, no old tables, empty
      const db = opened.connectionManager.getDb();
      expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
      const names = tableNames(dbPath);
      expect(names).not.toContain('okr_documents');
      expect(names).not.toContain('migrations');
      expect(names).toEqual(expect.arrayContaining(['objectives', 'key_results', 'sessions']));
      expect(db.prepare('SELECT COUNT(*) AS n FROM objectives').get()).toEqual({ n: 0 });
      expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });

      // and usable through the real repository
      const repo = new OkrStoreRepository(new OkrStore(db));
      expect(await repo.loadLatest()).toBeNull();
      await repo.save({
        id: 'new-okr',
        objective: 'Fresh start',
        keyResults: [{ id: 'k1', statement: 'First' }],
        sourceSessionId: 's1',
        generatedAt: '2026-10-12T00:00:00.000Z',
        lastEditedAt: null,
        regenerationPolicy: 'overwrite',
        manualEdits: [],
      });
      expect((await repo.loadLatest())?.objective).toBe('Fresh start');
      opened.connectionManager.close();
    });

    it('second launch: the database is left alone, nothing new is backed up', () => {
      buildOldVersionDb(dbPath);
      launch().connectionManager.close();
      const second = launch({ now: new Date(2026, 9, 13, 9, 0, 0) });
      expect(second.legacyRetired).toBe(false);
      expect(backupFiles(userData)).toHaveLength(1);
      expect(getSchemaVersion(second.connectionManager.getDb())).toBe(LATEST_SCHEMA_VERSION);
      second.connectionManager.close();
    });
  });

  describe('one-time legacy notice signal', () => {
    const fakeIpc = () => {
      const handlers = new Map<string, () => unknown>();
      return {
        ipcMain: { handle: (channel: string, fn: () => unknown) => void handlers.set(channel, fn) },
        call: (channel: string) => handlers.get(channel)?.(),
      };
    };

    it('first launch => signal present; after the user acknowledges, second launch => absent', () => {
      buildOldVersionDb(dbPath);

      // launch 1
      const first = launch();
      const ipc1 = fakeIpc();
      registerLegacyNoticeHandlers(ipc1.ipcMain, new LegacyDatabaseNotice(userData));
      expect(ipc1.call(IPC_CHANNELS.LEGACY_NOTICE_GET)).toEqual({ legacyDatabaseRetired: true });
      expect(ipc1.call(IPC_CHANNELS.LEGACY_NOTICE_ACK)).toEqual({ acknowledged: true });
      expect(ipc1.call(IPC_CHANNELS.LEGACY_NOTICE_GET)).toEqual({ legacyDatabaseRetired: false });
      first.connectionManager.close();

      // launch 2 (new process: new notice object, same userData)
      const second = launch();
      const ipc2 = fakeIpc();
      registerLegacyNoticeHandlers(ipc2.ipcMain, new LegacyDatabaseNotice(userData));
      expect(second.legacyRetired).toBe(false);
      expect(ipc2.call(IPC_CHANNELS.LEGACY_NOTICE_GET)).toEqual({ legacyDatabaseRetired: false });
      second.connectionManager.close();
    });

    it('stays pending across a restart until acknowledged, then never again', () => {
      buildOldVersionDb(dbPath);
      launch().connectionManager.close();
      // restart without the user having clicked "知道了"
      expect(new LegacyDatabaseNotice(userData).shouldShow()).toBe(true);
      const notice = new LegacyDatabaseNotice(userData);
      notice.acknowledge();
      expect(new LegacyDatabaseNotice(userData).shouldShow()).toBe(false);
      // acknowledging again is harmless
      notice.acknowledge();
      expect(new LegacyDatabaseNotice(userData).shouldShow()).toBe(false);
    });

    it('is absent on a normal first install', () => {
      const opened = launch();
      expect(opened.legacyRetired).toBe(false);
      const ipc = fakeIpc();
      registerLegacyNoticeHandlers(ipc.ipcMain, new LegacyDatabaseNotice(userData));
      expect(ipc.call(IPC_CHANNELS.LEGACY_NOTICE_GET)).toEqual({ legacyDatabaseRetired: false });
      expect(existsSync(join(userData, LEGACY_NOTICE_FILE_NAME))).toBe(false);
      expect(existsSync(backupsDir())).toBe(false);
      opened.connectionManager.close();
    });

    it('a launch that retires a legacy database leaves exactly one .db.bak in backups/ and a path-free reply', () => {
      buildOldVersionDb(dbPath);
      const opened = launch();
      opened.connectionManager.close();
      expect(backupFiles(userData)).toEqual(['clarityokr-20261012-083015.db.bak']);
      const ipc = fakeIpc();
      registerLegacyNoticeHandlers(ipc.ipcMain, new LegacyDatabaseNotice(userData));
      const reply = ipc.call(IPC_CHANNELS.LEGACY_NOTICE_GET);
      expect(reply).toEqual({ legacyDatabaseRetired: true });
      expect(JSON.stringify(reply)).not.toMatch(/bak|backups|\//);
    });

    it('treats an unreadable state file as already shown instead of crashing', () => {
      writeFileSync(join(userData, LEGACY_NOTICE_FILE_NAME), '{not json');
      expect(new LegacyDatabaseNotice(userData).shouldShow()).toBe(false);
    });
  });

  describe('files that are not usable databases never crash startup', () => {
    it('garbage bytes: kept in backups/, fresh database at the normal path', () => {
      const garbage = Buffer.from('this is definitely not a sqlite database '.repeat(200));
      writeFileSync(dbPath, garbage);
      const opened = launch();
      expect(opened.legacyRetired).toBe(true);
      expect(opened.storageMode).toBe('normal');
      expect(opened.activePath).toBe(dbPath);
      const backups = backupFiles(userData);
      expect(backups).toHaveLength(1);
      expect(readFileSync(join(backupsDir(), backups[0]!)).equals(garbage)).toBe(true);
      expect(getSchemaVersion(opened.connectionManager.getDb())).toBe(LATEST_SCHEMA_VERSION);
      expect(new LegacyDatabaseNotice(userData).shouldShow()).toBe(true);
      opened.connectionManager.close();
    });

    it('empty file: treated as a fresh database, nothing moved, no notice', () => {
      writeFileSync(dbPath, '');
      const opened = launch();
      expect(opened.legacyRetired).toBe(false);
      expect(opened.storageMode).toBe('normal');
      expect(backupFiles(userData)).toHaveLength(0);
      expect(getSchemaVersion(opened.connectionManager.getDb())).toBe(LATEST_SCHEMA_VERSION);
      expect(new LegacyDatabaseNotice(userData).shouldShow()).toBe(false);
      opened.connectionManager.close();
    });

    it.each([50, 100, 4096])(
      'old-version SQLite file truncated to %i bytes: kept in backups/, fresh database created',
      (size) => {
        buildOldVersionDb(dbPath);
        truncateSync(dbPath, size);
        expect(() => isLegacyDatabase(dbPath)).not.toThrow();
        const opened = launch();
        expect(opened.legacyRetired).toBe(true);
        expect(opened.storageMode).toBe('normal');
        expect(backupFiles(userData)).toHaveLength(1);
        expect(getSchemaVersion(opened.connectionManager.getDb())).toBe(LATEST_SCHEMA_VERSION);
        opened.connectionManager.close();
      },
    );

    it('current-version SQLite file truncated after its header: moved aside, fresh database created', () => {
      const real = new BetterSqlite3(dbPath);
      real.pragma('journal_mode = DELETE');
      real.close();
      // build a current-schema file with enough rows to span many pages, then cut it short
      const seeded = launch();
      const db = seeded.connectionManager.getDb();
      db.pragma('journal_mode = DELETE');
      const insert = db.prepare(
        `INSERT INTO sessions (id, initial_intent, created_at, updated_at, steps, selected_options, confidence)
         VALUES (?, ?, 'x', 'x', ?, '[]', 0.5)`,
      );
      for (let i = 0; i < 200; i += 1) {
        insert.run(`s${i}`, 'intent', 'z'.repeat(2000));
      }
      seeded.connectionManager.close();
      truncateSync(dbPath, 8192);

      const opened = launch();
      expect(opened.storageMode).toBe('normal');
      expect(opened.legacyRetired).toBe(true);
      expect(backupFiles(userData)).toHaveLength(1);
      const fresh = opened.connectionManager.getDb();
      expect(getSchemaVersion(fresh)).toBe(LATEST_SCHEMA_VERSION);
      expect(fresh.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });
      opened.connectionManager.close();
    });
  });

  describe('integrity check after opening', () => {
    it('current-version file whose inner pages are damaged (header intact): moved aside, fresh database created', () => {
      const seeded = launch();
      const db = seeded.connectionManager.getDb();
      db.pragma('journal_mode = DELETE');
      const insert = db.prepare(
        `INSERT INTO sessions (id, initial_intent, created_at, updated_at, steps, selected_options, confidence)
         VALUES (?, ?, 'x', 'x', ?, '[]', 0.5)`,
      );
      for (let i = 0; i < 200; i += 1) {
        insert.run(`s${i}`, 'intent', 'z'.repeat(2000));
      }
      seeded.connectionManager.close();

      // Overwrite a stretch of data pages; page 1 (header, schema, user_version) stays valid.
      const bytes = readFileSync(dbPath);
      bytes.fill(0xff, 8192, 8192 + 16384);
      writeFileSync(dbPath, bytes);
      const probe = new BetterSqlite3(dbPath, { readonly: true });
      expect(probe.pragma('user_version', { simple: true })).toBe(LATEST_SCHEMA_VERSION);
      probe.close();
      expect(isLegacyDatabase(dbPath)).toBe(false);

      const opened = launch();
      expect(opened.storageMode).toBe('normal');
      expect(opened.legacyRetired).toBe(true);
      expect(backupFiles(userData)).toHaveLength(1);
      const fresh = opened.connectionManager.getDb();
      expect(fresh.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });
      opened.connectionManager.close();
    });
  });

  describe('rename failures', () => {
    const busy = (): never => {
      throw Object.assign(new Error('resource busy or locked'), { code: 'EBUSY' });
    };
    const denied = (): never => {
      throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
    };
    const realOps: LegacyFileOps = {
      renameSync: (from, to) => {
        copyFileSync(from, to);
        rmSync(from);
      },
      copyFileSync,
      unlinkSync: (path) => rmSync(path),
    };

    it('rename throws EBUSY: falls back to copy + delete and still starts on a fresh database', () => {
      buildOldVersionDb(dbPath);
      const opened = launch({ fileOps: { ...realOps, renameSync: busy } });
      expect(opened.legacyRetired).toBe(true);
      expect(opened.storageMode).toBe('normal');
      expect(opened.activePath).toBe(dbPath);
      const backups = backupFiles(userData);
      expect(backups).toHaveLength(1);
      const old = new BetterSqlite3(join(backupsDir(), backups[0]!), { readonly: true });
      expect(old.prepare('SELECT id FROM okr_documents').get()).toEqual({ id: 'old-okr' });
      old.close();
      expect(tableNames(dbPath)).not.toContain('okr_documents');
      expect(getSchemaVersion(opened.connectionManager.getDb())).toBe(LATEST_SCHEMA_VERSION);
      opened.connectionManager.close();
    });

    it('rename throws EPERM and the original cannot be deleted: starts on clarityokr-fresh.db, original untouched, copy kept', () => {
      buildOldVersionDb(dbPath);
      const opened = launch({ fileOps: { ...realOps, renameSync: denied, unlinkSync: denied } });
      expect(opened.storageMode).toBe('fresh-file');
      expect(opened.activePath).toBe(join(userData, 'clarityokr-fresh.db'));
      expect(opened.legacyRetired).toBe(true);
      expect(backupFiles(userData)).toHaveLength(1);
      expect(tableNames(dbPath)).toContain('okr_documents');
      expect(getSchemaVersion(opened.connectionManager.getDb())).toBe(LATEST_SCHEMA_VERSION);
      expect(new LegacyDatabaseNotice(userData).shouldShow()).toBe(true);
      opened.connectionManager.close();
    });

    it('neither rename nor copy works: still starts, original untouched, no notice', () => {
      buildOldVersionDb(dbPath);
      const opened = launch({
        fileOps: { renameSync: busy, copyFileSync: denied, unlinkSync: denied },
      });
      expect(opened.storageMode).toBe('fresh-file');
      expect(opened.legacyRetired).toBe(false);
      expect(backupFiles(userData)).toHaveLength(0);
      expect(tableNames(dbPath)).toContain('okr_documents');
      expect(new LegacyDatabaseNotice(userData).shouldShow()).toBe(false);
      opened.connectionManager.close();
    });

    it('retireLegacyDatabase reports the failure as LegacyRetireError with the copy location', () => {
      buildOldVersionDb(dbPath);
      let caught: unknown;
      try {
        retireLegacyDatabase(dbPath, backupsDir(), new Date(2026, 9, 12), {
          ...realOps,
          renameSync: busy,
          unlinkSync: denied,
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(LegacyRetireError);
      expect((caught as LegacyRetireError).backupPath).toContain('.db.bak');
    });

    it('a WAL side file that cannot be moved, copied or deleted is reported, not ignored', () => {
      buildOldVersionDb(dbPath);
      writeFileSync(`${dbPath}-wal`, 'stale');
      const stuck = (): never => {
        throw Object.assign(new Error('busy'), { code: 'EBUSY' });
      };
      const ops: LegacyFileOps = {
        ...realOps,
        renameSync: (from, to) => (from.endsWith('-wal') ? stuck() : realOps.renameSync(from, to)),
        copyFileSync: (from, to) => (from.endsWith('-wal') ? stuck() : copyFileSync(from, to)),
      };
      let caught: unknown;
      try {
        retireLegacyDatabase(dbPath, backupsDir(), new Date(2026, 9, 12), ops);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(LegacyRetireError);
      expect((caught as LegacyRetireError).backupPath).toContain('.db.bak');
      expect(existsSync(dbPath)).toBe(false); // main file did move
      expect(existsSync(`${dbPath}-wal`)).toBe(true); // stuck side file is still there
    });
  });

  describe('only corruption may move a database away', () => {
    const noWait = (sleeps: number[]) => ({
      attempts: 3,
      delayMs: 7,
      sleep: (ms: number) => void sleeps.push(ms),
    });

    it('a healthy database that is locked (SQLITE_BUSY) is not moved: retried, then fresh-file fallback, original untouched', () => {
      buildCurrentVersionDb(dbPath);
      const before = sha(dbPath);
      const holder = new BetterSqlite3(dbPath);
      holder.exec('BEGIN EXCLUSIVE');
      const sleeps: number[] = [];
      let opened;
      try {
        opened = launch({ busyTimeoutMs: 20, retry: noWait(sleeps) });
      } finally {
        holder.exec('ROLLBACK');
        holder.close();
      }
      expect(opened.storageMode).toBe('fresh-file');
      expect(opened.activePath).toBe(join(userData, 'clarityokr-fresh.db'));
      expect(opened.legacyRetired).toBe(false);
      expect(sleeps).toEqual([7, 7]); // 3 tries => 2 pauses
      expect(backupFiles(userData)).toHaveLength(0);
      expect(existsSync(backupsDir())).toBe(false);
      expect(new LegacyDatabaseNotice(userData).shouldShow()).toBe(false);
      opened.connectionManager.close();
      expect(sha(dbPath)).toBe(before);

      // once the lock is gone the same file opens normally and its data is still there
      const again = launch();
      expect(again.storageMode).toBe('normal');
      expect(again.legacyRetired).toBe(false);
      expect(
        again.connectionManager.getDb().prepare('SELECT COUNT(*) AS n FROM sessions').get(),
      ).toEqual({ n: 1 });
      again.connectionManager.close();
    });

    it('a transient error that clears within the retries opens the original normally', () => {
      buildCurrentVersionDb(dbPath);
      let calls = 0;
      const sleeps: number[] = [];
      const opened = launch({
        retry: noWait(sleeps),
        initialize: (path, timeout) => {
          if (path === dbPath && (calls += 1) === 1) {
            throw sqliteError('SQLITE_BUSY');
          }
          return initializeConnection(path, timeout);
        },
      });
      expect(opened.storageMode).toBe('normal');
      expect(opened.legacyRetired).toBe(false);
      expect(sleeps).toEqual([7]);
      expect(backupFiles(userData)).toHaveLength(0);
      expect(sessionCount(dbPath)).toBe(1);
      opened.connectionManager.close();
    });

    it('a database from a newer app version (higher user_version) is not retired: fresh-file fallback, original untouched', () => {
      buildCurrentVersionDb(dbPath, LATEST_SCHEMA_VERSION + 1);
      const before = sha(dbPath);
      const opened = launch();
      expect(opened.storageMode).toBe('fresh-file');
      expect(opened.activePath).toBe(join(userData, 'clarityokr-fresh.db'));
      expect(opened.legacyRetired).toBe(false);
      expect(backupFiles(userData)).toHaveLength(0);
      expect(existsSync(backupsDir())).toBe(false);
      expect(new LegacyDatabaseNotice(userData).shouldShow()).toBe(false);
      expect(getSchemaVersion(opened.connectionManager.getDb())).toBe(LATEST_SCHEMA_VERSION);
      opened.connectionManager.close();
      expect(sha(dbPath)).toBe(before);
      const original = new BetterSqlite3(dbPath, { readonly: true });
      expect(original.pragma('user_version', { simple: true })).toBe(LATEST_SCHEMA_VERSION + 1);
      original.close();
      expect(sessionCount(dbPath)).toBe(1);
    });

    it.each([
      'SQLITE_IOERR',
      'SQLITE_IOERR_READ',
      'SQLITE_CANTOPEN',
      'SQLITE_PERM',
      'SQLITE_READONLY',
      'SQLITE_BUSY',
      'SQLITE_LOCKED',
    ])(
      '%s while opening: retried 3 times, never moves the file, falls back to fresh-file',
      (code) => {
        buildCurrentVersionDb(dbPath);
        const before = sha(dbPath);
        let calls = 0;
        const sleeps: number[] = [];
        const opened = launch({
          retry: noWait(sleeps),
          initialize: (path, timeout) => {
            if (path === dbPath) {
              calls += 1;
              throw sqliteError(code);
            }
            return initializeConnection(path, timeout);
          },
        });
        expect(calls).toBe(3);
        expect(sleeps).toEqual([7, 7]);
        expect(opened.storageMode).toBe('fresh-file');
        expect(opened.legacyRetired).toBe(false);
        expect(backupFiles(userData)).toHaveLength(0);
        expect(new LegacyDatabaseNotice(userData).shouldShow()).toBe(false);
        opened.connectionManager.close();
        expect(sha(dbPath)).toBe(before);
      },
    );

    it('a file that cannot be read for lack of permission is not moved (real chmod 000)', () => {
      buildCurrentVersionDb(dbPath);
      const before = sha(dbPath);
      chmodSync(dbPath, 0o000);
      let opened;
      try {
        opened = launch({ retry: noWait([]) });
      } finally {
        chmodSync(dbPath, 0o600);
      }
      expect(opened.storageMode).toBe('fresh-file');
      expect(opened.legacyRetired).toBe(false);
      expect(backupFiles(userData)).toHaveLength(0);
      opened.connectionManager.close();
      expect(sha(dbPath)).toBe(before);
    });

    it.each(['SQLITE_CORRUPT', 'SQLITE_CORRUPT_INDEX', 'SQLITE_NOTADB'])(
      '%s while opening is positive evidence: the file is moved aside and a fresh database created',
      (code) => {
        buildCurrentVersionDb(dbPath);
        let calls = 0;
        const opened = launch({
          retry: noWait([]),
          initialize: (path, timeout) => {
            if (path === dbPath && (calls += 1) === 1) {
              throw sqliteError(code);
            }
            return initializeConnection(path, timeout);
          },
        });
        expect(calls).toBe(2); // corruption is final: no retry, one fresh open after moving aside
        expect(opened.storageMode).toBe('normal');
        expect(opened.legacyRetired).toBe(true);
        expect(backupFiles(userData)).toHaveLength(1);
        expect(sessionCount(dbPath)).toBe(0);
        opened.connectionManager.close();
      },
    );
  });

  describe('storage mode: memory', () => {
    it('both the normal and the fresh file fail: runs in memory, original untouched, still usable', async () => {
      buildCurrentVersionDb(dbPath, LATEST_SCHEMA_VERSION + 1);
      const before = sha(dbPath);
      // a directory where the fresh database file should be makes opening it fail for real
      mkdirSync(join(userData, 'clarityokr-fresh.db'));
      const opened = launch({ retry: { attempts: 2, delayMs: 0, sleep: () => undefined } });
      expect(opened.storageMode).toBe('memory');
      expect(opened.activePath).toBe(':memory:');
      expect(opened.legacyRetired).toBe(false);
      const repo = new OkrStoreRepository(new OkrStore(opened.connectionManager.getDb()));
      await repo.save({
        id: 'm1',
        objective: 'In memory',
        keyResults: [{ id: 'k1', statement: 'x' }],
        sourceSessionId: 's',
        generatedAt: '2026-10-12T00:00:00.000Z',
        lastEditedAt: null,
        regenerationPolicy: 'overwrite',
        manualEdits: [],
      });
      expect((await repo.loadLatest())?.objective).toBe('In memory');
      opened.connectionManager.close();
      expect(sha(dbPath)).toBe(before);
      expect(backupFiles(userData)).toHaveLength(0);
    });

    it('reports storageMode "normal" on a healthy start', () => {
      const opened = launch();
      expect(opened.storageMode).toBe('normal');
      opened.connectionManager.close();
    });
  });

  describe('WAL side files of a retired database', () => {
    /** A legacy database whose rows and tables live only in an uncheckpointed -wal file. */
    function buildLegacyDbWithLiveWal(path: string): void {
      const staging = `${path}.staging`;
      buildOldVersionDb(staging); // closes cleanly (checkpointed)
      const db = new BetterSqlite3(staging);
      db.pragma('journal_mode = WAL');
      db.pragma('wal_autocheckpoint = 0');
      db.prepare(
        "INSERT INTO okr_documents VALUES ('wal-only', 'In the WAL', '[]', 's', 'x', NULL, 'overwrite', '[]')",
      ).run();
      copyFileSync(staging, path);
      copyFileSync(`${staging}-wal`, `${path}-wal`);
      db.close();
      rmSync(staging, { force: true });
      rmSync(`${staging}-wal`, { force: true });
      rmSync(`${staging}-shm`, { force: true });
    }

    it('moves the -wal along with the database; the new database is reopened clean and empty', () => {
      buildLegacyDbWithLiveWal(dbPath);
      expect(existsSync(`${dbPath}-wal`)).toBe(true);

      const opened = launch();
      expect(opened.storageMode).toBe('normal');
      expect(opened.legacyRetired).toBe(true);
      opened.connectionManager.close();

      const names = readdirSync(backupsDir()).sort();
      expect(names).toContain('clarityokr-20261012-083015.db.bak');
      expect(names).toContain('clarityokr-20261012-083015.db.bak-wal');

      // the retired copy still has the WAL-only row
      const old = new BetterSqlite3(join(backupsDir(), 'clarityokr-20261012-083015.db.bak'));
      expect(
        old.prepare("SELECT objective FROM okr_documents WHERE id = 'wal-only'").get(),
      ).toEqual({
        objective: 'In the WAL',
      });
      old.close();

      // reopen the new database: nothing leaked in from the old WAL
      const reopened = launch();
      expect(reopened.legacyRetired).toBe(false);
      const db = reopened.connectionManager.getDb();
      expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
      expect(tableNames(dbPath)).not.toContain('okr_documents');
      expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 0 });
      expect(db.prepare('SELECT COUNT(*) AS n FROM objectives').get()).toEqual({ n: 0 });
      reopened.connectionManager.close();
    });

    it('when the -wal can be neither moved nor copied nor deleted, the normal path is not reused', () => {
      buildOldVersionDb(dbPath);
      writeFileSync(`${dbPath}-wal`, 'stale wal bytes');
      const stuck = (path: string): boolean => path.endsWith('-wal');
      const ops: LegacyFileOps = {
        renameSync: (from, to) => {
          if (stuck(from)) throw Object.assign(new Error('busy'), { code: 'EBUSY' });
          copyFileSync(from, to);
          rmSync(from);
        },
        copyFileSync: (from, to) => {
          if (stuck(from)) throw Object.assign(new Error('busy'), { code: 'EBUSY' });
          copyFileSync(from, to);
        },
        unlinkSync: (path) => {
          if (stuck(path)) throw Object.assign(new Error('busy'), { code: 'EPERM' });
          rmSync(path);
        },
      };
      const opened = launch({ fileOps: ops });
      expect(opened.storageMode).toBe('fresh-file');
      expect(opened.activePath).toBe(join(userData, 'clarityokr-fresh.db'));
      // the main file was backed up, so the user is told; the stuck -wal is left where it is
      expect(opened.legacyRetired).toBe(true);
      expect(new LegacyDatabaseNotice(userData).shouldShow()).toBe(true);
      expect(backupFiles(userData)).toHaveLength(1);
      expect(existsSync(dbPath)).toBe(false);
      expect(existsSync(`${dbPath}-wal`)).toBe(true);
      // nothing was created at the normal path, so the stale -wal cannot be replayed
      expect(getSchemaVersion(opened.connectionManager.getDb())).toBe(LATEST_SCHEMA_VERSION);
      expect(
        opened.connectionManager.getDb().prepare('SELECT COUNT(*) AS n FROM sessions').get(),
      ).toEqual({ n: 0 });
      opened.connectionManager.close();
      expect(existsSync(dbPath)).toBe(false);
    });
  });

  describe('API key store is unaffected by retiring the database', () => {
    it('the encrypted config in a temp config dir is unchanged and still readable after a legacy retirement', () => {
      const home = mkdtempSync(join(tmpdir(), 'okr-home-'));
      const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
      process.env.HOME = home;
      process.env.USERPROFILE = home;
      try {
        const provider = new FallbackKeyProvider();
        const secret = {
          apiKey: 'synthetic-key-for-test',
          baseUrl: 'http://127.0.0.1:1',
          model: 'm',
        };
        new LlmConfigStore(provider).store(secret);
        const configFile = join(home, '.clarityokr', 'llm-config.enc');
        const before = readFileSync(configFile);

        buildOldVersionDb(dbPath);
        const opened = launch();
        expect(opened.legacyRetired).toBe(true);
        opened.connectionManager.close();

        expect(readFileSync(configFile).equals(before)).toBe(true);
        expect(new LlmConfigStore(new FallbackKeyProvider()).retrieve()).toEqual(secret);
        // the key never lives in, or moves with, the userData directory or the backups
        expect(readdirSync(userData)).not.toContain('llm-config.enc');
        expect(readdirSync(backupsDir()).some((f) => f.includes('llm-config'))).toBe(false);
      } finally {
        for (const [key, value] of Object.entries(saved)) {
          if (value === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = value;
          }
        }
        rmSync(home, { recursive: true, force: true });
      }
    });
  });

  describe('database location', () => {
    it('opens inside the given userData directory and nowhere else', () => {
      const opened = launch();
      expect(opened.activePath).toBe(join(userData, 'clarityokr.db'));
      expect(existsSync(join(userData, 'clarityokr.db'))).toBe(true);
      opened.connectionManager.close();
    });

    it('creates the userData directory when it does not exist yet', () => {
      const nested = join(userData, 'not', 'yet', 'there');
      const path = resolveDbPath({ e2eTest: false, userDataDir: nested });
      mkdirSync(join(userData, 'unused'), { recursive: true });
      const opened = openDatabaseSafely({
        dbPath: path,
        backupsDir: join(nested, 'backups'),
        notice: new LegacyDatabaseNotice(nested),
      });
      expect(existsSync(path)).toBe(true);
      opened.connectionManager.close();
    });
  });
});
