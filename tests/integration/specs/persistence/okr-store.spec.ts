import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type { Database } from 'better-sqlite3';
import { ValidationError } from '@clarityokr/contracts';
import {
  LATEST_SCHEMA_VERSION,
  OkrStore,
  SchemaVersionError,
  applySchema,
  getSchemaVersion,
  retireLegacyDatabase,
} from '../../../../app/main/src/persistence/okr-store/index.js';

function openDb(path = ':memory:'): Database {
  const db = new BetterSqlite3(path);
  applySchema(db);
  return db;
}

describe('okr-store schema', () => {
  it('creates the latest version and is idempotent', () => {
    const db = openDb();
    expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(applySchema(db)).toBe(LATEST_SCHEMA_VERSION);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toEqual(
      expect.arrayContaining([
        'objectives',
        'key_results',
        'progress_entries',
        'reviews',
        'sessions',
        'action_logs',
      ]),
    );
    db.close();
  });

  it('turns foreign keys on', () => {
    const db = openDb();
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(() =>
      db
        .prepare(
          `INSERT INTO key_results (id, objective_id, position, statement, created_at, updated_at)
           VALUES ('k', 'missing', 0, 's', 'x', 'x')`,
        )
        .run(),
    ).toThrow(/FOREIGN KEY/);
    db.close();
  });

  it('refuses a database from a newer app version', () => {
    const db = new BetterSqlite3(':memory:');
    db.pragma(`user_version = ${LATEST_SCHEMA_VERSION + 1}`);
    expect(() => applySchema(db)).toThrow(SchemaVersionError);
    db.close();
  });
});

