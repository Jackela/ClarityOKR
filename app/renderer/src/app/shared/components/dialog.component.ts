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
 * Keys (with Ctrl/⌘) that belong to the page behind a dialog and are ignored while it is open.
 * This document-level capture listener is the ONLY place shortcuts are swallowed; anything else
 * (Ctrl/⌘ + C / V / X / A / Z…) keeps its normal meaning.
 */
const SWALLOWED_KEYS: ReadonlySet<string> = new Set(['1', '2', '3', 's']);

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
    <div class="scrim" data-testid="dialog-scrim" (mousedown)="onMouseDown($event)">
      <div
        #box
        class="dialog"
        [attr.role]="role"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        [attr.aria-describedby]="describedBy"
        [attr.data-testid]="testId"
        [attr.aria-busy]="busy ? 'true' : null"
      >
        <h2 class="dialog__title" [class.dialog__title--error]="errorTitle" [id]="titleId">
          {{ title }}
        </h2>
        <!-- prettier-ignore -->
        <p class="dialog__body" [id]="bodyId" [class.dialog__body--tight]="detail.length > 0 || !!hint">{{ body }}</p>
        @if (detail.length > 0) {
          <div class="dialog__detail" [id]="detailId" data-testid="dialog-detail">
            @for (line of detail; track $index) {
              <div>{{ line }}</div>
            }
          </div>
        }
        @if (hint) {
          <!-- prettier-ignore -->
          <p class="dialog__hint" [id]="hintId" data-testid="dialog-hint">{{ hint }}</p>
        }
        <!-- Extra content between the text and the buttons (S1§9.4 duplicate list). -->
        <ng-content />
        @if (error) {
          <p class="dialog__error" role="alert" data-testid="dialog-error">
            <span aria-hidden="true">⚠ </span>{{ error }}
          </p>
        }
        <div class="dialog__actions" [class.dialog__actions--note-above]="noteAbove">
          @if (confirmNote) {
            <span class="dialog__note" [id]="noteId" role="status" data-testid="dialog-note">{{
              confirmNote
            }}</span>
          }
          <button
            #cancelButton
            type="button"
            class="dialog__btn"
            [class.dialog__btn--confirm]="primaryCancel"
            data-testid="dialog-cancel"
            [attr.aria-disabled]="busy ? 'true' : null"
            (click)="onCancel()"
          >
            {{ cancelLabel }}
          </button>
          @if (middleLabel) {
            <button
              type="button"
              class="dialog__btn"
              data-testid="dialog-middle"
              [attr.aria-disabled]="busy ? 'true' : null"
              (click)="onMiddle()"
            >
              {{ middleLabel }}
            </button>
          }
          <button
            #confirmButton
            type="button"
            [hidden]="!confirmLabel"
            class="dialog__btn"
            [class.dialog__btn--confirm]="!primaryCancel"
            [class.dialog__btn--danger]="danger"
            [attr.aria-disabled]="confirmDisabled || busy ? 'true' : null"
            [attr.aria-describedby]="confirmNote ? noteId : null"
            data-testid="dialog-confirm"
            (click)="onConfirm()"
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
        box-sizing: border-box;
        padding: 24px 16px;
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
      /* #85: error dialogs (⚠ title) read red; information dialogs keep the primary text colour */
      .dialog__title--error {
        color: #b91c1c;
      }
      :host-context([data-theme='dark']) .dialog__title--error {
        color: #fca5a5;
      }
      .dialog__error {
        margin: 0 0 16px;
        color: #b91c1c;
        font-size: var(--font-size-sm);
        line-height: 20px;
      }
      :host-context([data-theme='dark']) .dialog__error {
        color: #fca5a5;
      }
      .dialog__actions--note-above .dialog__note {
        flex: 1 0 100%;
        margin-right: 0;
      }
      .dialog__btn[aria-disabled='true'] {
        cursor: progress;
      }
      .dialog__body {
        margin: 0 0 16px;
        /* Several reasons (restart / quit confirmation) are one sentence per line. */
        white-space: pre-line;
        font-size: var(--font-size-sm);
        line-height: 21px;
        color: var(--color-text-secondary);
      }
      .dialog__body--tight {
        margin-bottom: 8px;
      }
      /* #69 (S1§8.6 v3.2): plain sentences in the body font, 13/20, selectable */
      .dialog__detail {
        margin: 0 0 8px;
        font-size: 13px;
        line-height: 20px;
        user-select: text;
        overflow-wrap: anywhere;
      }
      .dialog__hint {
        margin: 0 0 16px;
        font-size: 12px;
        line-height: 16px;
        white-space: pre-line;
        color: var(--color-text-secondary);
      }
      [hidden] {
        display: none !important;
      }
      .dialog__actions {
        flex-wrap: wrap;
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
      .dialog__note {
        margin-right: auto;
        align-self: center;
        font-size: var(--font-size-xs);
        color: var(--color-text-secondary);
      }
      .dialog__btn[aria-disabled='true'] {
        opacity: 0.55;
        cursor: not-allowed;
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
  /** The confirm answer cannot be given right now (kept focusable, `aria-disabled`). */
  @Input() confirmDisabled = false;
  /** One inline `role=alert` line above the buttons (e.g. the answer could not be delivered). */
  @Input() error = '';
  /**
   * Waiting for the answer to be taken: both buttons are `aria-disabled` (still focusable), clicks
   * and Esc do nothing.
   */
  @Input() busy = false;
  /** Says why, beside the buttons (「正在保存，请稍候。」). */
  @Input() confirmNote = '';
  /** The note gets its own line above the buttons (a longer live summary, S1§9.4). */
  @Input() noteAbove = false;
  /** `alertdialog` role without the red button (S1§8.5: nothing here is destructive). */
  @Input() alert = false;
  /** #85: red title (error dialogs with ⚠). */
  @Input() errorTitle = false;
  /** A third answer between cancel and confirm (S1§8.5 「跳过」). */
  @Input() middleLabel = '';
  /** Monospace lines under the body, selectable (S1§8.6 field paths). */
  @Input() detail: readonly string[] = [];
  /** Smaller secondary lines under the body / detail (also read as the description). */
  @Input() hint = '';
  /** The cancel button is the main answer (a one-button 「知道了」 notice). */
  @Input() primaryCancel = false;
  @Output() middle = new EventEmitter<void>();
  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('cancelButton', { static: true }) private cancelButton!: ElementRef<HTMLButtonElement>;
  @ViewChild('confirmButton', { static: true })
  private confirmButton!: ElementRef<HTMLButtonElement>;

  private readonly doc = inject(DOCUMENT);
  private readonly uid = nextId++;
  private opener: HTMLElement | null = null;

  get role(): 'dialog' | 'alertdialog' {
    return this.danger || this.alert ? 'alertdialog' : 'dialog';
  }
  get titleId(): string {
    return `dialog-title-${this.uid}`;
  }
  get bodyId(): string {
    return `dialog-body-${this.uid}`;
  }
  get detailId(): string {
    return `dialog-detail-${this.uid}`;
  }
  get hintId(): string {
    return `dialog-hint-${this.uid}`;
  }
  get describedBy(): string {
    return [this.bodyId, this.detail.length > 0 ? this.detailId : '', this.hint ? this.hintId : '']
      .filter(Boolean)
      .join(' ');
  }
  get noteId(): string {
    return `dialog-note-${this.uid}`;
  }

  private readonly inerted: Element[] = [];
  private readonly onDocumentKeydown = (event: KeyboardEvent): void => this.onKeydown(event);

  /**
   * The safe answer (「继续编辑」 / 取消) takes the focus with a visible ring, so Enter never
   * picks the destructive one by accident (#85 review, S2-14).
   */
  private focusCancel(): void {
    this.cancelButton.nativeElement.focus({ focusVisible: true } as FocusOptions);
  }

  ngOnInit(): void {
    const active = this.doc.activeElement;
    this.opener = active instanceof HTMLElement && active !== this.doc.body ? active : null;
    // The view is created before ngOnInit with static queries, so focus can move right away.
    this.focusCancel();
    // Everything behind the dialog is inert (no focus, no clicks, hidden from assistive tech).
    this.makeBackgroundInert();
    // Listen on the document so Esc / Tab still work when the focus fell out of the box.
    this.doc.addEventListener('keydown', this.onDocumentKeydown, true);
  }

  ngOnDestroy(): void {
    this.doc.removeEventListener('keydown', this.onDocumentKeydown, true);
    for (const element of this.inerted) element.removeAttribute('inert');
    this.inerted.length = 0;
    const opener = this.opener;
    if (opener?.isConnected) opener.focus();
  }

  onCancel(): void {
    if (this.busy) return;
    this.cancelled.emit();
  }

  onMiddle(): void {
    if (this.busy) return;
    this.middle.emit();
  }

  onConfirm(): void {
    if (this.confirmDisabled || this.busy) return;
    this.confirmed.emit();
  }

  /**
   * A press on the scrim or on the box (outside the buttons) must not take the focus away: the
   * default action of mousedown is what moves it to <body>.
   */
  onMouseDown(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button')) return;
    event.preventDefault();
    const active = this.doc.activeElement;
    if (
      !(active instanceof HTMLElement) ||
      !this.cancelButton.nativeElement.closest('.scrim')?.contains(active)
    ) {
      this.focusCancel();
    }
  }

  private makeBackgroundInert(): void {
    const scrim = this.cancelButton.nativeElement.closest('.scrim');
    let node: Element | null = scrim;
    while (node && node !== this.doc.body) {
      const parent: Element | null = node.parentElement;
      if (!parent) break;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === node || sibling.hasAttribute('inert')) continue;
        if (sibling.tagName === 'SCRIPT' || sibling.tagName === 'STYLE') continue;
        sibling.setAttribute('inert', '');
        this.inerted.push(sibling);
      }
      node = parent;
    }
  }

  onKeydown(event: KeyboardEvent): void {
    // The app's global shortcuts (Ctrl/⌘ + 1 / 2 / 3 switch the tab, + S saves the review) do
    // nothing while a dialog is open: the dialog is modal, the page behind it is not in play.
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      SWALLOWED_KEYS.has(event.key.toLowerCase())
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!this.busy) this.cancelled.emit();
      return;
    }
    if (event.key !== 'Tab') return;
    // Every stop in the box, projected content included (buttons, roving radios with tabindex 0).
    const buttons = Array.from(
      this.cancelButton.nativeElement
        .closest('.dialog')
        ?.querySelectorAll<HTMLElement>(
          'button:not([hidden]):not([tabindex="-1"]), [tabindex="0"]:not(button)',
        ) ?? [],
    );
    const first = buttons[0] ?? this.cancelButton.nativeElement;
    const last = buttons[buttons.length - 1] ?? this.confirmButton.nativeElement;
    const active = this.doc.activeElement;
    if (
      !(active instanceof Node) ||
      !this.cancelButton.nativeElement.closest('.dialog')?.contains(active)
    ) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
