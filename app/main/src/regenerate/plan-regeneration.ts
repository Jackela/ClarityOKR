import type { RegenerateSummary } from '@clarityokr/contracts';

/** An active key result as it is now (in list order). */
export interface CurrentKr {
  id: string;
  statement: string;
  successMetric: string | null;
}

/** One key result the model returned; `id` may be missing or unknown. */
export interface ReturnedKr {
  id?: string;
  statement: string;
  successMetric?: string;
}

export interface RegenerationPlan {
  /** The full active list to store, in display order (ids not in it get `removed_at`). */
  keyResults: CurrentKr[];
  summary: RegenerateSummary;
}

const metricOf = (kr: ReturnedKr): string | null => {
  const metric = kr.successMetric?.trim();
  return metric ? metric : null;
};

/**
 * Spec §3.7: how a regeneration result is applied.
 *
 * Full (no `selected`):
 * - a returned id that matches an active key result keeps it (progress, status, reviews) and
 *   replaces its text and metric; each id counts once;
 * - anything else is new (fresh id, metric from the model, empty only when none came back);
 * - active key results no id matched are removed; the list follows the model's order.
 * - `missingIds`: new ones beyond what a longer list explains (returned − current), or ones
 *   with no id at all, are the ones that "came back without a number".
 *
 * Partial (`selected`): only the selected key results change; ids outside the selection and
 * items without an id are ignored; a selected one that did not come back is removed. The
 * order of the list does not change.
 */
export function planRegeneration(
  current: readonly CurrentKr[],
  returned: readonly ReturnedKr[],
  newId: () => string,
  selected?: readonly string[],
): RegenerationPlan {
  const taken = new Map<string, ReturnedKr>();
  const known = new Set(current.map((kr) => kr.id));

  if (selected) {
    const scope = new Set(selected.filter((id) => known.has(id)));
    for (const kr of returned) {
      if (kr.id && scope.has(kr.id) && !taken.has(kr.id)) taken.set(kr.id, kr);
    }
    const keyResults: CurrentKr[] = [];
    let removed = 0;
    for (const kr of current) {
      if (!scope.has(kr.id)) {
        keyResults.push(kr);
        continue;
      }
      const next = taken.get(kr.id);
      if (!next) {
        removed += 1;
        continue;
      }
      keyResults.push({ id: kr.id, statement: next.statement, successMetric: metricOf(next) });
    }
    return {
      keyResults,
      summary: {
        outcome: removed === 0 ? 'partial_updated' : 'partial_removed',
        requested: scope.size,
        kept: taken.size,
        added: 0,
        removed,
        missingIds: 0,
        addedIds: [],
        touchedIds: [...taken.keys()],
      },
    };
  }

  const keyResults: CurrentKr[] = [];
  const addedIds: string[] = [];
  let withoutId = 0;
  for (const kr of returned) {
    if (kr.id && known.has(kr.id) && !taken.has(kr.id)) {
      taken.set(kr.id, kr);
      keyResults.push({ id: kr.id, statement: kr.statement, successMetric: metricOf(kr) });
    } else {
      if (!kr.id) withoutId += 1;
      const id = newId();
      addedIds.push(id);
      keyResults.push({ id, statement: kr.statement, successMetric: metricOf(kr) });
    }
  }
  const added = addedIds.length;
  const removed = current.length - taken.size;
  const keptOrder = current.filter((kr) => taken.has(kr.id)).map((kr) => kr.id);
  const newOrder = keyResults.filter((kr) => taken.has(kr.id)).map((kr) => kr.id);
  const sameOrder = keptOrder.every((id, i) => newOrder[i] === id);
  const explained = Math.max(0, returned.length - current.length);
  const missingIds = Math.min(added, Math.max(withoutId, added - explained));
  return {
    keyResults,
    summary: {
      outcome: added === 0 && removed === 0 ? (sameOrder ? 'updated' : 'reordered') : 'changed',
      requested: current.length,
      kept: taken.size,
      added,
      removed,
      missingIds,
      addedIds,
      touchedIds: keyResults.map((kr) => kr.id),
    },
  };
}

/**
 * Reads the key results out of a draft reply: the canonical `{ draft: { objectives } }` shape
 * (metric = `target measurement`) or the flat `{ keyResults }` shape. Ids are optional here.
 * Returns null when nothing usable came back.
 */
export function readReturnedKeyResults(reply: unknown): ReturnedKr[] | null {
  const rec = (v: unknown): Record<string, unknown> | null =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  const root = rec(reply);
  if (!root) return null;
  let list: unknown = root.keyResults;
  let canonical = false;
  const draft = rec(root.draft);
  if (draft && Array.isArray(draft.objectives)) {
    list = rec(draft.objectives[0])?.keyResults;
    canonical = true;
  }
  if (!Array.isArray(list) || list.length === 0) return null;
  const out: ReturnedKr[] = [];
  for (const item of list) {
    const kr = rec(item);
    if (!kr || typeof kr.statement !== 'string' || kr.statement.trim() === '') return null;
    const id = typeof kr.id === 'string' && kr.id.trim() !== '' ? kr.id : undefined;
    let metric: string | undefined;
    if (canonical) {
      const parts = [kr.target, kr.measurement]
        .filter((p) => typeof p === 'string' || typeof p === 'number')
        .map(String)
        .filter((p) => p.trim() !== '');
      metric = parts.length > 0 ? parts.join(' ') : undefined;
    } else if (typeof kr.successMetric === 'string') {
      metric = kr.successMetric;
    }
    out.push({
      ...(id ? { id } : {}),
      statement: kr.statement.trim(),
      ...(metric ? { successMetric: metric } : {}),
    });
  }
  return out;
}
