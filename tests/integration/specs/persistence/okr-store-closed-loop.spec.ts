import BetterSqlite3 from 'better-sqlite3';
import type { Database } from 'better-sqlite3';
import {
  LATEST_SCHEMA_VERSION,
  OkrStore,
  SCHEMA_MIGRATIONS,
  applySchema,
  getSchemaVersion,
} from '../../../../app/main/src/persistence/okr-store/index.js';

const T0 = '2026-10-11T00:00:00.000Z';
const T1 = '2026-10-11T01:00:00.000Z';
const T2 = '2026-10-11T02:00:00.000Z';
const T3 = '2026-10-11T03:00:00.000Z';

describe('OkrStore additions for the closed-loop IPC (PR-C2)', () => {
  let db: Database;
  let store: OkrStore;
  let now: Date;
  const setNow = (iso: string): void => {
    now = new Date(iso);
  };

  beforeEach(() => {
    db = new BetterSqlite3(':memory:');
    applySchema(db);
    setNow(T0);
    store = new OkrStore(db, () => now);
  });
  afterEach(() => db.close());

  const create = (title = 'Ship it') =>
    store.createObjective({
      title,
      keyResults: [{ statement: 'KR one', successMetric: 'metric' }, { statement: 'KR two' }],
    });

  describe('review snapshot is frozen by the first save only', () => {
    it('re-saving changes the texts and savedAt but never the snapshot or snapshotAt', () => {
      const okr = create();
      const [a] = okr.keyResults;
      store.setProgress(a!.id, { value: 40, status: 'in_progress' });
      setNow(T1);
      const first = store.saveReview(okr.id, { wentWell: 'v1', fellShort: '', nextSteps: '' });
      expect(first.savedAt).toBe(T1);
      expect(first.snapshotAt).toBe(T1);
      expect(first.snapshot[0]).toMatchObject({ progress: 40, status: 'in_progress' });

      // The key result moves on and is even regenerated; then the user edits the text.
      store.setProgress(a!.id, { value: 100, status: 'done' });
      store.syncObjective({
        id: okr.id,
        title: 'Ship it',
        keyResults: [{ id: a!.id, statement: 'KR one, rewritten', successMetric: 'new metric' }],
      });
      setNow(T2);
      const second = store.saveReview(okr.id, { wentWell: 'v2', fellShort: 'x', nextSteps: '' });

      expect(second.wentWell).toBe('v2');
      expect(second.savedAt).toBe(T2);
      expect(second.snapshotAt).toBe(T1);
      expect(second.snapshot).toEqual(first.snapshot);
      expect(second.snapshot[0]).toMatchObject({
        statement: 'KR one',
        successMetric: 'metric',
        progress: 40,
        status: 'in_progress',
      });
    });
  });

  describe('schema migration v1 -> v2 (snapshot_at)', () => {
    it('adds snapshot_at and backfills it from saved_at for existing reviews', () => {
      const old = new BetterSqlite3(':memory:');
      old.pragma('foreign_keys = ON');
      old.exec(SCHEMA_MIGRATIONS[0] as string);
      old.pragma('user_version = 1');
      old
        .prepare(
          `INSERT INTO objectives (id, title, pinned, created_at, updated_at) VALUES ('o', 't', 0, ?, ?)`,
        )
        .run(T0, T0);
      old
        .prepare(
          `INSERT INTO reviews (objective_id, went_well, fell_short, next_steps, snapshot, saved_at)
           VALUES ('o', 'w', '', '', '[]', ?)`,
        )
        .run(T1);

      expect(getSchemaVersion(old)).toBe(1);
      expect(applySchema(old)).toBe(LATEST_SCHEMA_VERSION);
      expect(getSchemaVersion(old)).toBe(2);
      const migrated = new OkrStore(old, () => new Date(T3));
      expect(migrated.getReview('o')).toMatchObject({ savedAt: T1, snapshotAt: T1 });
      old.close();
    });
  });

  describe('hasAnyData', () => {
    it('is false for an empty database and true with an objective', () => {
      expect(store.hasAnyData()).toBe(false);
      create();
      expect(store.hasAnyData()).toBe(true);
      store.deleteAllObjectives();
      expect(store.hasAnyData()).toBe(false);
    });
  });

  describe('listObjectiveSummaries', () => {
    it('orders by updated_at descending (pin does not move an entry) and reports list fields', () => {
      const older = create('Older');
      setNow(T1);
      const newer = create('Newer');
      setNow(T2);
      store.pinObjective(older.id);
      expect(store.listObjectiveSummaries().map((s) => s.title)).toEqual(['Newer', 'Older']);

      setNow(T3);
      const [k1, k2] = older.keyResults;
      store.setProgress(k1!.id, { value: 50, status: 'done' });
      store.setProgress(k2!.id, { value: 100, status: 'done' });
      store.saveReview(older.id, { wentWell: 'ok', fellShort: '', nextSteps: '' });
      setNow('2026-10-11T04:00:00.000Z');
      store.setPeriod(newer.id, '2026-Q4');

      const list = store.listObjectiveSummaries();
      expect(list.map((s) => s.title)).toEqual(['Newer', 'Older']);
      const olderItem = list.find((s) => s.id === older.id)!;
      expect(olderItem).toMatchObject({
        pinned: true,
        overallProgress: 75,
        keyResultCount: 2,
        filledKeyResultCount: 2,
        allDone: true,
        reviewed: true,
        updatedAt: T3,
      });
      const newerItem = list.find((s) => s.id === newer.id)!;
      expect(newerItem).toMatchObject({
        period: '2026-Q4',
        pinned: false,
        overallProgress: null,
        keyResultCount: 2,
        filledKeyResultCount: 0,
        allDone: false,
        reviewed: false,
      });
    });

    it('does not count removed key results', () => {
      const okr = create();
      store.markKeyResultRemoved(okr.keyResults[1]!.id);
      expect(store.listObjectiveSummaries()[0]).toMatchObject({ keyResultCount: 1 });
    });

    it('is empty for an empty database', () => {
      expect(store.listObjectiveSummaries()).toEqual([]);
    });
  });

  describe('getProgressSummary / findKeyResult', () => {
    it('has no latest entry before any update', () => {
      const kr = create().keyResults[0]!;
      expect(store.getProgressSummary(kr.id)).toEqual({
        latest: null,
        before: null,
        canRevert: false,
      });
    });

    it('reports the state before the latest set, and blocks revert-of-revert', () => {
      const kr = create().keyResults[0]!;
      store.setProgress(kr.id, { value: 40, status: 'in_progress' });
      store.setProgress(kr.id, { value: 65, status: 'at_risk' });
      const afterSet = store.getProgressSummary(kr.id);
      expect(afterSet.latest).toMatchObject({ kind: 'set', value: 65, status: 'at_risk' });
      expect(afterSet.before).toEqual({ value: 40, status: 'in_progress' });
      expect(afterSet.canRevert).toBe(true);

      store.revertLastProgress(kr.id);
      const afterRevert = store.getProgressSummary(kr.id);
      expect(afterRevert.latest).toMatchObject({
        kind: 'revert',
        value: 40,
        status: 'in_progress',
      });
      expect(afterRevert.canRevert).toBe(false);
    });

    it('the first entry reports a not-started, empty state before it', () => {
      const kr = create().keyResults[0]!;
      store.setProgress(kr.id, { value: 10, status: 'in_progress' });
      expect(store.getProgressSummary(kr.id).before).toEqual({
        value: null,
        status: 'not_started',
      });
    });

    it('findKeyResult returns null for an unknown id instead of throwing', () => {
      expect(store.findKeyResult('nope')).toBeNull();
      const kr = create().keyResults[0]!;
      expect(store.findKeyResult(kr.id)?.id).toBe(kr.id);
    });
  });
});
