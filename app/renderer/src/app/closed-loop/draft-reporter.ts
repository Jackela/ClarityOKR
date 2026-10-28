import { effect, type Injector, type Signal } from '@angular/core';
import type { DraftRow } from '@clarityokr/contracts';

import { ClosedLoopApi } from './closed-loop-api.service';

/**
 * #110: keeps the main process up to date with the CONTENT of this window's unsaved input, so a
 * session end (log off / shut down) can write it to disk without asking the renderer. The
 * latest rows win; one request at a time. Nothing is written to disk by this call.
 */
export function watchDraftRows(rows: Signal<DraftRow[]>, injector: Injector): void {
  const api = injector.get(ClosedLoopApi);
  let inFlight = false;
  let next: DraftRow[] | null = null;
  let lastSent = '[]';
  const flush = async (): Promise<void> => {
    if (inFlight || next === null) return;
    const value = next;
    next = null;
    const json = JSON.stringify(value);
    if (json === lastSent) return;
    inFlight = true;
    try {
      // Optional call: partial API test doubles of the host windows do not know drafts.
      const result = await api.reportDraft?.({ rows: value });
      if (result?.ok) lastSent = json;
    } catch {
      /* the next change sends again */
    }
    inFlight = false;
    void flush();
  };
  effect(
    () => {
      next = rows();
      void flush();
    },
    { injector },
  );
}
