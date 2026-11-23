import type { Database } from 'better-sqlite3';

import {
  ValidationError,
  isKrStatus,
  isPeriod,
  isValidProgress,
  type KeyResultRecord,
  type KrStatus,
  type NewObjectiveInput,
  type ObjectiveWithKeyResults,
  type Period,
  type ProgressEntryRecord,
  type ReviewRecord,
} from '@clarityokr/contracts';

import { insertImportedObjectives } from './okr-store-import.js';
import { readReview, writeReview } from './okr-store-review.js';
import {
  computeOverallProgress,
  toKeyResult,
  toObjective,
  toProgressEntry,
  type KeyResultRow,
  type ObjectiveRow,
  type ProgressEntryRow,
} from './okr-store-rows.js';
import type {
  ImportObjectiveInput,
  KrProgressSummary,
  ObjectiveSummary,
  ReviewInput,
  SetProgressInput,
  SyncObjectiveInput,
} from './okr-store-types.js';
import { insertNewObjective, upsertSyncedObjective } from './okr-store-writes.js';

// Split into okr-store-*.ts (#164); these re-exports keep the original import paths working.
export { computeOverallProgress, normalizeSuccessMetric } from './okr-store-rows.js';
export type {
  ImportObjectiveInput,
  KrProgressSummary,
  ObjectiveSummary,
  ReviewInput,
  SetProgressInput,
  SyncObjectiveInput,
} from './okr-store-types.js';

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
    const id = insertNewObjective(this.db, input, () => this.timestamp());
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
    const existed = upsertSyncedObjective(this.db, input, () => this.timestamp());
    if (!existed) {
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
      // #53: the revert and the new set share one timestamp, which is how the progress history
      // tells 「修改这次」 apart from a revert followed later by a new update.
      const at = this.timestamp();
      this.appendRevert(kr, at);
      this.insertEntry(krId, 'set', input.value, input.status, null, at);
      this.applyState(kr, input.value, input.status);
    })();
    return this.requireKeyResult(krId);
  }

  private appendRevert(kr: KeyResultRecord, at?: string): void {
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
    this.insertEntry(kr.id, 'revert', restoredValue, restoredStatus, last.id, at);
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
    writeReview(this.db, objectiveId, objective, input, () => this.timestamp());
    return this.getReview(objectiveId) as ReviewRecord;
  }

  getReview(objectiveId: string): ReviewRecord | null {
    return readReview(this.db, objectiveId);
  }

  /**
   * Writes imported OKRs (#49) as new rows in ONE transaction: every OKR or none. Ids are new;
   * key result / progress entry / snapshot references are remapped. Timestamps come from the
   * file. An OKR keeps `pinned` only while no other OKR is pinned. Returns the new ids in order.
   */
  importObjectives(items: ReadonlyArray<{ input: ImportObjectiveInput; title: string }>): string[] {
    return insertImportedObjectives(this.db, items);
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
    at: string = this.timestamp(),
  ): void {
    this.db
      .prepare(
        `INSERT INTO progress_entries (kr_id, kind, value, status, reverts_entry_id, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(krId, kind, value, status, revertsEntryId, at);
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
