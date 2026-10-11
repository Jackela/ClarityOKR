import BetterSqlite3 from 'better-sqlite3';
import type { Database } from 'better-sqlite3';
import { OkrStore, applySchema } from '../../../../app/main/src/persistence/okr-store/index.js';
import { loadExportSource } from '../../../../app/main/src/startup/closed-loop.js';

export const FIXED_EXPORT_TIME = new Date(Date.UTC(2026, 9, 11, 12, 0, 0));

/**
 * One deterministic OKR used for the sample comparison: a period, a metric, a status-only
 * change, a revert, a removed key result, and a review frozen before later edits.
 */
export function buildSampleOkr(): { db: Database; store: OkrStore; okrId: string } {
  const db = new BetterSqlite3(':memory:');
  applySchema(db);
  let now = new Date('2026-10-01T08:00:00.000Z');
  const store = new OkrStore(db, () => now);
  const at = (iso: string): void => {
    now = new Date(iso);
  };

  store.createObjective({
    id: 'okr-1',
    title: 'Ship the "closed loop" / v2',
    period: '2026-Q4',
    keyResults: [
      { id: 'kr-1', statement: 'Release 3 times per week', successMetric: 'releases per week' },
      { id: 'kr-2', statement: 'Cut escaped defects below 5%' },
      { id: 'kr-3', statement: 'Retire the old importer\nkeep the data', successMetric: '' },
    ],
  });
  at('2026-10-02T09:00:00.000Z');
  store.setProgress('kr-1', { value: 40, status: 'in_progress' });
  at('2026-10-03T09:00:00.000Z');
  store.setProgress('kr-1', { value: 100, status: 'done' });
  at('2026-10-04T09:00:00.000Z');
  store.revertLastProgress('kr-1');
  at('2026-10-05T09:00:00.000Z');
  store.setProgress('kr-1', { value: 40, status: 'at_risk' });
  at('2026-10-06T09:00:00.000Z');
  store.setProgress('kr-3', { value: 30, status: 'in_progress' });
  at('2026-10-07T09:00:00.000Z');
  store.markKeyResultRemoved('kr-3');
  at('2026-10-08T09:00:00.000Z');
  store.saveReview('okr-1', {
    wentWell: 'Shipped the progress UI.',
    fellShort: '',
    nextSteps: 'Plan the next quarter.',
  });
  // Later edits must not change the frozen snapshot.
  at('2026-10-09T09:00:00.000Z');
  store.setProgress('kr-2', { value: 20, status: 'in_progress' });
  store.pinObjective('okr-1');
  return { db, store, okrId: 'okr-1' };
}

export { loadExportSource };
