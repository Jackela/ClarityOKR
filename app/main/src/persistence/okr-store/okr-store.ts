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
  snapshot_at: string;
}

export interface SetProgressInput {
  /** Integer 0-100, or null to clear the value. */
  value: number | null;
  status: KrStatus;
}

export interface SyncObjectiveInput {
  id: string;
  title: string;
  period?: Period | null;
  sourceSessionId?: string | null;
  createdAt?: string;
  keyResults: Array<{ id: string; statement: string; successMetric?: string | null }>;
}

export interface ObjectiveSummary {
  id: string;
  title: string;
  period: Period | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  overallProgress: number | null;
  /** Key results that are not removed. */
  keyResultCount: number;
  filledKeyResultCount: number;
  /** Every non-removed key result has status `done` (and there is at least one). */
  allDone: boolean;
  reviewed: boolean;
}

export interface KrProgressSummary {
  latest: ProgressEntryRecord | null;
  /** Value and status before the latest entry; null when there is no entry. */
  before: { value: number | null; status: KrStatus } | null;
  /** True when the latest entry is a `set` (a `revert` cannot be reverted again). */
  canRevert: boolean;
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

/** Empty or whitespace-only text means "no value" and is stored as NULL; real text is kept as typed. */
export function normalizeSuccessMetric(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim().length === 0) {
    return null;
  }
  return value;
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
      const metric = normalizeSuccessMetric(kr.successMetric);
      if (metric !== null) {
        assertTextWithinLimit('Success metric', metric, TEXT_LIMITS.successMetric);
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
          normalizeSuccessMetric(kr.successMetric),
          at,
          at,
        );
      });
    });
    create();
    return this.requireObjective(id);
  }

  /**
   * Creates or updates an objective and reconciles its key results by id.
   *
   * - key results present in the input keep their progress and status; their text
   *   and metric are replaced and a previously removed one is restored
   * - ids not present in the existing objective are inserted as new, unset rows
   * - existing key results missing from the input are marked removed (history kept)
   *
   * Only emptiness is checked here: text limits are enforced where user input
   * enters (IPC), because generated text is stored as-is.
   */
  syncObjective(input: SyncObjectiveInput): ObjectiveWithKeyResults {
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

    const at = this.timestamp();
    const existing = this.db.prepare('SELECT * FROM objectives WHERE id = ?').get(input.id) as
      ObjectiveRow | undefined;
    this.db.transaction(() => {
      if (existing) {
        this.db
          .prepare('UPDATE objectives SET title = ?, updated_at = ? WHERE id = ?')
          .run(input.title, at, input.id);
        if (input.period !== undefined) {
          this.db
            .prepare('UPDATE objectives SET period = ? WHERE id = ?')
            .run(input.period, input.id);
        }
      } else {
        this.db
          .prepare(
            `INSERT INTO objectives (id, title, period, pinned, source_session_id, created_at, updated_at)
             VALUES (?, ?, ?, 0, ?, ?, ?)`,
          )
          .run(
            input.id,
            input.title,
            input.period ?? null,
            input.sourceSessionId ?? null,
            input.createdAt ?? at,
            at,
          );
      }

      const rows = this.db
        .prepare('SELECT * FROM key_results WHERE objective_id = ?')
        .all(input.id) as KeyResultRow[];
      const known = new Map(rows.map((row) => [row.id, row]));
      const update = this.db.prepare(
        `UPDATE key_results SET position = ?, statement = ?, success_metric = ?, removed_at = NULL, updated_at = ?
         WHERE id = ?`,
      );
      const insert = this.db.prepare(
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
          this.db
            .prepare('UPDATE key_results SET removed_at = ?, updated_at = ? WHERE id = ?')
            .run(at, at, row.id);
        }
      }
    })();
    if (!existing) {
      this.pinObjective(input.id);
    }
    return this.requireObjective(input.id);
  }

  /** The pinned objective, or else the most recently updated one. */
  getCurrentObjective(): ObjectiveWithKeyResults | null {
    return this.getPinnedObjective() ?? this.listObjectives()[0] ?? null;
  }

  /** Objectives created from a clarification session, most recently updated first. */
  listObjectivesBySession(sessionId: string): ObjectiveWithKeyResults[] {
    const rows = this.db
      .prepare(
        'SELECT id FROM objectives WHERE source_session_id = ? ORDER BY updated_at DESC, id ASC',
      )
      .all(sessionId) as Array<{ id: string }>;
    return rows.map((row) => this.requireObjective(row.id));
  }

  /** Deletes every objective with its key results, entries and reviews (test reset). */
  deleteAllObjectives(): void {
    this.db.prepare('DELETE FROM objectives').run();
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
    if (kr.removedAt !== null) {
      throw new ValidationError('Cannot revert progress of a removed key result');
    }
    this.db.transaction(() => {
      this.appendRevert(kr);
    })();
    return this.requireKeyResult(krId);
  }

  /**
   * "Edit this one": reverts the latest progress entry and writes the corrected value as a
   * new entry, both in one transaction. If the new write is rejected or fails, the revert is
   * rolled back too and the key result is unchanged. Nothing is deleted.
   */
  replaceLastProgress(krId: string, input: SetProgressInput): KeyResultRecord {
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
      this.appendRevert(kr);
      this.insertEntry(krId, 'set', input.value, input.status, null);
      this.applyState(kr, input.value, input.status);
    })();
    return this.requireKeyResult(krId);
  }

  private appendRevert(kr: KeyResultRecord): void {
    const latest = this.db
      .prepare('SELECT * FROM progress_entries WHERE kr_id = ? ORDER BY id DESC LIMIT 2')
      .all(kr.id) as ProgressEntryRow[];
    const last = latest[0];
    if (!last || last.kind === 'revert') {
      throw new ValidationError('Nothing to revert');
    }
    const previous = latest[1];
    const restoredValue = previous ? previous.value : null;
    const restoredStatus = previous ? (previous.status as KrStatus) : 'not_started';
    this.insertEntry(kr.id, 'revert', restoredValue, restoredStatus, last.id);
    this.applyState(kr, restoredValue, restoredStatus);
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
    const at = this.timestamp();
    this.db.transaction(() => {
      this.db
        .prepare('UPDATE key_results SET removed_at = ?, updated_at = ? WHERE id = ?')
        .run(at, at, krId);
      // Removing a key result is an edit of its objective.
      this.db.prepare('UPDATE objectives SET updated_at = ? WHERE id = ?').run(at, kr.objectiveId);
    })();
  }

  /**
   * Saves the objective's review (one per objective). At least one section must have
   * text. The first save freezes every key result as it is right now; later saves only
   * replace the three texts and `savedAt`, so the snapshot never drifts.
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
    const save = this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO reviews (objective_id, went_well, fell_short, next_steps, snapshot, saved_at, snapshot_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (objective_id) DO UPDATE SET
             went_well = excluded.went_well,
             fell_short = excluded.fell_short,
             next_steps = excluded.next_steps,
             saved_at = excluded.saved_at`,
        )
        .run(
          objectiveId,
          input.wentWell,
          input.fellShort,
          input.nextSteps,
          JSON.stringify(snapshot),
          savedAt,
          savedAt,
        );
      this.db
        .prepare('UPDATE objectives SET updated_at = ? WHERE id = ?')
        .run(savedAt, objectiveId);
    });
    save();
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
      snapshotAt: row.snapshot_at,
    };
  }

  /** True when any objective or saved review exists (used for the in-memory quit/restart rule). */
  hasAnyData(): boolean {
    const row = this.db
      .prepare(`SELECT (SELECT COUNT(*) FROM objectives) + (SELECT COUNT(*) FROM reviews) AS n`)
      .get() as { n: number };
    return row.n > 0;
  }

  /** History list: every objective, most recently updated first, with the fields the list shows. */
  listObjectiveSummaries(): ObjectiveSummary[] {
    const reviewed = new Set(
      (
        this.db.prepare('SELECT objective_id AS id FROM reviews').all() as Array<{ id: string }>
      ).map((row) => row.id),
    );
    return this.listObjectives().map((objective) => {
      const active = objective.keyResults.filter((kr) => kr.removedAt === null);
      return {
        id: objective.id,
        title: objective.title,
        period: objective.period,
        pinned: objective.pinned,
        createdAt: objective.createdAt,
        updatedAt: objective.updatedAt,
        overallProgress: objective.overallProgress,
        keyResultCount: active.length,
        filledKeyResultCount: active.filter((kr) => kr.progress !== null).length,
        allDone: active.length > 0 && active.every((kr) => kr.status === 'done'),
        reviewed: reviewed.has(objective.id),
      };
    });
  }

  /**
   * What the "latest update" row needs: the newest entry, the state before it, and
   * whether it can be reverted or edited (only when the newest entry is a `set`).
   */
  getProgressSummary(krId: string): KrProgressSummary {
    this.requireKeyResult(krId);
    const entries = this.db
      .prepare('SELECT * FROM progress_entries WHERE kr_id = ? ORDER BY id DESC LIMIT 2')
      .all(krId) as ProgressEntryRow[];
    const latest = entries[0];
    if (!latest) {
      return { latest: null, before: null, canRevert: false };
    }
    const previous = entries[1];
    return {
      latest: toProgressEntry(latest),
      before: previous
        ? { value: previous.value, status: previous.status as KrStatus }
        : { value: null, status: 'not_started' },
      canRevert: latest.kind === 'set',
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

  /** Public lookup that returns null instead of throwing. */
  findKeyResult(id: string): KeyResultRecord | null {
    const row = this.db.prepare('SELECT * FROM key_results WHERE id = ?').get(id) as
      KeyResultRow | undefined;
    return row ? toKeyResult(row) : null;
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
