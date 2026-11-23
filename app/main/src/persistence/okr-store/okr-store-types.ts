/** Input and summary types of the OKR store (split from okr-store.ts, #164). */

import type {
  KrStatus,
  Period,
  ProgressEntryRecord,
  ReviewKrSnapshot,
} from '@clarityokr/contracts';

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

/** A validated single-OKR export (see `ExportJsonDocument`), written as a new OKR by `importObjective`. */
export interface ImportObjectiveInput {
  objective: {
    title: string;
    period: string | null;
    pinned: boolean;
    createdAt: string;
    updatedAt: string;
  };
  keyResults: ReadonlyArray<{
    id: string;
    statement: string;
    successMetric: string | null;
    progress: number | null;
    status: KrStatus;
    removedAt: string | null;
  }>;
  progressEntries: ReadonlyArray<{
    id: number;
    krId: string;
    kind: 'set' | 'revert';
    value: number | null;
    status: KrStatus;
    revertsEntryId: number | null;
    recordedAt: string;
  }>;
  review: null | {
    wentWell: string;
    fellShort: string;
    nextSteps: string;
    snapshot: ReadonlyArray<ReviewKrSnapshot>;
    savedAt: string;
    snapshotAt: string;
  };
}

export interface ReviewInput {
  wentWell: string;
  fellShort: string;
  nextSteps: string;
}
