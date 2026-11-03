import { Injectable, signal } from '@angular/core';
import {
  truncateDraftTitle,
  type DraftRow,
  type ResolvedDraftRow,
  type RestoreTarget,
} from '@clarityokr/contracts';

import { COPY } from './copy';

/** One line of the bar: what is shown (title cut, S3§12.5) and the full text (title / reader). */
export interface DraftLine {
  key: string;
  /** Visible text, the OKR title cut to 9 clusters + 「…」 when it has 11 or more. */
  visible: string;
  /** The same line with the full title (`title` attribute and screen reader). */
  full: string;
}

export function draftLine(item: ResolvedDraftRow): DraftLine {
  const t = COPY.draftRestore;
  const make = (render: (title: string) => string, title: string): DraftLine => ({
    key: item.key,
    visible: render(truncateDraftTitle(title)),
    full: render(title),
  });
  if (item.row.kind === 'wizard') {
    const text = t.wizardLine;
    return { key: item.key, visible: text, full: text };
  }
  if (item.row.kind === 'objective')
    return make(t.objectiveLine, (item as { okrTitle: string }).okrTitle);
  if (item.row.kind === 'addedKr')
    return make(t.addedKrLine, (item as { okrTitle: string }).okrTitle);
  if ('krIndex' in item) return make((title) => t.textEditLine(title, item.krIndex), item.okrTitle);
  if ('period' in item && item.period) {
    const text = t.reviewLine(item.period);
    return { key: item.key, visible: text, full: text };
  }
  return make((title) => t.reviewNoPeriodLine(title), (item as { okrTitle: string }).okrTitle);
}

/**
 * The window that owns a draft puts it back. Registered by the window's root component (the
 * wizard in the main window, the note / review in the sticky window).
 */
export interface DraftRestoreHost {
  /** S3§12.3: the spot of `row` now — saved since the draft, holding new edits, or untouched. */
  targetOf(row: DraftRow): RestoreTarget;
  /**
   * Puts the rows back (still unsaved) and focuses the first one's input (order: wizard, text
   * edit, review). `ok: false` = nothing changed; `rollback` undoes a successful apply when the
   * draft file could not be updated afterwards (S3-05: the spot is left as it was).
   */
  apply(rows: readonly DraftRow[]): Promise<DraftApplyResult>;
  /** The window's main heading (`tabindex=-1`), for the focus after 放弃 / an emptied bar. */
  focusHeading(): void;
}

export interface DraftApplyResult {
  ok: boolean;
  /** The user kept the current edits in a confirm (no failure line; bar and draft stay). */
  cancelled?: boolean;
  rollback?: () => void;
}

@Injectable({ providedIn: 'root' })
export class DraftRestoreHosts {
  readonly host = signal<DraftRestoreHost | null>(null);
  register(host: DraftRestoreHost): () => void {
    this.host.set(host);
    return () => {
      if (this.host() === host) this.host.set(null);
    };
  }
}

/** Two review drafts are the same text. */
export function sameSections(
  a: { wentWell: string; fellShort: string; nextSteps: string },
  b: { wentWell: string; fellShort: string; nextSteps: string },
): boolean {
  return a.wentWell === b.wentWell && a.fellShort === b.fellShort && a.nextSteps === b.nextSteps;
}

/**
 * #110 / #117: the text edit's unsaved changes as draft rows — the same rule in both windows.
 * An `objective` row when the objective text changed, one `textEdit` row per existing key result
 * whose text changed, and one `addedKr` row with the key results added in this edit (in form
 * order). The text edit has no way to delete or reorder key results, so there is nothing else.
 */
export function textEditDraftRows(
  editor: {
    isEditing(): boolean;
    isDirty(): boolean;
    originalObjective(): string;
    draftObjective(): string;
    originalKeyResults(): readonly {
      id: string;
      statement: string;
      successMetric?: string | null;
    }[];
    draftKeyResults(): readonly { id: string; statement: string; successMetric?: string | null }[];
  },
  okrId: string,
): DraftRow[] {
  const rows: DraftRow[] = [];
  if (!editor.isEditing() || !editor.isDirty()) return rows;
  if (editor.draftObjective() !== editor.originalObjective()) {
    rows.push({
      kind: 'objective',
      okrId,
      base: editor.originalObjective(),
      draft: editor.draftObjective(),
    });
  }
  const originals = new Map(editor.originalKeyResults().map((kr) => [kr.id, kr]));
  const added: { id: string; statement: string; successMetric: string }[] = [];
  for (const kr of editor.draftKeyResults()) {
    const base = originals.get(kr.id);
    if (!base) {
      added.push({ id: kr.id, statement: kr.statement, successMetric: kr.successMetric ?? '' });
      continue;
    }
    const before = { statement: base.statement, successMetric: base.successMetric ?? '' };
    const now = { statement: kr.statement, successMetric: kr.successMetric ?? '' };
    if (before.statement === now.statement && before.successMetric === now.successMetric) continue;
    rows.push({ kind: 'textEdit', okrId, krId: kr.id, base: before, draft: now });
  }
  if (added.length > 0) rows.push({ kind: 'addedKr', okrId, krs: added });
  return rows;
}

/**
 * #117 rule 1 for an objective / added-key-result row against the OKR saved now (`null` = another
 * OKR is shown: 恢复 switches first, its own confirm covers the edits there).
 */
export function structuralTarget(
  row: Extract<DraftRow, { kind: 'objective' | 'addedKr' }>,
  saved: { objective: string; keyResultIds: readonly string[] } | null,
  editorDirty: boolean,
): RestoreTarget {
  if (saved) {
    if (row.kind === 'objective' && saved.objective !== row.base) return 'saved';
    if (row.kind === 'addedKr' && row.krs.some((kr) => saved.keyResultIds.includes(kr.id)))
      return 'saved';
  }
  return editorDirty ? 'dirty' : 'untouched';
}

/** S3§12.3 for a text edit row against the key results saved now. */
export function textEditTarget(
  row: Extract<DraftRow, { kind: 'textEdit' }>,
  saved: readonly { id: string; statement: string; successMetric?: string | null }[] | null,
  editorDirty: boolean,
): RestoreTarget {
  const kr = saved?.find((k) => k.id === row.krId);
  if (
    kr &&
    (kr.statement !== row.base.statement || (kr.successMetric ?? '') !== row.base.successMetric)
  )
    return 'saved';
  return editorDirty ? 'dirty' : 'untouched';
}
