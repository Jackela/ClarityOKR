import type { KrStatus, ProgressEntryRecord } from '@clarityokr/contracts';

/**
 * #53 KR progress history (spec S1§10): turns the raw `progress_entries` of one key result into
 * the rows of the list and the points of the trend line. Pure; no Angular.
 *
 * Rules (AC1, Q10-3 / Q10-4 / Q10-5):
 * - a `revert` entry never becomes a row or a point; the `set` it undid is marked 「已撤回」 and
 *   leaves the trend;
 * - 「修改这次」 is stored as a revert + a new set written together (same timestamp, see
 *   OkrStore.replaceLastProgress). That pair is one record: the corrected value, tagged
 *   「已修改」; the original value is not shown;
 * - effective records = the rows that were not reverted; a cleared value (`null`) is effective
 *   but has no point (the line breaks there, Q10-2); `count` (「共 n 次更新」) counts effective
 *   records only.
 */
export interface HistoryRow {
  id: number;
  recordedAt: string;
  value: number | null;
  status: KrStatus;
  reverted: boolean;
  modified: boolean;
}

export interface ProgressHistory {
  /** Newest first (the list). */
  rows: HistoryRow[];
  /** Effective values, oldest first (the trend; `null` = a gap). */
  points: Array<number | null>;
  /** Number of effective records. */
  count: number;
  /** First / last effective value that is not empty (the summary). */
  first: number | null;
  last: number | null;
}

/**
 * A revert followed by a set within this window is one 「修改这次」. New data shares one timestamp;
 * the window also covers entries written before that (two clock reads in one transaction).
 */
export const REPLACE_WINDOW_MS = 1000;

export function buildProgressHistory(entries: readonly ProgressEntryRecord[]): ProgressHistory {
  const sorted = [...entries].sort((a, b) => a.id - b.id);
  const rows: HistoryRow[] = [];
  const byId = new Map<number, HistoryRow>();
  let nextIsModified = false;

  sorted.forEach((entry, index) => {
    if (entry.kind === 'set') {
      const row: HistoryRow = {
        id: entry.id,
        recordedAt: entry.recordedAt,
        value: entry.value,
        status: entry.status,
        reverted: false,
        modified: nextIsModified,
      };
      nextIsModified = false;
      rows.push(row);
      byId.set(row.id, row);
      return;
    }
    const target = entry.revertsEntryId === null ? undefined : byId.get(entry.revertsEntryId);
    const next = sorted[index + 1];
    if (next?.kind === 'set' && isSameWrite(entry.recordedAt, next.recordedAt)) {
      // 「修改这次」: the corrected set replaces the original row.
      if (target) {
        rows.splice(rows.indexOf(target), 1);
        byId.delete(target.id);
      }
      nextIsModified = true;
    } else if (target) {
      target.reverted = true;
    }
  });

  const effective = rows.filter((row) => !row.reverted);
  const values = effective.map((row) => row.value).filter((v): v is number => v !== null);
  return {
    rows: [...rows].reverse(),
    points: effective.map((row) => row.value),
    count: effective.length,
    first: values[0] ?? null,
    last: values[values.length - 1] ?? null,
  };
}

function isSameWrite(revertAt: string, setAt: string): boolean {
  const gap = Date.parse(setAt) - Date.parse(revertAt);
  return gap >= 0 && gap < REPLACE_WINDOW_MS;
}
