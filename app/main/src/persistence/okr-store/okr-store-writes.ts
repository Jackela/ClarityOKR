/** Objective create / sync write paths of the OKR store (split from okr-store.ts, #164). */

import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';

import {
  TEXT_LIMITS,
  ValidationError,
  isPeriod,
  type NewObjectiveInput,
} from '@clarityokr/contracts';

import {
  assertTextWithinLimit,
  normalizeSuccessMetric,
  requireText,
  type KeyResultRow,
  type ObjectiveRow,
} from './okr-store-rows.js';
import type { SyncObjectiveInput } from './okr-store-types.js';

/**
 * Body of `OkrStore.createObjective` before the read-back: validates and inserts the objective
 * with its key results in one transaction. Returns the new objective id.
 */
export function insertNewObjective(
  db: Database,
  input: NewObjectiveInput,
  timestamp: () => string,
): string {
  requireText('Objective', input.title, TEXT_LIMITS.objective);
  if (input.period !== undefined && input.period !== null && !isPeriod(input.period)) {
    throw new ValidationError('Period must look like 2026-Q4');
  }
  if (input.keyResults.length === 0) {
    throw new ValidationError('An objective needs at least one key result');
  }
  for (const kr of input.keyResults) {
    requireText('Key result', kr.statement, TEXT_LIMITS.keyResult);
    const metric = normalizeSuccessMetric(kr.successMetric);
    if (metric !== null) {
      assertTextWithinLimit('Success metric', metric, TEXT_LIMITS.successMetric);
    }
  }

  const id = input.id ?? randomUUID();
  const at = timestamp();
  const create = db.transaction(() => {
    db.prepare(
      `INSERT INTO objectives (id, title, period, pinned, source_session_id, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?, ?)`,
    ).run(id, input.title, input.period ?? null, input.sourceSessionId ?? null, at, at);
    const insertKr = db.prepare(
      `INSERT INTO key_results
       (id, objective_id, position, statement, success_metric, progress, status, removed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, 'not_started', NULL, ?, ?)`,
    );
    input.keyResults.forEach((kr, index) => {
      insertKr.run(
        kr.id ?? randomUUID(),
        id,
        index,
        kr.statement,
        normalizeSuccessMetric(kr.successMetric),
        at,
        at,
      );
    });
  });
  create();
  return id;
}

/**
 * Body of `OkrStore.syncObjective` before the pin and read-back: validates, then creates or
 * updates the objective and reconciles its key results in one transaction. Returns whether the
 * objective already existed.
 */
export function upsertSyncedObjective(
  db: Database,
  input: SyncObjectiveInput,
  timestamp: () => string,
): boolean {
  if (input.title.trim().length === 0) {
    throw new ValidationError('Objective must not be empty');
  }
  if (input.period !== undefined && input.period !== null && !isPeriod(input.period)) {
    throw new ValidationError('Period must look like 2026-Q4');
  }
  for (const kr of input.keyResults) {
    if (kr.statement.trim().length === 0) {
      throw new ValidationError('Key result must not be empty');
    }
  }
  const ids = new Set(input.keyResults.map((kr) => kr.id));
  if (ids.size !== input.keyResults.length) {
    throw new ValidationError('Key result ids must be unique');
  }

  const at = timestamp();
  const existing = db.prepare('SELECT * FROM objectives WHERE id = ?').get(input.id) as
    ObjectiveRow | undefined;
  db.transaction(() => {
    if (existing) {
      db.prepare('UPDATE objectives SET title = ?, updated_at = ? WHERE id = ?').run(
        input.title,
        at,
        input.id,
      );
      if (input.period !== undefined) {
        db.prepare('UPDATE objectives SET period = ? WHERE id = ?').run(input.period, input.id);
      }
    } else {
      db.prepare(
        `INSERT INTO objectives (id, title, period, pinned, source_session_id, created_at, updated_at)
         VALUES (?, ?, ?, 0, ?, ?, ?)`,
      ).run(
        input.id,
        input.title,
        input.period ?? null,
        input.sourceSessionId ?? null,
        input.createdAt ?? at,
        at,
      );
    }

    const rows = db
      .prepare('SELECT * FROM key_results WHERE objective_id = ?')
      .all(input.id) as KeyResultRow[];
    const known = new Map(rows.map((row) => [row.id, row]));
    const update = db.prepare(
      `UPDATE key_results SET position = ?, statement = ?, success_metric = ?, removed_at = NULL, updated_at = ?
     WHERE id = ?`,
    );
    const insert = db.prepare(
      `INSERT INTO key_results
       (id, objective_id, position, statement, success_metric, progress, status, removed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, 'not_started', NULL, ?, ?)`,
    );
    input.keyResults.forEach((kr, index) => {
      if (known.has(kr.id)) {
        update.run(index, kr.statement, normalizeSuccessMetric(kr.successMetric), at, kr.id);
      } else {
        insert.run(
          kr.id,
          input.id,
          index,
          kr.statement,
          normalizeSuccessMetric(kr.successMetric),
          at,
          at,
        );
      }
    });
    for (const row of rows) {
      if (!ids.has(row.id) && row.removed_at === null) {
        db.prepare('UPDATE key_results SET removed_at = ?, updated_at = ? WHERE id = ?').run(
          at,
          at,
          row.id,
        );
      }
    }
  })();
  return existing !== undefined;
}
