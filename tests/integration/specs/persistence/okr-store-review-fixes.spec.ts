import BetterSqlite3 from 'better-sqlite3';
import type { Database } from 'better-sqlite3';
import { ValidationError } from '@clarityokr/contracts';
import {
  OkrStore,
  OkrStoreRepository,
  applySchema,
  normalizeSuccessMetric,
} from '../../../../app/main/src/persistence/okr-store/index.js';

function openDb(): Database {
  const db = new BetterSqlite3(':memory:');
  applySchema(db);
  return db;
}

describe('OkrStore review fixes', () => {
  let db: Database;
  let store: OkrStore;
  let clock: number;

  beforeEach(() => {
    db = openDb();
    clock = Date.UTC(2026, 9, 11, 0, 0, 0);
    store = new OkrStore(db, () => new Date((clock += 1000)));
  });
  afterEach(() => db.close());

  const create = () =>
    store.createObjective({
      title: 'Ship the closed loop',
      period: '2026-Q4',
      keyResults: [{ statement: 'Write progress UI' }, { statement: 'Add review view' }],
    });

  const metricColumn = (krId: string): unknown =>
    (
      db.prepare('SELECT success_metric AS m FROM key_results WHERE id = ?').get(krId) as {
        m: unknown;
      }
    ).m;

  describe('removed key results', () => {
    it('revertLastProgress rejects a removed key result and appends nothing', () => {
      const okr = create();
      const kr = okr.keyResults[0]!;
      store.setProgress(kr.id, { value: 40, status: 'in_progress' });
      store.markKeyResultRemoved(kr.id);
      expect(() => store.revertLastProgress(kr.id)).toThrow(/removed key result/);
      expect(store.listProgressEntries(kr.id)).toHaveLength(1);
    });

    it('replaceLastProgress rejects a removed key result and appends nothing', () => {
      const okr = create();
      const kr = okr.keyResults[0]!;
      store.setProgress(kr.id, { value: 40, status: 'in_progress' });
      store.markKeyResultRemoved(kr.id);
      expect(() => store.replaceLastProgress(kr.id, { value: 60, status: 'in_progress' })).toThrow(
        ValidationError,
      );
      expect(store.listProgressEntries(kr.id)).toHaveLength(1);
    });
  });

  describe('markKeyResultRemoved', () => {
    it('bumps the objective updated_at once, and not again when already removed', () => {
      const okr = create();
      const kr = okr.keyResults[0]!;
      const before = store.getObjective(okr.id)!.updatedAt;
      store.markKeyResultRemoved(kr.id);
      const after = store.getObjective(okr.id)!;
      expect(after.updatedAt > before).toBe(true);
      expect(after.keyResults[0]!.removedAt).not.toBeNull();
      expect(after.keyResults[1]!.removedAt).toBeNull();
      store.markKeyResultRemoved(kr.id);
      expect(store.getObjective(okr.id)!.updatedAt).toBe(after.updatedAt);
    });
  });

  describe('replaceLastProgress (edit the latest value)', () => {
    it('reverts the latest entry and writes the new value, keeping the full history', () => {
      const okr = create();
      const kr = okr.keyResults[0]!;
      store.setProgress(kr.id, { value: 30, status: 'in_progress' });
      store.setProgress(kr.id, { value: 90, status: 'done' });
      const result = store.replaceLastProgress(kr.id, { value: 80, status: 'at_risk' });
      expect(result).toMatchObject({ progress: 80, status: 'at_risk' });
      const entries = store.listProgressEntries(kr.id);
      expect(entries.map((e) => [e.kind, e.value])).toEqual([
        ['set', 30],
        ['set', 90],
        ['revert', 30],
        ['set', 80],
      ]);
    });

    it('rejects when there is nothing to replace, or the latest entry is a revert', () => {
      const okr = create();
      const kr = okr.keyResults[0]!;
      expect(() => store.replaceLastProgress(kr.id, { value: 10, status: 'in_progress' })).toThrow(
        /Nothing to revert/,
      );
      store.setProgress(kr.id, { value: 20, status: 'in_progress' });
      store.revertLastProgress(kr.id);
      expect(() => store.replaceLastProgress(kr.id, { value: 10, status: 'in_progress' })).toThrow(
        /Nothing to revert/,
      );
    });

    it('rejects invalid input before touching anything', () => {
      const okr = create();
      const kr = okr.keyResults[0]!;
      store.setProgress(kr.id, { value: 20, status: 'in_progress' });
      expect(() => store.replaceLastProgress(kr.id, { value: 101, status: 'done' })).toThrow(
        ValidationError,
      );
      expect(store.listProgressEntries(kr.id)).toHaveLength(1);
    });

    it('is atomic: when the new write fails, the revert is rolled back too', () => {
      const okr = create();
      const kr = okr.keyResults[0]!;
      store.setProgress(kr.id, { value: 20, status: 'in_progress' });
      const before = store.getObjective(okr.id);
      const entriesBefore = store.listProgressEntries(kr.id);

      // Make exactly the second insert (the new `set`) fail after the revert was written.
      db.exec(`
        CREATE TRIGGER fail_new_set BEFORE INSERT ON progress_entries
        WHEN NEW.kind = 'set' AND NEW.value = 77
        BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END;
      `);
      expect(() => store.replaceLastProgress(kr.id, { value: 77, status: 'done' })).toThrow(
        /simulated write failure/,
      );

      expect(store.listProgressEntries(kr.id)).toEqual(entriesBefore);
      expect(store.getObjective(okr.id)).toEqual(before);
    });
  });

  describe('objective updated_at', () => {
    const updatedAt = (id: string): string => store.getObjective(id)!.updatedAt;

    it('saveReview bumps the objective updated_at', () => {
      const okr = create();
      const before = updatedAt(okr.id);
      store.saveReview(okr.id, { wentWell: 'Shipped', fellShort: '', nextSteps: '' });
      expect(updatedAt(okr.id) > before).toBe(true);
      const review = store.getReview(okr.id)!;
      expect(updatedAt(okr.id)).toBe(review.savedAt);
    });

    it('a rejected review does not bump updated_at', () => {
      const okr = create();
      const before = updatedAt(okr.id);
      expect(() =>
        store.saveReview(okr.id, { wentWell: '', fellShort: ' ', nextSteps: '' }),
      ).toThrow(ValidationError);
      expect(updatedAt(okr.id)).toBe(before);
    });

    it('setPeriod bumps the objective updated_at', () => {
      const okr = create();
      const before = updatedAt(okr.id);
      store.setPeriod(okr.id, '2027-Q1');
      expect(updatedAt(okr.id) > before).toBe(true);
    });

    it('pinning does not bump the objective updated_at', () => {
      const okr = create();
      const other = store.createObjective({
        title: 'Other',
        keyResults: [{ statement: 'x' }],
      });
      const before = updatedAt(okr.id);
      const otherBefore = updatedAt(other.id);
      store.pinObjective(okr.id);
      store.pinObjective(other.id);
      expect(updatedAt(okr.id)).toBe(before);
      expect(updatedAt(other.id)).toBe(otherBefore);
    });

    it('saving a review moves the objective to the top of the history list', () => {
      const first = create();
      store.createObjective({ title: 'Later', keyResults: [{ statement: 'x' }] });
      expect(store.listObjectives()[0]?.id).not.toBe(first.id);
      store.saveReview(first.id, { wentWell: 'ok', fellShort: '', nextSteps: '' });
      expect(store.listObjectives()[0]?.id).toBe(first.id);
    });
  });

  describe('successMetric normalization', () => {
    it('normalizeSuccessMetric maps empty, whitespace-only, null and undefined to null', () => {
      expect(normalizeSuccessMetric('')).toBeNull();
      expect(normalizeSuccessMetric('   ')).toBeNull();
      expect(normalizeSuccessMetric('\t\n')).toBeNull();
      expect(normalizeSuccessMetric(undefined)).toBeNull();
      expect(normalizeSuccessMetric(null)).toBeNull();
      expect(normalizeSuccessMetric('  p95 < 200ms ')).toBe('  p95 < 200ms ');
    });

    it('createObjective stores NULL for "", whitespace and undefined, and keeps a real value', () => {
      const okr = store.createObjective({
        title: 'Metrics',
        keyResults: [
          { statement: 'empty', successMetric: '' },
          { statement: 'blank', successMetric: '  ' },
          { statement: 'missing' },
          { statement: 'real', successMetric: '99.9% uptime' },
        ],
      });
      expect(okr.keyResults.map((k) => k.successMetric)).toEqual([
        null,
        null,
        null,
        '99.9% uptime',
      ]);
      expect(okr.keyResults.map((k) => metricColumn(k.id))).toEqual([
        null,
        null,
        null,
        '99.9% uptime',
      ]);
    });

    it('syncObjective stores NULL for "", whitespace and undefined (insert and update paths)', () => {
      const input = (metrics: Array<string | undefined>) => ({
        id: 'o1',
        title: 'Sync',
        keyResults: metrics.map((successMetric, i) => ({
          id: `k${i}`,
          statement: `kr ${i}`,
          ...(successMetric === undefined ? {} : { successMetric }),
        })),
      });
      // insert path
      const created = store.syncObjective(input(['', '  ', undefined, 'real']));
      expect(created.keyResults.map((k) => metricColumn(k.id))).toEqual([null, null, null, 'real']);
      // update path: values flip between real and blank
      const updated = store.syncObjective(input(['now real', undefined, '', '   ']));
      expect(updated.keyResults.map((k) => metricColumn(k.id))).toEqual([
        'now real',
        null,
        null,
        null,
      ]);
    });

    it('repository save stores NULL for "", whitespace and undefined, and keeps a real value', async () => {
      const repo = new OkrStoreRepository(store);
      await repo.save({
        id: 'o2',
        objective: 'Repo',
        keyResults: [
          { id: 'a', statement: 'a', successMetric: '' },
          { id: 'b', statement: 'b', successMetric: '   ' },
          { id: 'c', statement: 'c' },
          { id: 'd', statement: 'd', successMetric: 'real' },
        ],
        sourceSessionId: 's',
        generatedAt: '2026-10-11T00:00:00.000Z',
        lastEditedAt: null,
        regenerationPolicy: 'overwrite',
        manualEdits: [],
      });
      expect(['a', 'b', 'c', 'd'].map(metricColumn)).toEqual([null, null, null, 'real']);
    });
  });
});
