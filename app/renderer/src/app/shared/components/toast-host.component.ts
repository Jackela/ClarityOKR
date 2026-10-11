import {
  ChangeDetectionStrategy,
  Component,
  type OnDestroy,
  Input,
  effect,
  inject,
  untracked,
} from '@angular/core';

import { ToastService } from './toast.service';

/**
 * Renders the current toast at the bottom of the window (spec §2.6): success and neutral
 * toasts are `role="status"`, errors `role="alert"` and never time out. It does not take focus.
 * The timer pauses while the pointer or the focus is inside.
 */
@Component({
  selector: 'clarityokr-toast-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (toasts.current(); as toast) {
      @for (item of [toast]; track item.id) {
        <div
          class="toast"
          [class.toast--error]="item.kind === 'error'"
          [class.toast--raised]="raised"
          [attr.role]="item.kind === 'error' ? 'alert' : 'status'"
          [attr.data-testid]="'toast-' + item.kind"
          (mouseenter)="pause()"
          (mouseleave)="resume()"
          (focusin)="pause()"
          (focusout)="resume()"
        >
          <div class="toast__text">
            <div class="toast__message">{{ item.message }}</div>
            @if (item.detail) {
              <div class="toast__detail" [title]="item.detail" data-testid="toast-detail">
                {{ item.detail }}
              </div>
            }
          </div>
          <div class="toast__actions">
            @for (action of item.actions; track action.label) {
              <button
                type="button"
                class="toast__btn"
                [attr.data-testid]="action.testId"
                (click)="action.run()"
              >
                {{ action.label }}
              </button>
            }
            <button
              type="button"
              class="toast__btn toast__close"
              aria-label="关闭通知"
              data-testid="toast-close"
              (click)="toasts.dismiss(item.id)"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </div>
      }
    }
  `,
  styles: [
    `
      .toast {
        position: fixed;
        left: 16px;
        right: 16px;
        bottom: 16px;
        z-index: var(--z-toast);
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 48px;
        padding: 12px 16px;
        border-radius: var(--radius-lg);
        background: var(--toast-bg);
        color: var(--toast-fg);
        box-shadow: var(--shadow-lg);
        animation: toast-in var(--duration-fast, 150ms) var(--ease-out, ease-out);
      }
      .toast--raised {
        bottom: 72px;
      }
      .toast__text {
        min-width: 0;
        flex: 1;
      }
      .toast__message {
        font-size: var(--font-size-sm);
        line-height: 21px;
      }
      .toast--error .toast__message {
        color: var(--toast-error-title);
        font-weight: var(--font-weight-semibold);
      }
      .toast__detail {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: var(--font-size-xs);
        line-height: 16px;
        color: var(--toast-detail);
      }
      .toast__actions {
        display: flex;
        flex-shrink: 0;
        align-items: center;
        gap: 4px;
      }
      .toast__btn {
        min-height: 32px;
        padding: 0 8px;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--toast-action);
        font: inherit;
        font-size: var(--font-size-xs);
        font-weight: var(--font-weight-semibold);
        cursor: pointer;
      }
      .toast__close {
        width: 32px;
        padding: 0;
        color: var(--toast-fg);
        font-size: 18px;
      }
      .toast__btn:focus-visible {
        outline: 2px solid var(--toast-action);
        outline-offset: 2px;
      }
      @keyframes toast-in {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .toast {
          animation: none;
        }
      }
    `,
  ],
})
export class ToastHostComponent implements OnDestroy {
  /** A bottom bar is showing: sit 56px higher (spec §2.6). */
  @Input() raised = false;

  readonly toasts = inject(ToastService);

  private timer: ReturnType<typeof setTimeout> | undefined;
  private remaining = 0;
  private startedAt = 0;
  private paused = false;

  constructor() {
    effect(() => {
      const toast = this.toasts.current();
      untracked(() => {
        this.clear();
        this.paused = false;
        if (toast && toast.autoDismissMs !== null) {
          this.remaining = toast.autoDismissMs;
          this.start(toast.id);
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.clear();
  }

  pause(): void {
    if (this.paused || this.timer === undefined) return;
    this.paused = true;
    this.remaining = Math.max(0, this.remaining - (Date.now() - this.startedAt));
    this.clear();
  }

  resume(): void {
    const toast = this.toasts.current();
    if (!this.paused || !toast || toast.autoDismissMs === null) return;
    this.paused = false;
    this.start(toast.id);
  }

  private start(id: number): void {
    this.startedAt = Date.now();
    this.timer = setTimeout(() => this.toasts.dismiss(id), this.remaining);
  }

  private clear(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
