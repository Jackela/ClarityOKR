import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  type OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  combineRestoreActions,
  restoreAction,
  type DraftRow,
  type ResolvedDraftRow,
} from '@clarityokr/contracts';

import { DialogComponent } from '../shared/components/dialog.component';
import { announceAgain } from './announce';
import { ClosedLoopApi } from './closed-loop-api.service';
import { COPY } from './copy';
import { DraftRestoreHosts, draftLine } from './draft-restore';

type Busy = 'none' | 'restore' | 'discard';
type Failure = 'none' | 'restore' | 'discard';

/**
 * #110 (S3§12): the non-modal bar that offers back what a session end (log off / shut down)
 * left unsaved in THIS window. 「恢复」 puts it back (still unsaved), 「放弃」 asks first
 * (「先留着」 is the default). No ✕, Esc does nothing; hiding / closing the window keeps the
 * draft. Rows whose spot was saved since are voided; a spot with new edits asks
 * 「用上次没保存的内容替换现在的修改？」 first.
 */
@Component({
  selector: 'clarityokr-draft-restore-bar',
  standalone: true,
  imports: [DialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rows().length > 0) {
      <div
        class="draft"
        role="region"
        aria-labelledby="draft-restore-title"
        aria-describedby="draft-restore-body"
        data-testid="draft-bar"
      >
        <svg class="draft__icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.6" />
          <path d="M10 9v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          <circle cx="10" cy="6.2" r="1.1" fill="currentColor" />
        </svg>
        <div class="draft__text">
          <p class="draft__title" id="draft-restore-title">{{ t.title }}</p>
          <div id="draft-restore-body">
            <p>{{ t.lead }}</p>
            <ul class="draft__lines">
              @for (line of lines(); track line.key) {
                <li class="draft__line" data-testid="draft-line" [attr.title]="line.full">
                  <span aria-hidden="true">{{ line.visible }}</span
                  ><span class="sr-only">{{ line.full }}</span>
                </li>
              }
            </ul>
            @if (deletedCount() > 0) {
              <p class="draft__deleted" data-testid="draft-deleted">
                {{ t.deletedLine(deletedCount()) }}
              </p>
            }
          </div>
          @if (failure() !== 'none') {
            <p class="draft__error" role="alert" data-testid="draft-error">
              <span aria-hidden="true">⚠ </span
              >{{ failure() === 'restore' ? t.restoreFailed : t.discardFailed }}
            </p>
          }
        </div>
        <div class="draft__actions">
          <button
            #discardButton
            type="button"
            class="draft__btn draft__btn--secondary"
            data-testid="draft-discard"
            [attr.aria-disabled]="busy() !== 'none' ? 'true' : null"
            [attr.aria-busy]="busy() === 'discard' ? 'true' : null"
            (click)="askDiscard()"
          >
            @if (busy() === 'discard') {
              <span class="draft__spinner" aria-hidden="true"></span>
            }
            <span [class.draft__label--hidden]="busy() === 'discard'">{{ t.discard }}</span>
          </button>
          <button
            #restoreButton
            type="button"
            class="draft__btn draft__btn--primary"
            data-testid="draft-restore"
            [attr.aria-disabled]="busy() !== 'none' ? 'true' : null"
            [attr.aria-busy]="busy() === 'restore' ? 'true' : null"
            (click)="restore()"
          >
            @if (busy() === 'restore') {
              <span class="draft__spinner" aria-hidden="true"></span>
            }
            <span [class.draft__label--hidden]="busy() === 'restore'">{{ t.restore }}</span>
          </button>
        </div>
      </div>
    }
    @if (dialog() === 'discard') {
      <clarityokr-dialog
        [title]="t.discardTitle"
        [body]="t.discardBody"
        [cancelLabel]="t.discardKeep"
        [confirmLabel]="t.discardConfirm"
        [danger]="true"
        testId="draft-discard-dialog"
        (cancelled)="closeDialog('discard')"
        (confirmed)="discard()"
      />
    }
    @if (dialog() === 'replace') {
      <clarityokr-dialog
        [title]="t.replaceTitle"
        [body]="t.replaceBody"
        [cancelLabel]="t.replaceKeep"
        [confirmLabel]="t.replaceConfirm"
        [danger]="true"
        testId="draft-replace-dialog"
        (cancelled)="closeDialog('restore')"
        (confirmed)="replace()"
      />
    }
    <span class="sr-only" aria-live="polite" data-draft-live>{{ live() }}</span>
  `,
  styles: [
    `
      :host {
        display: block;
        flex: none;
      }
      p,
      ul {
        margin: 0;
        padding: 0;
      }
      .draft {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
        box-sizing: border-box;
        padding: 16px 20px;
        border-bottom: 1px solid var(--color-border);
        border-left: 4px solid var(--color-brand-primary);
        background: #eff6ff;
        color: var(--color-text-primary);
        font-size: 14px;
        line-height: 21px;
      }
      :host-context([data-theme='dark']) .draft {
        background: #212c41;
      }
      .draft__icon {
        flex: none;
        align-self: flex-start;
        margin-top: 2px;
        color: var(--color-brand-primary);
      }
      .draft__text {
        flex: 1 1 0;
        min-width: 0;
      }
      .draft__title {
        font-size: 16px;
        line-height: 24px;
        font-weight: 600;
      }
      .draft__lines {
        list-style: none;
      }
      /* Every line stays on one line; only the OKR title is cut (S3§12.5). */
      .draft__line {
        white-space: nowrap;
        overflow: hidden;
      }
      .draft__deleted {
        color: var(--color-text-secondary);
      }
      .draft__error {
        margin-top: 4px;
        color: #b91c1c;
        font-weight: 600;
      }
      :host-context([data-theme='dark']) .draft__error {
        color: #f87171;
      }
      .draft__actions {
        display: flex;
        flex: none;
        gap: 8px;
      }
      /* < 560px (the 420 sticky window always): the buttons go under the text, right aligned. */
      @media (max-width: 559px) {
        .draft__actions {
          flex: 1 1 100%;
          justify-content: flex-end;
        }
      }
      .draft__btn {
        position: relative;
        min-width: 96px;
        height: 36px;
        padding: 0 16px;
        border-radius: var(--radius-md);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .draft__btn--primary {
        border: 0;
        background: var(--color-brand-primary);
        color: #ffffff;
      }
      :host-context([data-theme='dark']) .draft__btn--primary {
        color: #111827;
      }
      .draft__btn--secondary {
        border: 1px solid currentColor;
        background: transparent;
        color: inherit;
      }
      .draft__btn:focus-visible {
        outline: 2px solid var(--color-brand-primary);
        outline-offset: 2px;
      }
      .draft__label--hidden {
        visibility: hidden;
      }
      .draft__spinner {
        position: absolute;
        top: calc(50% - 6px);
        left: calc(50% - 6px);
        box-sizing: border-box;
        width: 12px;
        height: 12px;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 50%;
        animation: draft-spin 0.8s linear infinite;
      }
      @keyframes draft-spin {
        to {
          transform: rotate(360deg);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .draft__spinner {
          animation: none;
        }
      }
    `,
  ],
})
export class DraftRestoreBarComponent implements OnInit {
  readonly t = COPY.draftRestore;
  private readonly api = inject(ClosedLoopApi);
  private readonly hosts = inject(DraftRestoreHosts);

  readonly rows = signal<ResolvedDraftRow[]>([]);
  readonly deletedCount = signal(0);
  readonly busy = signal<Busy>('none');
  readonly failure = signal<Failure>('none');
  readonly dialog = signal<'none' | 'discard' | 'replace'>('none');
  readonly live = signal('');
  readonly lines = computed(() => this.rows().map(draftLine));

  @ViewChild('restoreButton') private restoreButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('discardButton') private discardButton?: ElementRef<HTMLButtonElement>;

  async ngOnInit(): Promise<void> {
    // Optional call: partial API test doubles of the host windows do not know drafts.
    const result = await this.api.getDraft?.();
    if (!result?.ok || result.data.rows.length === 0) return;
    this.rows.set(result.data.rows);
    this.deletedCount.set(result.data.deletedCount);
    announceAgain(this.live, `${this.t.title} ${this.t.lead}`);
    // First appearance: the focus goes to 「恢复」 once (non-modal, no trap).
    this.focusLater(() => this.restoreButton?.nativeElement);
  }

  /** 「恢复」: void saved spots, ask before replacing new edits, else restore at once. */
  async restore(): Promise<void> {
    const host = this.hosts.host();
    if (this.busy() !== 'none' || !host) return;
    const targets = this.rows().map((item) => ({
      item,
      action: restoreAction(host.targetOf(item.row)),
    }));
    const voided = targets.filter((t) => t.action === 'void').map((t) => t.item.key);
    if (voided.length > 0) {
      await this.api.settleDraft({ keys: voided });
      this.rows.update((rows) => rows.filter((row) => !voided.includes(row.key)));
      if (this.rows().length === 0) {
        host.focusHeading();
        return;
      }
    }
    const rest = targets.filter((t) => t.action !== 'void');
    if (combineRestoreActions(rest.map((t) => t.action)) === 'confirm') {
      this.dialog.set('replace');
      return;
    }
    await this.doRestore();
  }

  /** 「替换」 in the replace confirmation. */
  async replace(): Promise<void> {
    this.dialog.set('none');
    await this.doRestore();
  }

  askDiscard(): void {
    if (this.busy() !== 'none') return;
    this.dialog.set('discard');
  }

  /** 「先留着」 / 「保留现在的」 / Esc: the bar and the draft stay; focus back on the button. */
  closeDialog(button: 'discard' | 'restore'): void {
    this.dialog.set('none');
    this.focusLater(() =>
      button === 'discard' ? this.discardButton?.nativeElement : this.restoreButton?.nativeElement,
    );
  }

  /** 「放弃」 confirmed: delete the draft. */
  async discard(): Promise<void> {
    this.dialog.set('none');
    this.busy.set('discard');
    this.failure.set('none');
    const result = await this.api.settleDraft({ all: true });
    this.busy.set('none');
    if (!result.ok) {
      this.failure.set('discard');
      this.focusLater(() => this.discardButton?.nativeElement);
      return;
    }
    this.rows.set([]);
    announceAgain(this.live, this.t.discarded);
    this.hosts.host()?.focusHeading();
  }

  private async doRestore(): Promise<void> {
    const host = this.hosts.host();
    if (!host) return;
    const rows = this.rows();
    this.busy.set('restore');
    this.failure.set('none');
    let ok = false;
    try {
      const applied = await host.apply(rows.map((r) => r.row as DraftRow));
      ok = applied.ok;
      if (ok) {
        // The restored text is the window's unsaved input again (reported again from there).
        const settled = await this.api.settleDraft({ keys: rows.map((r) => r.key) });
        if (!settled.ok) {
          // S3-05: the draft stays, so the spot goes back to what it was (no half restore).
          applied.rollback?.();
          ok = false;
        }
      }
    } catch {
      ok = false;
    }
    this.busy.set('none');
    if (!ok) {
      this.failure.set('restore');
      this.focusLater(() => this.restoreButton?.nativeElement);
      return;
    }
    this.rows.set([]);
    announceAgain(this.live, this.t.restored);
  }

  private focusLater(target: () => HTMLElement | undefined): void {
    setTimeout(() => target()?.focus({ focusVisible: true } as FocusOptions), 0);
  }
}
