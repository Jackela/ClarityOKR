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
  type ExitAnswer,
} from '@clarityokr/contracts';

import { DialogComponent } from '../shared/components/dialog.component';
import { ClosedLoopApi } from './closed-loop-api.service';
import { COPY } from './copy';

/** An answer the main process has not taken within this time counts as failed. */
export const EXIT_ANSWER_TIMEOUT_MS = 5000;

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
        [error]="error() ? failedText : ''"
        [busy]="busy()"
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
  /** The last answer did not reach the main process (the dialog stays open). */
  readonly error = signal(false);
  /** The answer is on its way: both buttons wait, Esc does nothing. */
  readonly busy = signal(false);
  readonly failedText = COPY.exitAnswerFailed;

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
      this.zone.run(() => void this.onConfirmExit(readConfirmExitEvent(payload))),
    );
    // A window created to host the dialog may have missed the event.
    void this.refresh(null);
  }

  ngOnDestroy(): void {
    this.unsubscribe();
  }

  async answer(confirmed: boolean): Promise<void> {
    const pending = this.pending();
    if (!pending || this.busy()) return;
    const clicked = this.document.querySelector<HTMLElement>(
      confirmed ? '[data-testid="dialog-confirm"]' : '[data-testid="dialog-cancel"]',
    );
    this.busy.set(true);
    this.error.set(false);
    const accepted = await this.send({ kind: pending.kind, confirmed });
    this.busy.set(false);
    if (!accepted) {
      // Keep the dialog; say so above the buttons and give the focus back to the button.
      this.error.set(true);
      setTimeout(() => clicked?.focus());
      return;
    }
    const memoryOnly = pending.confirmation.memoryOnly;
    this.pending.set(null);
    if (!confirmed && memoryOnly && this.focusWasOutside) {
      // The dialog gave the focus back to <body>; §1.2c rule 6 puts it on the export entry.
      setTimeout(() =>
        this.document.querySelector<HTMLElement>('[data-testid="memory-export"]')?.focus(),
      );
    }
  }

  /** ok + accepted within {@link EXIT_ANSWER_TIMEOUT_MS}; a reject, ok:false or timeout is false. */
  private async send(answer: ExitAnswer): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), EXIT_ANSWER_TIMEOUT_MS);
    });
    const reply = this.api
      .exitAnswer(answer)
      .then((r) => r.ok && r.data.accepted === true)
      .catch(() => false);
    const accepted = await Promise.race([reply, timeout]);
    clearTimeout(timer);
    return accepted;
  }

  /**
   * Every new quit / restart: ask the main process which dialog this window should show (it is
   * the single source); the event payload is only the fallback when that query fails.
   */
  private async onConfirmExit(event: ConfirmExitEvent | null): Promise<void> {
    await this.refresh(event);
  }

  private async refresh(fallback: ConfirmExitEvent | null): Promise<void> {
    const reply = await this.api.exitPending().catch(() => null);
    const pending = reply?.ok ? reply.data.pending : fallback;
    if (pending && !this.busy()) this.show(pending);
  }

  private show(event: ConfirmExitEvent): void {
    if (this.pending()) {
      // Already showing one (same dialog re-sent): keep its focus and error state.
      this.pending.set(event);
      return;
    }
    const active = this.document.activeElement;
    this.focusWasOutside = !active || active === this.document.body;
    this.error.set(false);
    this.pending.set(event);
  }
}
