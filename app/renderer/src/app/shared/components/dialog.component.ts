import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  EventEmitter,
  Input,
  type OnDestroy,
  type OnInit,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';

let nextId = 0;

/**
 * Confirmation dialog (spec §2.6): centred, modal, at most two buttons. The safe answer is
 * always the "cancel" button (first); it holds the focus when the dialog opens, Tab cycles
 * inside the box, Esc is "cancel", a click on the scrim does nothing, and focus goes back to
 * the control that had it before the dialog opened.
 */
@Component({
  selector: 'clarityokr-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scrim" data-testid="dialog-scrim">
      <div
        #box
        class="dialog"
        [attr.role]="role"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        [attr.aria-describedby]="bodyId"
        [attr.data-testid]="testId"
        (keydown)="onKeydown($event)"
      >
        <h2 class="dialog__title" [id]="titleId">{{ title }}</h2>
        <p class="dialog__body" [id]="bodyId">{{ body }}</p>
        <div class="dialog__actions">
          <button
            #cancelButton
            type="button"
            class="dialog__btn"
            data-testid="dialog-cancel"
            (click)="cancelled.emit()"
          >
            {{ cancelLabel }}
          </button>
          <button
            #confirmButton
            type="button"
            class="dialog__btn dialog__btn--confirm"
            [class.dialog__btn--danger]="danger"
            data-testid="dialog-confirm"
            (click)="confirmed.emit()"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .scrim {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-bg-overlay);
      }
      .dialog {
        box-sizing: border-box;
        width: min(360px, calc(100vw - 32px));
        padding: 20px;
        border-radius: var(--radius-lg);
        background: var(--color-bg-primary);
        color: var(--color-text-primary);
        box-shadow: var(--shadow-lg);
      }
      .dialog__title {
        margin: 0 0 8px;
        font-size: var(--font-size-base);
        font-weight: var(--font-weight-semibold);
      }
      .dialog__body {
        margin: 0 0 16px;
        font-size: var(--font-size-sm);
        line-height: 21px;
        color: var(--color-text-secondary);
      }
      .dialog__actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      .dialog__btn {
        min-width: 96px;
        min-height: 36px;
        padding: 0 16px;
        border: 1px solid var(--color-border-control);
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--color-text-primary);
        font: inherit;
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        cursor: pointer;
      }
      .dialog__btn--confirm {
        border-color: transparent;
        background: var(--color-brand-primary);
        color: #fff;
      }
      .dialog__btn--danger {
        background: #b91c1c;
      }
      .dialog__btn:focus-visible {
        outline: 2px solid var(--color-brand-primary);
        outline-offset: 2px;
      }
    `,
  ],
})
export class DialogComponent implements OnInit, OnDestroy {
  @Input({ required: true }) title = '';
  @Input({ required: true }) body = '';
  @Input() cancelLabel = '取消';
  @Input() confirmLabel = '确定';
  /** A destructive confirmation: `alertdialog` role and a red confirm button. */
  @Input() danger = true;
  @Input() testId = 'dialog';
  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('cancelButton', { static: true }) private cancelButton!: ElementRef<HTMLButtonElement>;
  @ViewChild('confirmButton', { static: true })
  private confirmButton!: ElementRef<HTMLButtonElement>;

  private readonly doc = inject(DOCUMENT);
  private readonly uid = nextId++;
  private opener: HTMLElement | null = null;

  get role(): 'dialog' | 'alertdialog' {
    return this.danger ? 'alertdialog' : 'dialog';
  }
  get titleId(): string {
    return `dialog-title-${this.uid}`;
  }
  get bodyId(): string {
    return `dialog-body-${this.uid}`;
  }

  ngOnInit(): void {
    const active = this.doc.activeElement;
    this.opener = active instanceof HTMLElement && active !== this.doc.body ? active : null;
    // The view is created before ngOnInit with static queries, so focus can move right away.
    this.cancelButton.nativeElement.focus();
  }

  ngOnDestroy(): void {
    const opener = this.opener;
    if (opener?.isConnected) opener.focus();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancelled.emit();
      return;
    }
    if (event.key !== 'Tab') return;
    const first = this.cancelButton.nativeElement;
    const last = this.confirmButton.nativeElement;
    const active = this.doc.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
