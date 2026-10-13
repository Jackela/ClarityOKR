import { Injectable, effect, inject, signal, type Injector, type Signal } from '@angular/core';
import type { IpcResult, UnsavedFlags, UnsavedReport } from '@clarityokr/contracts';

import { ClosedLoopApi } from './closed-loop-api.service';

const NONE: UnsavedFlags = { wizard: false, textEdit: false, reviewDraft: false };
const KEYS = ['wizard', 'textEdit', 'reviewDraft'] as const;

/** A report the main process did not take is sent again after this delay. */
export const UNSAVED_RETRY_MS = 1000;
/** N14: at most this many retries in a row; then wait for the next change of the flags. */
export const UNSAVED_MAX_RETRIES = 5;

/** N14: only a failure that may go away by itself is retried (a rejected call, INTERNAL). */
function isTransient(result: IpcResult<unknown> | null): boolean {
  return result === null || (!result.ok && result.error.code === 'INTERNAL');
}

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
 *
 * N14: only transient failures (rejected call, `INTERNAL`) are retried, at most
 * {@link UNSAVED_MAX_RETRIES} times in a row. A refused report (e.g. `INVALID_REQUEST`) or the
 * cap stops retrying until this window's flags change again.
 */
@Injectable({ providedIn: 'root' })
export class UnsavedReporter {
  private readonly api = inject(ClosedLoopApi);
  /** What the main process acknowledged. */
  private confirmed: UnsavedFlags = { ...NONE };
  private inFlight = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retries = 0;
  /** Gave up on the current flags (refused or cap reached); a change starts over. */
  private stopped = false;
  /** This window's current flags (also sent with a restart request). */
  readonly local = signal<UnsavedFlags>({ ...NONE });

  /** Starts watching `flags` (call once per window, from a component constructor). */
  watch(flags: Signal<UnsavedFlags>, injector: Injector): void {
    effect(
      () => {
        const next = flags();
        const prev = this.local();
        if (KEYS.some((key) => next[key] !== prev[key])) {
          this.stopped = false;
          this.retries = 0;
        }
        this.local.set(next);
        void this.flush();
      },
      { injector },
    );
  }

  private async flush(): Promise<void> {
    if (this.inFlight || this.retryTimer !== undefined || this.stopped) return;
    const current = this.local();
    const report: UnsavedReport = {};
    for (const key of KEYS) {
      if (current[key] !== this.confirmed[key]) report[key] = current[key];
    }
    if (Object.keys(report).length === 0) return;
    this.inFlight = true;
    let result: IpcResult<unknown> | null = null;
    try {
      result = await this.api.reportUnsaved(report);
    } catch {
      result = null;
    }
    this.inFlight = false;
    if (result?.ok) {
      this.retries = 0;
      this.confirmed = { ...this.confirmed, ...report };
      // Anything that changed while the request was running goes out now.
      void this.flush();
      return;
    }
    if (!isTransient(result) || this.retries >= UNSAVED_MAX_RETRIES) {
      this.stopped = true;
      return;
    }
    this.retries += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.flush();
    }, UNSAVED_RETRY_MS);
  }
}
