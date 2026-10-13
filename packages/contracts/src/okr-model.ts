/**
 * Closed-loop OKR data model (schema v2).
 *
 * Shared by the main process (persistence, IPC validation) and the renderer
 * (form validation) so both sides agree on limits and text counting.
 */

export const KR_STATUSES = ['not_started', 'in_progress', 'at_risk', 'done'] as const;
export type KrStatus = (typeof KR_STATUSES)[number];

export const PROGRESS_ENTRY_KINDS = ['set', 'revert'] as const;
export type ProgressEntryKind = (typeof PROGRESS_ENTRY_KINDS)[number];

/** Quarter such as `2026-Q4`. */
export type Period = `${number}-Q${1 | 2 | 3 | 4}`;

export const TEXT_LIMITS = {
  objective: 200,
  keyResult: 200,
  successMetric: 200,
  reviewSection: 2000,
} as const;

/** A single user-perceived character may not exceed this many UTF-16 code units. */
export const MAX_CLUSTER_UTF16_UNITS = 32;

const PERIOD_PATTERN = /^\d{4}-Q[1-4]$/;

export function isPeriod(value: unknown): value is Period {
  return typeof value === 'string' && PERIOD_PATTERN.test(value);
}

export function isKrStatus(value: unknown): value is KrStatus {
  return typeof value === 'string' && (KR_STATUSES as readonly string[]).includes(value);
}

export function isValidProgress(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Counts user-perceived characters (an emoji or a combining sequence counts as one). */
export function countGraphemes(text: string): number {
  let count = 0;
  for (const _segment of segmenter.segment(text)) {
    void _segment;
    count += 1;
  }
  return count;
}

/**
 * Display helper (not a limit): the first `max` user-perceived characters plus 「…」 when the
 * text is longer. Emoji and combining sequences are never split.
 */
export function truncateGraphemes(text: string, max: number): string {
  const kept: string[] = [];
  for (const { segment } of segmenter.segment(text)) {
    if (kept.length === max) return `${kept.join('')}…`;
    kept.push(segment);
  }
  return text;
}

export type TextCheck = { ok: true } | { ok: false; reason: 'too_long' | 'cluster_too_long' };

/**
 * Validates text against a grapheme limit. Never truncates: callers must
 * surface the failure to the user.
 */
export function checkText(text: string, maxGraphemes: number): TextCheck {
  let count = 0;
  for (const { segment } of segmenter.segment(text)) {
    if (segment.length > MAX_CLUSTER_UTF16_UNITS) {
      return { ok: false, reason: 'cluster_too_long' };
    }
    count += 1;
    if (count > maxGraphemes) {
      return { ok: false, reason: 'too_long' };
    }
  }
  return { ok: true };
}

export interface KeyResultRecord {
  id: string;
  objectiveId: string;
  position: number;
  statement: string;
  successMetric: string | null;
  /** Latest progress, or null when never set / cleared. */
  progress: number | null;
  status: KrStatus;
  removedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ObjectiveRecord {
  id: string;
  title: string;
  period: Period | null;
  pinned: boolean;
  sourceSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ObjectiveWithKeyResults extends ObjectiveRecord {
  keyResults: KeyResultRecord[];
  /** Rounded average of non-removed KRs that have a progress value; null if none. */
  overallProgress: number | null;
}

export interface ProgressEntryRecord {
  id: number;
  krId: string;
  kind: ProgressEntryKind;
  /** Resulting progress after this entry. */
  value: number | null;
  /** Resulting status after this entry. */
  status: KrStatus;
  /** For `revert` entries: the entry that was undone. */
  revertsEntryId: number | null;
  recordedAt: string;
}

export interface ReviewKrSnapshot {
  krId: string;
  statement: string;
  successMetric: string | null;
  progress: number | null;
  status: KrStatus;
  removed: boolean;
}

export interface ReviewRecord {
  objectiveId: string;
  wentWell: string;
  fellShort: string;
  nextSteps: string;
  snapshot: ReviewKrSnapshot[];
  /** When the review text was last saved. */
  savedAt: string;
  /** When the key result snapshot was frozen (first save); never changes afterwards. */
  snapshotAt: string;
}

export interface NewKeyResultInput {
  id?: string;
  statement: string;
  successMetric?: string | null;
}

export interface NewObjectiveInput {
  id?: string;
  title: string;
  period?: Period | null;
  sourceSessionId?: string | null;
  keyResults: NewKeyResultInput[];
}
