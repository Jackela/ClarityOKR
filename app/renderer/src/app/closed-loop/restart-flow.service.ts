import { Injectable, computed, inject, signal } from '@angular/core';
import { EXIT_CONFIRM_REASON_ORDER, type ExitConfirmation } from '@clarityokr/contracts';

import { ClosedLoopApi } from './closed-loop-api.service';
import { COPY } from './copy';
import { UnsavedReporter } from './unsaved-reporter.service';

/**
 * 「重启应用」 on the memory-mode bar (spec §1.2c / §7a.3). Two steps with the main process:
 * 1. `app:restart {unsaved}`: the main process either relaunches (`restarting`), or answers
 *    `confirm_required` with the reasons; the restart version of the exit dialog is shown;
 * 2. 「放弃并重启」 → `app:restart {unsaved, confirmed:true}`.
 * `failed: relaunch_failed` (or any IPC failure) shows ONE inline line in the bar of the window
 * that was clicked; the next click removes it first, so there is never more than one.
 * While a request runs the button is `aria-disabled` and further clicks do nothing.
 *
 * D1c: the dialog opens in the window that was clicked. Moving it to the main window when the
 * click came from the sticky window (spec §7a.4) lands with the quit-confirm wiring in D2.
 */
@Injectable({ providedIn: 'root' })
export class RestartFlow {
  private readonly api = inject(ClosedLoopApi);
  private readonly unsaved = inject(UnsavedReporter);

  readonly busy = signal(false);
  readonly failed = signal(false);
  readonly confirmation = signal<ExitConfirmation | null>(null);

  readonly dialogBody = computed(() => {
    const confirmation = this.confirmation();
    if (!confirmation) return '';
    return EXIT_CONFIRM_REASON_ORDER.filter((r) => confirmation.reasons.includes(r))
      .map((r) => COPY.restart.reasons[r])
      .join('\n');
  });

  readonly safeLabel = computed(() =>
    this.confirmation()?.memoryOnly ? COPY.restart.notNow : COPY.restart.keepEditing,
  );

  async request(): Promise<void> {
    if (this.busy() || this.confirmation()) return;
    await this.send(false);
  }

  async confirm(): Promise<void> {
    if (this.busy() || !this.confirmation()) return;
    this.confirmation.set(null);
    await this.send(true);
  }

  cancel(): void {
    this.confirmation.set(null);
  }

  private async send(confirmed: boolean): Promise<void> {
    this.failed.set(false);
    this.busy.set(true);
    const unsaved = this.unsaved.local();
    const reply = await this.api.restart(confirmed ? { unsaved, confirmed: true } : { unsaved });
    if (reply.ok && reply.data.outcome === 'restarting') {
      // The app is going away; keep the button disabled.
      return;
    }
    this.busy.set(false);
    if (reply.ok && reply.data.outcome === 'confirm_required') {
      this.confirmation.set(reply.data.confirmation);
      return;
    }
    this.failed.set(true);
  }
}
