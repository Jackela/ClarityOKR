/** Review write / read path of the OKR store (split from okr-store.ts, #164). */

import type { Database } from 'better-sqlite3';

import {
  TEXT_LIMITS,
  ValidationError,
  type ObjectiveWithKeyResults,
  type ReviewKrSnapshot,
  type ReviewRecord,
} from '@clarityokr/contracts';

import { assertTextWithinLimit, type ReviewRow } from './okr-store-rows.js';
import type { ReviewInput } from './okr-store-types.js';

/** Body of `OkrStore.saveReview` after the objective lookup: see that method for the contract. */
export function writeReview(
  db: Database,
  objectiveId: string,
  objective: ObjectiveWithKeyResults,
  input: ReviewInput,
  timestamp: () => string,
): void {
  const sections: Array<[string, string]> = [
    ['What went well', input.wentWell],
    ['What fell short', input.fellShort],
    ['Next steps', input.nextSteps],
  ];
  if (sections.every(([, text]) => text.trim().length === 0)) {
    throw new ValidationError('A review needs at least one non-empty section');
  }
  for (const [label, text] of sections) {
    assertTextWithinLimit(label, text, TEXT_LIMITS.reviewSection);
  }
  const snapshot: ReviewKrSnapshot[] = objective.keyResults.map((kr) => ({
    krId: kr.id,
    statement: kr.statement,
    successMetric: kr.successMetric,
    progress: kr.progress,
    status: kr.status,
    removed: kr.removedAt !== null,
  }));
  const savedAt = timestamp();
  const save = db.transaction(() => {
    db.prepare(
      `INSERT INTO reviews (objective_id, went_well, fell_short, next_steps, snapshot, saved_at, snapshot_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (objective_id) DO UPDATE SET
         went_well = excluded.went_well,
         fell_short = excluded.fell_short,
         next_steps = excluded.next_steps,
         saved_at = excluded.saved_at`,
    ).run(
      objectiveId,
      input.wentWell,
      input.fellShort,
      input.nextSteps,
      JSON.stringify(snapshot),
      savedAt,
      savedAt,
    );
    db.prepare('UPDATE objectives SET updated_at = ? WHERE id = ?').run(savedAt, objectiveId);
  });
  save();
}

/** Body of `OkrStore.getReview`. */
export function readReview(db: Database, objectiveId: string): ReviewRecord | null {
  const row = db.prepare('SELECT * FROM reviews WHERE objective_id = ?').get(objectiveId) as
    ReviewRow | undefined;
  if (!row) {
    return null;
  }
  return {
    objectiveId: row.objective_id,
    wentWell: row.went_well,
    fellShort: row.fell_short,
    nextSteps: row.next_steps,
    snapshot: JSON.parse(row.snapshot) as ReviewKrSnapshot[],
    savedAt: row.saved_at,
    snapshotAt: row.snapshot_at,
  };
}
