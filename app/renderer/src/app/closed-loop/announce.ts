import type { WritableSignal } from '@angular/core';

const timers = new WeakMap<WritableSignal<string>, ReturnType<typeof setTimeout>>();

/** Gap between clearing a live region and writing the text again. */
export const ANNOUNCE_GAP_MS = 60;

/**
 * Puts `text` into a live region so that it is read out EVERY time. A live region only speaks
 * when its content changes, so the same sentence twice in a row (a second save with the same
 * snapshot time) would be silent: empty it first and write the text a moment later.
 */
export function announceAgain(region: WritableSignal<string>, text: string): void {
  const pending = timers.get(region);
  if (pending !== undefined) clearTimeout(pending);
  region.set('');
  timers.set(
    region,
    setTimeout(() => {
      timers.delete(region);
      region.set(text);
    }, ANNOUNCE_GAP_MS),
  );
}
