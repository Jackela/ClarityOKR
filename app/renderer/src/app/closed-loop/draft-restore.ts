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
 * #110: one `textEdit` row per existing key result whose text changed in the text edit — the
 * same rule in both windows. Key results added in this edit, the objective, deletions and
 * reordering are not drafted (#117).
 */
export function textEditDraftRows(
  editor: {
    isEditing(): boolean;
    isDirty(): boolean;
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
  const originals = new Map(editor.originalKeyResults().map((kr) => [kr.id, kr]));
  for (const kr of editor.draftKeyResults()) {
    const base = originals.get(kr.id);
    if (!base) continue;
    const before = { statement: base.statement, successMetric: base.successMetric ?? '' };
    const now = { statement: kr.statement, successMetric: kr.successMetric ?? '' };
    if (before.statement === now.statement && before.successMetric === now.successMetric) continue;
    rows.push({ kind: 'textEdit', okrId, krId: kr.id, base: before, draft: now });
  }
  return rows;
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
