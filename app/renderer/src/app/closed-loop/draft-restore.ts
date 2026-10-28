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
    const text = t.wizardLine(item.row.step);
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
  /** Puts the rows back (still unsaved) and focuses the first one's input. false = failed. */
  apply(rows: readonly DraftRow[]): Promise<boolean>;
  /** The window's main heading (`tabindex=-1`), for the focus after 放弃 / an emptied bar. */
  focusHeading(): void;
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
