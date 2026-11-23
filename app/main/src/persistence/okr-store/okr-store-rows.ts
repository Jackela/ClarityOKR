/** Row shapes, row mappers and text checks shared by the OKR store (split from okr-store.ts, #164). */

import {
  ValidationError,
  checkText,
  type KeyResultRecord,
  type KrStatus,
  type ObjectiveRecord,
  type Period,
  type ProgressEntryRecord,
} from '@clarityokr/contracts';

export interface ObjectiveRow {
  id: string;
  title: string;
  period: string | null;
  pinned: number;
  source_session_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface KeyResultRow {
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

export interface ProgressEntryRow {
  id: number;
  kr_id: string;
  kind: string;
  value: number | null;
  status: string;
  reverts_entry_id: number | null;
  recorded_at: string;
}

export interface ReviewRow {
  objective_id: string;
  went_well: string;
  fell_short: string;
  next_steps: string;
  snapshot: string;
  saved_at: string;
  snapshot_at: string;
}

export function toObjective(row: ObjectiveRow): ObjectiveRecord {
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

export function toKeyResult(row: KeyResultRow): KeyResultRecord {
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

export function toProgressEntry(row: ProgressEntryRow): ProgressEntryRecord {
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

export function requireText(label: string, text: string, max: number): void {
  if (text.trim().length === 0) {
    throw new ValidationError(`${label} must not be empty`);
  }
  assertTextWithinLimit(label, text, max);
}

export function assertTextWithinLimit(label: string, text: string, max: number): void {
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