describe('OkrStore', () => {
  let db: Database;
  let store: OkrStore;
  let clock: number;

  beforeEach(() => {
    db = openDb();
    clock = Date.UTC(2026, 9, 11, 0, 0, 0);
    store = new OkrStore(db, () => new Date((clock += 1000)));
  });

  afterEach(() => db.close());

  const create = (title = 'Ship the closed loop') =>
    store.createObjective({
      title,
      period: '2026-Q4',
      keyResults: [
        { statement: 'Write progress UI', successMetric: '100% of screens' },
        { statement: 'Add review view' },
      ],
    });

  it('creates an objective with ordered key results, unset progress and not_started status', () => {
    const okr = create();
    expect(okr.period).toBe('2026-Q4');
    expect(okr.keyResults.map((k) => k.position)).toEqual([0, 1]);
    expect(okr.keyResults.every((k) => k.progress === null && k.status === 'not_started')).toBe(
      true,
    );
    expect(okr.overallProgress).toBeNull();
    expect(store.getObjective(okr.id)).toEqual(okr);
  });

  it('rejects invalid objectives', () => {
    expect(() => store.createObjective({ title: ' ', keyResults: [{ statement: 'x' }] })).toThrow(
      ValidationError,
    );
    expect(() => store.createObjective({ title: 'x', keyResults: [] })).toThrow(ValidationError);
    expect(() =>
      store.createObjective({ title: 'a'.repeat(201), keyResults: [{ statement: 'x' }] }),
    ).toThrow(/200/);
    expect(() =>
      store.createObjective({
        title: 'x',
        period: '2026-Q9' as never,
        keyResults: [{ statement: 'x' }],
      }),
    ).toThrow(/Period/);
  });

  it('persists across reopening the database file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'okr-store-'));
    try {
      const file = join(dir, 'a.db');
      const first = openDb(file);
      const okr = new OkrStore(first).createObjective({
        title: 'Keep me',
        keyResults: [{ statement: 'k' }],
      });
      new OkrStore(first).setProgress(okr.keyResults[0]!.id, { value: 40, status: 'in_progress' });
      first.close();
      const second = openDb(file);
      const loaded = new OkrStore(second).getObjective(okr.id);
      expect(loaded?.keyResults[0]).toMatchObject({ progress: 40, status: 'in_progress' });
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  describe('progress', () => {
    it('stores value and status together and updates the overall average of filled KRs only', () => {
      const okr = create();
      const [a, b] = okr.keyResults;
      store.setProgress(a!.id, { value: 60, status: 'in_progress' });
      expect(store.getObjective(okr.id)?.overallProgress).toBe(60);
      store.setProgress(b!.id, { value: 25, status: 'at_risk' });
      expect(store.getObjective(okr.id)?.overallProgress).toBe(43);
    });

    it.each([-1, 101, 1.5, Number.NaN])('rejects progress %p and writes nothing', (value) => {
      const okr = create();
      const kr = okr.keyResults[0]!;
      expect(() => store.setProgress(kr.id, { value, status: 'in_progress' })).toThrow(
        ValidationError,
      );
      expect(store.listProgressEntries(kr.id)).toHaveLength(0);
      expect(store.getObjective(okr.id)?.keyResults[0]?.progress).toBeNull();
    });

    it('rejects an unknown status', () => {
      const okr = create();
      expect(() =>
        store.setProgress(okr.keyResults[0]!.id, { value: 1, status: 'unset' as never }),
      ).toThrow(ValidationError);
    });

    it('keeps the entry log and the current value consistent in one transaction', () => {
      const okr = create();
      const kr = okr.keyResults[0]!;
      // Force the second write inside the transaction to fail.
      db.exec(
        `CREATE TRIGGER fail_update BEFORE UPDATE ON key_results BEGIN SELECT RAISE(ABORT, 'boom'); END;`,
      );
      expect(() => store.setProgress(kr.id, { value: 10, status: 'in_progress' })).toThrow();
      expect(store.listProgressEntries(kr.id)).toHaveLength(0);
      db.exec('DROP TRIGGER fail_update');
      store.setProgress(kr.id, { value: 10, status: 'in_progress' });
      const entries = store.listProgressEntries(kr.id);
      expect(entries).toHaveLength(1);
      expect(store.getObjective(okr.id)?.keyResults[0]).toMatchObject({
        progress: entries[0]!.value,
        status: entries[0]!.status,
      });
    });

    it('allows clearing the value and records it as an entry', () => {
      const okr = create();
      const kr = okr.keyResults[0]!;
      store.setProgress(kr.id, { value: 30, status: 'in_progress' });
      store.setProgress(kr.id, { value: null, status: 'in_progress' });
      expect(store.getObjective(okr.id)?.keyResults[0]?.progress).toBeNull();
      expect(store.listProgressEntries(kr.id)).toHaveLength(2);
    });

    it('allows a status-only change by repeating the previous value, as its own entry', () => {
      const okr = create();
      const kr = okr.keyResults[0]!;
      store.setProgress(kr.id, { value: 70, status: 'in_progress' });
      store.setProgress(kr.id, { value: 70, status: 'at_risk' });
      expect(store.listProgressEntries(kr.id).map((e) => e.status)).toEqual([
        'in_progress',
        'at_risk',
      ]);
    });
  });

  describe('revert', () => {
    it('restores both value and status of the previous entry and appends instead of deleting', () => {
      const okr = create();
      const kr = okr.keyResults[0]!;
      store.setProgress(kr.id, { value: 71, status: 'at_risk' });
      store.setProgress(kr.id, { value: 100, status: 'done' });
      const reverted = store.revertLastProgress(kr.id);
      expect(reverted).toMatchObject({ progress: 71, status: 'at_risk' });
      const entries = store.listProgressEntries(kr.id);
      expect(entries.map((e) => e.kind)).toEqual(['set', 'set', 'revert']);
      expect(entries[2]).toMatchObject({
        value: 71,
        status: 'at_risk',
        revertsEntryId: entries[1]!.id,
      });
    });

    it('reverting the first entry returns to unset / not_started', () => {
      const okr = create();
      const kr = okr.keyResults[0]!;
      store.setProgress(kr.id, { value: 20, status: 'in_progress' });
      expect(store.revertLastProgress(kr.id)).toMatchObject({
        progress: null,
        status: 'not_started',
      });
    });

    it('cannot revert when there is no entry or the latest entry is already a revert', () => {
      const okr = create();
      const kr = okr.keyResults[0]!;
      expect(() => store.revertLastProgress(kr.id)).toThrow(/Nothing to revert/);
      store.setProgress(kr.id, { value: 20, status: 'in_progress' });
      store.revertLastProgress(kr.id);
      expect(() => store.revertLastProgress(kr.id)).toThrow(/Nothing to revert/);
    });

    it('a new write after a revert becomes revertible again', () => {
      const okr = create();
      const kr = okr.keyResults[0]!;
      store.setProgress(kr.id, { value: 20, status: 'in_progress' });
      store.revertLastProgress(kr.id);
      store.setProgress(kr.id, { value: 50, status: 'in_progress' });
      expect(store.revertLastProgress(kr.id)).toMatchObject({
        progress: null,
        status: 'not_started',
      });
    });

    it('is tracked per key result', () => {
      const okr = create();
      const [a, b] = okr.keyResults;
      store.setProgress(a!.id, { value: 10, status: 'in_progress' });
      store.setProgress(b!.id, { value: 90, status: 'in_progress' });
      store.revertLastProgress(a!.id);
      expect(store.getObjective(okr.id)?.keyResults[1]?.progress).toBe(90);
    });
  });

  describe('removed key results', () => {
    it('keeps history, is excluded from the overall progress and cannot be updated', () => {
      const okr = create();
      const [a, b] = okr.keyResults;
      store.setProgress(a!.id, { value: 100, status: 'done' });
      store.setProgress(b!.id, { value: 0, status: 'in_progress' });
      store.markKeyResultRemoved(b!.id);
      const loaded = store.getObjective(okr.id)!;
      expect(loaded.overallProgress).toBe(100);
      expect(loaded.keyResults[1]?.removedAt).not.toBeNull();
      expect(store.listProgressEntries(b!.id)).toHaveLength(1);
      expect(() => store.setProgress(b!.id, { value: 5, status: 'in_progress' })).toThrow(
        ValidationError,
      );
    });
  });

  describe('pinning', () => {
    it('keeps exactly one pinned objective and switches atomically', () => {
      const first = create('one');
      const second = create('two');
      store.pinObjective(first.id);
      expect(store.getPinnedObjective()?.id).toBe(first.id);
      store.pinObjective(second.id);
      expect(store.getPinnedObjective()?.id).toBe(second.id);
      const pinned = db.prepare('SELECT COUNT(*) AS n FROM objectives WHERE pinned = 1').get() as {
        n: number;
      };
      expect(pinned.n).toBe(1);
    });

    it('the database itself refuses two pinned rows', () => {
      const first = create('one');
      const second = create('two');
      db.prepare('UPDATE objectives SET pinned = 1 WHERE id = ?').run(first.id);
      expect(() =>
        db.prepare('UPDATE objectives SET pinned = 1 WHERE id = ?').run(second.id),
      ).toThrow(/UNIQUE/);
    });
  });

  describe('history list', () => {
    it('lists every objective, most recently updated first, and can reopen an old one', () => {
      const old = create('old');
      const recent = create('recent');
      expect(store.listObjectives().map((o) => o.id)).toEqual([recent.id, old.id]);
      store.setProgress(old.keyResults[0]!.id, { value: 5, status: 'in_progress' });
      expect(store.listObjectives().map((o) => o.id)).toEqual([old.id, recent.id]);
      store.pinObjective(old.id);
      expect(store.getPinnedObjective()?.id).toBe(old.id);
    });
  });

  describe('reviews', () => {
    it('requires at least one non-empty section', () => {
      const okr = create();
      expect(() =>
        store.saveReview(okr.id, { wentWell: ' ', fellShort: '', nextSteps: '' }),
      ).toThrow(/at least one/);
    });

    it('enforces the 2000 character limit per section', () => {
      const okr = create();
      expect(() =>
        store.saveReview(okr.id, { wentWell: 'a'.repeat(2001), fellShort: '', nextSteps: '' }),
      ).toThrow(/2000/);
      expect(
        store.saveReview(okr.id, { wentWell: 'a'.repeat(2000), fellShort: '', nextSteps: '' })
          .wentWell,
      ).toHaveLength(2000);
    });

    it('freezes text, metric, progress and status of every key result at save time', () => {
      const okr = create();
      const [a, b] = okr.keyResults;
      store.setProgress(a!.id, { value: 80, status: 'in_progress' });
      store.markKeyResultRemoved(b!.id);
      const saved = store.saveReview(okr.id, {
        wentWell: 'good',
        fellShort: '',
        nextSteps: 'more',
      });
      expect(saved.snapshot).toEqual([
        {
          krId: a!.id,
          statement: 'Write progress UI',
          successMetric: '100% of screens',
          progress: 80,
          status: 'in_progress',
          removed: false,
        },
        {
          krId: b!.id,
          statement: 'Add review view',
          successMetric: null,
          progress: null,
          status: 'not_started',
          removed: true,
        },
      ]);
      // Later changes do not touch the stored snapshot.
      store.setProgress(a!.id, { value: 100, status: 'done' });
      expect(store.getReview(okr.id)?.snapshot[0]?.progress).toBe(80);
    });

    it('can be edited again and keeps a single review per objective', () => {
      const okr = create();
      store.saveReview(okr.id, { wentWell: 'v1', fellShort: '', nextSteps: '' });
      store.saveReview(okr.id, { wentWell: 'v2', fellShort: 'x', nextSteps: '' });
      expect(store.getReview(okr.id)).toMatchObject({ wentWell: 'v2', fellShort: 'x' });
      const rows = db.prepare('SELECT COUNT(*) AS n FROM reviews').get() as { n: number };
      expect(rows.n).toBe(1);
    });
  });
});

describe('retireLegacyDatabase', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'okr-legacy-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('does nothing when there is no database', () => {
    expect(retireLegacyDatabase(join(dir, 'clarityokr.db'), join(dir, 'backups'))).toBeNull();
  });

  it('renames an unversioned database to backups/clarityokr-<timestamp>.db.bak without reading its data', () => {
    const file = join(dir, 'clarityokr.db');
    const legacy = new BetterSqlite3(file);
    legacy.exec(
      "CREATE TABLE okr_documents (id TEXT PRIMARY KEY); INSERT INTO okr_documents VALUES ('old');",
    );
    legacy.close();

    const moved = retireLegacyDatabase(file, join(dir, 'backups'), new Date(2026, 9, 11, 13, 5, 9));
    expect(moved).toBe(join(dir, 'backups', 'clarityokr-20261011-130509.db.bak'));
    expect(existsSync(file)).toBe(false);
    expect(existsSync(moved as string)).toBe(true);

    // A fresh database can now be created at the original path with the new schema.
    const fresh = openDb(file);
    expect(getSchemaVersion(fresh)).toBe(LATEST_SCHEMA_VERSION);
    fresh.close();
  });

  it('leaves a versioned database alone', () => {
    const file = join(dir, 'clarityokr.db');
    openDb(file).close();
    expect(retireLegacyDatabase(file, join(dir, 'backups'))).toBeNull();
    expect(existsSync(file)).toBe(true);
  });

  it('leaves an empty file alone', () => {
    const file = join(dir, 'clarityokr.db');
    writeFileSync(file, '');
    expect(retireLegacyDatabase(file, join(dir, 'backups'))).toBeNull();
  });
});
