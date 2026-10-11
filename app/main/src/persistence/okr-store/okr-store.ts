import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';

import {
  TEXT_LIMITS,
  ValidationError,
  checkText,
  isKrStatus,
  isPeriod,
  isValidProgress,
  type KeyResultRecord,
  type KrStatus,
  type NewObjectiveInput,
  type ObjectiveRecord,
  type ObjectiveWithKeyResults,
  type Period,
  type ProgressEntryRecord,
  type ReviewKrSnapshot,
  type ReviewRecord,
} from '@clarityokr/contracts';

interface ObjectiveRow {
  id: string;
  title: string;
  period: string | null;
  pinned: number;
  source_session_id: string | null;
  created_at: string;
  updated_at: string;
}

interface KeyResultRow {
  id: string;
  objective_id: string;
  position: number;
  statement: string;
  success_metric: string | null;
  progress: number | null;
  status: string;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ProgressEntryRow {
  id: number;
  kr_id: string;
  kind: string;
  value: number | null;
  status: string;
  reverts_entry_id: number | null;
  recorded_at: string;
}

interface ReviewRow {
  objective_id: string;
  went_well: string;
  fell_short: string;
  next_steps: string;
  snapshot: string;
  saved_at: string;
}

export interface SetProgressInput {
  /** Integer 0-100, or null to clear the value. */
  value: number | null;
  status: KrStatus;
}

export interface ReviewInput {
  wentWell: string;
  fellShort: string;
  nextSteps: string;
}

function toObjective(row: ObjectiveRow): ObjectiveRecord {
  return {
    id: row.id,
    title: row.title,
    period: row.period as Period | null,
    pinned: row.pinned === 1,
    sourceSessionId: row.source_session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toKeyResult(row: KeyResultRow): KeyResultRecord {
  return {
    id: row.id,
    objectiveId: row.objective_id,
    position: row.position,
    statement: row.statement,
    successMetric: row.success_metric,
    progress: row.progress,
    status: row.status as KrStatus,
    removedAt: row.removed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toProgressEntry(row: ProgressEntryRow): ProgressEntryRecord {
  return {
    id: row.id,
    krId: row.kr_id,
    kind: row.kind as ProgressEntryRecord['kind'],
    value: row.value,
    status: row.status as KrStatus,
    revertsEntryId: row.reverts_entry_id,
    recordedAt: row.recorded_at,
  };
}

function requireText(label: string, text: string, max: number): void {
  if (text.trim().length === 0) {
    throw new ValidationError(`${label} must not be empty`);
  }
  assertTextWithinLimit(label, text, max);
}

function assertTextWithinLimit(label: string, text: string, max: number): void {
  const check = checkText(text, max);
  if (!check.ok) {
    throw new ValidationError(
      check.reason === 'too_long'
        ? `${label} exceeds ${max} characters`
        : `${label} contains an over-long character sequence`,
    );
  }
}

/** Rounded average of non-removed KRs that have a progress value; null when none do. */
export function computeOverallProgress(keyResults: readonly KeyResultRecord[]): number | null {
  const values = keyResults
    .filter((kr) => kr.removedAt === null && kr.progress !== null)
    .map((kr) => kr.progress as number);
  if (values.length === 0) {
    return null;
  }
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/**
 * Repository for the closed-loop OKR model (objectives, key results, append-only
 * progress entries and reviews). Every multi-row change runs in one transaction.
 */
export class OkrStore {
  constructor(
    private readonly db: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private timestamp(): string {
    return this.now().toISOString();
  }

  createObjective(input: NewObjectiveInput): ObjectiveWithKeyResults {
    requireText('Objective', input.title, TEXT_LIMITS.objective);
    if (input.period !== undefined && input.period !== null && !isPeriod(input.period)) {
      throw new ValidationError('Period must look like 2026-Q4');
    }
    if (input.keyResults.length === 0) {
      throw new ValidationError('An objective needs at least one key result');
    }
    for (const kr of input.keyResults) {
      requireText('Key result', kr.statement, TEXT_LIMITS.keyResult);
      if (kr.successMetric) {
        assertTextWithinLimit('Success metric', kr.successMetric, TEXT_LIMITS.successMetric);
      }
    }

    const id = input.id ?? randomUUID();
    const at = this.timestamp();
    const create = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO objectives (id, title, period, pinned, source_session_id, created_at, updated_at)
           VALUES (?, ?, ?, 0, ?, ?, ?)`,
        )
        .run(id, input.title, input.period ?? null, input.sourceSessionId ?? null, at, at);
      const insertKr = this.db.prepare(
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
          kr.successMetric ?? null,
          at,
          at,
        );
      });
    });
    create();
    return this.requireObjective(id);
  }

  getObjective(id: string): ObjectiveWithKeyResults | null {
    const row = this.db.prepare('SELECT * FROM objectives WHERE id = ?').get(id) as
      ObjectiveRow | undefined;
    if (!row) {
      return null;
    }
    const keyResults = (
      this.db
        .prepare('SELECT * FROM key_results WHERE objective_id = ? ORDER BY position ASC')
        .all(id) as KeyResultRow[]
    ).map(toKeyResult);
    return { ...toObjective(row), keyResults, overallProgress: computeOverallProgress(keyResults) };
  }

  /** All objectives, most recently updated first. */
  listObjectives(): ObjectiveWithKeyResults[] {
    const rows = this.db
      .prepare('SELECT id FROM objectives ORDER BY updated_at DESC, id ASC')
      .all() as Array<{ id: string }>;
    return rows.map((row) => this.requireObjective(row.id));
  }

  getPinnedObjective(): ObjectiveWithKeyResults | null {
    const row = this.db.prepare('SELECT id FROM objectives WHERE pinned = 1').get() as
      { id: string } | undefined;
    return row ? this.requireObjective(row.id) : null;
  }

  /** Makes this objective the single pinned one; the previous pin is cleared in the same transaction. */
  pinObjective(id: string): void {
    this.requireObjective(id);
    const pin = this.db.transaction(() => {
      this.db.prepare('UPDATE objectives SET pinned = 0 WHERE pinned = 1 AND id != ?').run(id);
      this.db.prepare('UPDATE objectives SET pinned = 1 WHERE id = ?').run(id);
    });
    pin();
  }

  setPeriod(id: string, period: Period | null): void {
    this.requireObjective(id);
    if (period !== null && !isPeriod(period)) {
      throw new ValidationError('Period must look like 2026-Q4');
    }
    this.db
      .prepare('UPDATE objectives SET period = ?, updated_at = ? WHERE id = ?')
      .run(period, this.timestamp(), id);
  }

  /** Appends a `set` entry and updates the key result's current value in one transaction. */
  setProgress(krId: string, input: SetProgressInput): KeyResultRecord {
    if (input.value !== null && !isValidProgress(input.value)) {
      throw new ValidationError('Progress must be an integer between 0 and 100');
    }
    if (!isKrStatus(input.status)) {
      throw new ValidationError('Unknown status');
    }
    const kr = this.requireKeyResult(krId);
    if (kr.removedAt !== null) {
      throw new ValidationError('Cannot update progress of a removed key result');
    }
    this.db.transaction(() => {
      this.insertEntry(krId, 'set', input.value, input.status, null);
      this.applyState(kr, input.value, input.status);
    })();
    return this.requireKeyResult(krId);
  }

  /**
   * Undoes the most recent progress entry of a key result by appending a `revert`
   * entry that restores the previous value and status. Nothing is deleted. The
   * latest entry cannot be reverted when it already is a revert.
   */
  revertLastProgress(krId: string): KeyResultRecord {
    const kr = this.requireKeyResult(krId);
    const latest = this.db
      .prepare('SELECT * FROM progress_entries WHERE kr_id = ? ORDER BY id DESC LIMIT 2')
      .all(krId) as ProgressEntryRow[];
    const last = latest[0];
    if (!last || last.kind === 'revert') {
      throw new ValidationError('Nothing to revert');
    }
    const previous = latest[1];
    const restoredValue = previous ? previous.value : null;
    const restoredStatus = previous ? (previous.status as KrStatus) : 'not_started';
    this.db.transaction(() => {
      this.insertEntry(krId, 'revert', restoredValue, restoredStatus, last.id);
      this.applyState(kr, restoredValue, restoredStatus);
    })();
    return this.requireKeyResult(krId);
  }

  listProgressEntries(krId: string): ProgressEntryRecord[] {
    return (
      this.db
        .prepare('SELECT * FROM progress_entries WHERE kr_id = ? ORDER BY id ASC')
        .all(krId) as ProgressEntryRow[]
    ).map(toProgressEntry);
  }

  /** Marks a key result as removed. Its progress history is kept. */
  markKeyResultRemoved(krId: string): void {
    const kr = this.requireKeyResult(krId);
    if (kr.removedAt !== null) {
      return;
    }
    this.db
      .prepare('UPDATE key_results SET removed_at = ?, updated_at = ? WHERE id = ?')
      .run(this.timestamp(), this.timestamp(), krId);
  }

  /**
   * Saves (or replaces) the objective's review. At least one section must have
   * text. The snapshot freezes every key result as it is right now.
   */
  saveReview(objectiveId: string, input: ReviewInput): ReviewRecord {
    const objective = this.requireObjective(objectiveId);
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
    const savedAt = this.timestamp();
    this.db
      .prepare(
        `INSERT INTO reviews (objective_id, went_well, fell_short, next_steps, snapshot, saved_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (objective_id) DO UPDATE SET
           went_well = excluded.went_well,
           fell_short = excluded.fell_short,
           next_steps = excluded.next_steps,
           snapshot = excluded.snapshot,
           saved_at = excluded.saved_at`,
      )
      .run(
        objectiveId,
        input.wentWell,
        input.fellShort,
        input.nextSteps,
        JSON.stringify(snapshot),
        savedAt,
      );
    return this.getReview(objectiveId) as ReviewRecord;
  }

  getReview(objectiveId: string): ReviewRecord | null {
    const row = this.db.prepare('SELECT * FROM reviews WHERE objective_id = ?').get(objectiveId) as
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
    };
  }

  private insertEntry(
    krId: string,
    kind: 'set' | 'revert',
    value: number | null,
    status: KrStatus,
    revertsEntryId: number | null,
  ): void {
    this.db
      .prepare(
        `INSERT INTO progress_entries (kr_id, kind, value, status, reverts_entry_id, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(krId, kind, value, status, revertsEntryId, this.timestamp());
  }

  private applyState(kr: KeyResultRecord, value: number | null, status: KrStatus): void {
    const at = this.timestamp();
    this.db
      .prepare('UPDATE key_results SET progress = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(value, status, at, kr.id);
    this.db.prepare('UPDATE objectives SET updated_at = ? WHERE id = ?').run(at, kr.objectiveId);
  }

  private requireObjective(id: string): ObjectiveWithKeyResults {
    const objective = this.getObjective(id);
    if (!objective) {
      throw new ValidationError(`Objective not found: ${id}`);
    }
    return objective;
  }

  private requireKeyResult(id: string): KeyResultRecord {
    const row = this.db.prepare('SELECT * FROM key_results WHERE id = ?').get(id) as
      KeyResultRow | undefined;
    if (!row) {
      throw new ValidationError(`Key result not found: ${id}`);
    }
    return toKeyResult(row);
  }
}
