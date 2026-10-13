import { Injectable, effect, inject, signal, type Injector, type Signal } from '@angular/core';
import type { UnsavedFlags, UnsavedReport } from '@clarityokr/contracts';

import { ClosedLoopApi } from './closed-loop-api.service';

const NONE: UnsavedFlags = { wizard: false, textEdit: false, reviewDraft: false };
const KEYS = ['wizard', 'textEdit', 'reviewDraft'] as const;

/** A report the main process did not take is sent again after this delay. */
export const UNSAVED_RETRY_MS = 1000;

/**
 * Keeps the main process informed about this window's unsaved input (wizard text, an open text
 * edit, a review draft) through `clarityokr:app:report-unsaved`. Only flags that differ from
 * what the main process CONFIRMED are sent. The main process ORs the flags of every window
 * into a restart / quit decision, so a restart asked from the sticky window still knows about
 * a wizard draft in the main window.
 *
 * N7: a flag counts as known to the main process only after the IPC succeeded. One request is
 * in flight at a time; changes made meanwhile are sent right after it; a failed request is
 * retried after {@link UNSAVED_RETRY_MS} with the then-current flags.
 */
@Injectable({ providedIn: 'root' })
export class UnsavedReporter {
  private readonly api = inject(ClosedLoopApi);
  /** What the main process acknowledged. */
  private confirmed: UnsavedFlags = { ...NONE };
  private inFlight = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  /** This window's current flags (also sent with a restart request). */
  readonly local = signal<UnsavedFlags>({ ...NONE });

  /** Starts watching `flags` (call once per window, from a component constructor). */
  watch(flags: Signal<UnsavedFlags>, injector: Injector): void {
    effect(
      () => {
        this.local.set(flags());
        void this.flush();
      },
      { injector },
    );
  }

  private async flush(): Promise<void> {
    if (this.inFlight || this.retryTimer !== undefined) return;
    const current = this.local();
    const report: UnsavedReport = {};
    for (const key of KEYS) {
      if (current[key] !== this.confirmed[key]) report[key] = current[key];
    }
    if (Object.keys(report).length === 0) return;
    this.inFlight = true;
    let ok = false;
    try {
      ok = (await this.api.reportUnsaved(report)).ok;
    } catch {
      ok = false;
    }
    this.inFlight = false;
    if (ok) {
      this.confirmed = { ...this.confirmed, ...report };
      // Anything that changed while the request was running goes out now.
      void this.flush();
      return;
    }
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.flush();
    }, UNSAVED_RETRY_MS);
  }
}
