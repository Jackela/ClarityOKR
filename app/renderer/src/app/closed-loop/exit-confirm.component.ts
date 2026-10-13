import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  NgZone,
  type OnDestroy,
  type OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  EXIT_CONFIRM_REASON_ORDER,
  IPC_CHANNELS,
  readConfirmExitEvent,
  type ConfirmExitEvent,
} from '@clarityokr/contracts';

import { DialogComponent } from '../shared/components/dialog.component';
import { ClosedLoopApi } from './closed-loop-api.service';
import { COPY } from './copy';

/**
 * The quit / restart confirmation (spec §1.2c, §7a.4), in whichever window the main process
 * picked (`app:confirm-exit`). Both windows host one. The safe button holds the focus and is
 * also Esc; the answer goes back through `app:exit-answer`. After 「继续编辑 / 先不退出」 the
 * focus returns to where it was; with only the in-memory reason and no earlier focus in this
 * window, it lands on 「导出当前 OKR」 of the memory bar.
 */
@Component({
  selector: 'clarityokr-exit-confirm',
  standalone: true,
  imports: [DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pending(); as p) {
      <clarityokr-dialog
        [title]="copy().title"
        [body]="body()"
        [cancelLabel]="safeLabel()"
        [confirmLabel]="copy().confirm"
        [danger]="true"
        [testId]="p.kind === 'quit' ? 'quit-dialog' : 'restart-dialog'"
        (cancelled)="answer(false)"
        (confirmed)="answer(true)"
      />
    }
  `,
})
export class ExitConfirmComponent implements OnInit, OnDestroy {
  private readonly api = inject(ClosedLoopApi);
  private readonly zone = inject(NgZone);
  private readonly document = inject(DOCUMENT);
  private unsubscribe: () => void = () => undefined;
  /** Nothing in this window had the focus when the dialog opened. */
  private focusWasOutside = false;

  readonly pending = signal<ConfirmExitEvent | null>(null);

  readonly copy = computed(() => (this.pending()?.kind === 'restart' ? COPY.restart : COPY.quit));

  readonly body = computed(() => {
    const pending = this.pending();
    if (!pending) return '';
    const reasons = this.copy().reasons;
    return EXIT_CONFIRM_REASON_ORDER.filter((r) => pending.confirmation.reasons.includes(r))
      .map((r) => reasons[r])
      .join('\n');
  });

  readonly safeLabel = computed(() =>
    this.pending()?.confirmation.memoryOnly ? this.copy().notNow : this.copy().keepEditing,
  );

  ngOnInit(): void {
    this.unsubscribe = this.api.onPayload(IPC_CHANNELS.APP_CONFIRM_EXIT, (payload) =>
      this.zone.run(() => this.show(readConfirmExitEvent(payload))),
    );
    // A window created to host the dialog may have missed the event.
    void this.api.exitPending().then((reply) => {
      if (reply.ok && reply.data.pending && !this.pending()) this.show(reply.data.pending);
    });
  }

  ngOnDestroy(): void {
    this.unsubscribe();
  }

  async answer(confirmed: boolean): Promise<void> {
    const pending = this.pending();
    if (!pending) return;
    const memoryOnly = pending.confirmation.memoryOnly;
    this.pending.set(null);
    await this.api.exitAnswer({ kind: pending.kind, confirmed });
    if (!confirmed && memoryOnly && this.focusWasOutside) {
      // The dialog gave the focus back to <body>; §1.2c rule 6 puts it on the export entry.
      setTimeout(() =>
        this.document.querySelector<HTMLElement>('[data-testid="memory-export"]')?.focus(),
      );
    }
  }

  private show(event: ConfirmExitEvent | null): void {
    if (!event) return;
    const active = this.document.activeElement;
    this.focusWasOutside = !active || active === this.document.body;
    this.pending.set(event);
  }
}
