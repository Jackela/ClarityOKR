import { Injectable, NgZone, inject, signal } from '@angular/core';
import { IPC_CHANNELS, readRestartResultEvent } from '@clarityokr/contracts';

import { ClosedLoopApi } from './closed-loop-api.service';
import { UnsavedReporter } from './unsaved-reporter.service';

/**
 * 「重启应用」 on the memory-mode bar (spec §1.2c / §7a.3 / §7a.4).
 * `app:restart {unsaved}` → the main process either relaunches (`restarting`), or opens the
 * restart dialog in the MAIN window (`confirm_pending`, also when the click came from the
 * sticky note) and later tells this window `app:restart-result`:
 * - `cancelled` (「先不重启」/ Esc): the button is enabled again and takes the focus;
 * - `failed` (relaunch_failed): ONE inline `role=alert` line, focus on the button.
 * While a request is open the button is `aria-disabled` and further clicks do nothing.
 */
@Injectable({ providedIn: 'root' })
export class RestartFlow {
  private readonly api = inject(ClosedLoopApi);
  private readonly unsaved = inject(UnsavedReporter);
  private readonly zone = inject(NgZone);
  private listening = false;

  readonly busy = signal(false);
  readonly failed = signal(false);
  /** Bumped when the focus should go back to 「重启应用」. */
  readonly focusRequest = signal(0);

  /** Subscribes to `app:restart-result` (once per window). */
  listen(): void {
    if (this.listening) return;
    this.listening = true;
    this.api.onPayload(IPC_CHANNELS.APP_RESTART_RESULT, (payload) => {
      const result = readRestartResultEvent(payload);
      if (!result) return;
      this.zone.run(() => this.finish(result.outcome === 'failed'));
    });
  }

  async request(): Promise<void> {
    if (this.busy()) return;
    this.listen();
    this.failed.set(false);
    this.busy.set(true);
    const reply = await this.api.restart({ unsaved: this.unsaved.local() });
    if (reply.ok && reply.data.outcome === 'restarting') return; // the app is going away
    if (reply.ok && reply.data.outcome === 'confirm_pending') return; // wait for the result
    this.finish(true);
  }

  private finish(failed: boolean): void {
    this.busy.set(false);
    this.failed.set(failed);
    this.focusRequest.update((n) => n + 1);
  }
}
