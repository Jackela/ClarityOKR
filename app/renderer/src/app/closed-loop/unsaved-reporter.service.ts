import { Injectable, effect, inject, signal, type Injector, type Signal } from '@angular/core';
import type { UnsavedFlags, UnsavedReport } from '@clarityokr/contracts';

import { ClosedLoopApi } from './closed-loop-api.service';

const NONE: UnsavedFlags = { wizard: false, textEdit: false, reviewDraft: false };

/**
 * Keeps the main process informed about this window's unsaved input (wizard text, an open text
 * edit, a review draft) through `clarityokr:app:report-unsaved`. Only flags that changed are
 * sent. The main process ORs the flags of every window into a restart / quit decision, so a
 * restart asked from the sticky window still knows about a wizard draft in the main window.
 */
@Injectable({ providedIn: 'root' })
export class UnsavedReporter {
  private readonly api = inject(ClosedLoopApi);
  private sent: UnsavedFlags = { ...NONE };
  /** This window's current flags (also sent with a restart request). */
  readonly local = signal<UnsavedFlags>({ ...NONE });

  /** Starts watching `flags` (call once per window, from a component constructor). */
  watch(flags: Signal<UnsavedFlags>, injector: Injector): void {
    effect(
      () => {
        const next = flags();
        this.local.set(next);
        this.push(next);
      },
      { injector },
    );
  }

  private push(next: UnsavedFlags): void {
    const report: UnsavedReport = {};
    for (const key of ['wizard', 'textEdit', 'reviewDraft'] as const) {
      if (next[key] !== this.sent[key]) report[key] = next[key];
    }
    if (Object.keys(report).length === 0) return;
    this.sent = { ...next };
    void this.api.reportUnsaved(report);
  }
}
