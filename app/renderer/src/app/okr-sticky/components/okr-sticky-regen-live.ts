import { Injectable, signal } from '@angular/core';

import { COPY } from '../../closed-loop/copy';

/** Lives on the sticky-note so the sr-only regen status and confirm/retry stay in sync. */
@Injectable()
export class StickyRegenLive {
  readonly message = signal('');

  setRunning(): void {
    this.message.set(COPY.regen.running);
  }

  clear(): void {
    this.message.set('');
  }
}
