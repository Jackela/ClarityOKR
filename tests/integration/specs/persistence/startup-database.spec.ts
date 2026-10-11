import {
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
import { openDatabaseSafely } from '../../../../app/main/src/startup/open-database.js';
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
      expect(opened.degraded).toBeNull();
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

    it('is absent on a normal first install and the reply never contains a path', () => {
      const opened = launch();
      expect(opened.legacyRetired).toBe(false);
      const ipc = fakeIpc();
      registerLegacyNoticeHandlers(ipc.ipcMain, new LegacyDatabaseNotice(userData));
      expect(ipc.call(IPC_CHANNELS.LEGACY_NOTICE_GET)).toEqual({ legacyDatabaseRetired: false });
      expect(existsSync(join(userData, LEGACY_NOTICE_FILE_NAME))).toBe(false);
      opened.connectionManager.close();

      buildOldVersionDb(join(userData, 'other.db'));
      const raw = JSON.stringify(new LegacyDatabaseNotice(userData).shouldShow());
      expect(raw).not.toMatch(/bak|backups/);
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
      expect(opened.degraded).toBeNull();
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
      expect(opened.degraded).toBeNull();
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
        expect(opened.degraded).toBeNull();
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
      expect(opened.degraded).toBeNull();
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
      expect(opened.degraded).toBeNull();
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
      expect(opened.degraded).toBeNull();
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
      expect(opened.degraded).toBe('fallback-path');
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
      expect(opened.degraded).toBe('fallback-path');
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

    it('a locked WAL side file does not stop the main file from being retired', () => {
      buildOldVersionDb(dbPath);
      writeFileSync(`${dbPath}-wal`, 'stale');
      const ops: LegacyFileOps = {
        ...realOps,
        renameSync: (from, to) => {
          if (from.endsWith('-wal')) {
            throw Object.assign(new Error('busy'), { code: 'EBUSY' });
          }
          realOps.renameSync(from, to);
        },
        copyFileSync: (from, to) => {
          if (from.endsWith('-wal')) {
            throw Object.assign(new Error('busy'), { code: 'EBUSY' });
          }
          copyFileSync(from, to);
        },
      };
      const moved = retireLegacyDatabase(dbPath, backupsDir(), new Date(2026, 9, 12), ops);
      expect(moved).toContain('.db.bak');
      expect(existsSync(dbPath)).toBe(false);
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
