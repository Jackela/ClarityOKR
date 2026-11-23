/** Import write path of the OKR store (#49) (split from okr-store.ts, #164). */

import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';

import { ValidationError, type ReviewKrSnapshot } from '@clarityokr/contracts';

import { normalizeSuccessMetric } from './okr-store-rows.js';
import type { ImportObjectiveInput } from './okr-store-types.js';

/** Body of `OkrStore.importObjectives`: see that method for the contract. */
export function insertImportedObjectives(
  db: Database,
  items: ReadonlyArray<{ input: ImportObjectiveInput; title: string }>,
): string[] {
  const insertObjective = db.prepare(
    `INSERT INTO objectives (id, title, period, pinned, source_session_id, created_at, updated_at)
   VALUES (?, ?, ?, ?, NULL, ?, ?)`,
  );
  const insertKr = db.prepare(
    `INSERT INTO key_results
     (id, objective_id, position, statement, success_metric, progress, status, removed_at, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertEntry = db.prepare(
    `INSERT INTO progress_entries (kr_id, kind, value, status, reverts_entry_id, recorded_at)
   VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertReview = db.prepare(
    `INSERT INTO reviews (objective_id, went_well, fell_short, next_steps, snapshot, saved_at, snapshot_at)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const hasPinned = db.prepare('SELECT 1 FROM objectives WHERE pinned = 1 LIMIT 1');

  const run = db.transaction((): string[] =>
    items.map(({ input, title }) => {
      const { objective } = input;
      const id = randomUUID();
      const pinned = objective.pinned && hasPinned.get() === undefined ? 1 : 0;
      insertObjective.run(
        id,
        title,
        objective.period,
        pinned,
        objective.createdAt,
        objective.updatedAt,
      );
      const krIds = new Map<string, string>();
      input.keyResults.forEach((kr, position) => {
        const krId = randomUUID();
        krIds.set(kr.id, krId);
        insertKr.run(
          krId,
          id,
          position,
          kr.statement,
          normalizeSuccessMetric(kr.successMetric),
          kr.progress,
          kr.status,
          kr.removedAt,
          objective.createdAt,
          kr.removedAt ?? objective.updatedAt,
        );
      });
      const mapKr = (old: string): string => {
        const mapped = krIds.get(old);
        if (mapped === undefined) throw new ValidationError('Unknown key result reference');
        return mapped;
      };
      const entryIds = new Map<number, number>();
      [...input.progressEntries]
        .sort((a, b) => a.id - b.id)
        .forEach((entry) => {
          const reverts = entry.revertsEntryId === null ? null : entryIds.get(entry.revertsEntryId);
          if (reverts === undefined) throw new ValidationError('Unknown progress entry reference');
          const result = insertEntry.run(
            mapKr(entry.krId),
            entry.kind,
            entry.value,
            entry.status,
            reverts,
            entry.recordedAt,
          );
          entryIds.set(entry.id, Number(result.lastInsertRowid));
        });
      const review = input.review;
      if (review !== null) {
        // Field by field: nothing from the file beyond the known keys is stored.
        const snapshot: ReviewKrSnapshot[] = review.snapshot.map((item) => ({
          krId: mapKr(item.krId),
          statement: item.statement,
          successMetric: item.successMetric,
          progress: item.progress,
          status: item.status,
          removed: item.removed,
        }));
        insertReview.run(
          id,
          review.wentWell,
          review.fellShort,
          review.nextSteps,
          JSON.stringify(snapshot),
          review.savedAt,
          review.snapshotAt,
        );
      }
      return id;
    }),
  );
  return run();
}
