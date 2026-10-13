import {
  ChangeDetectionStrategy,
  Component,
  type OnDestroy,
  Input,
  effect,
  inject,
  untracked,
} from '@angular/core';

import { ToastService, type Toast } from './toast.service';

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
          [class.toast--docked]="docked"
          [class.toast--stacked]="!!item.detail || item.actions.length > 0 || !!item.closeLabel"
          [attr.role]="item.kind === 'error' ? 'alert' : 'status'"
          [attr.data-testid]="'toast-' + item.kind"
          (mouseenter)="pause()"
          (mouseleave)="resume()"
          (focusin)="pause()"
          (focusout)="resume()"
        >
          <div class="toast__text">
            <div class="toast__message">
              @if (item.kind === 'error') {
                <!-- Not colour alone: errors carry a ⚠ before the text (spec §6.5). -->
                <svg
                  class="toast__icon"
                  viewBox="0 0 16 16"
                  width="16"
                  height="16"
                  aria-hidden="true"
                  data-testid="toast-error-icon"
                >
                  <path d="M8 1.5 15 14H1z" fill="currentColor" />
                  <path
                    d="M8 6v4"
                    stroke="var(--toast-bg)"
                    stroke-width="1.6"
                    stroke-linecap="round"
                  />
                  <circle cx="8" cy="12" r="0.9" fill="var(--toast-bg)" />
                </svg>
              }
              {{ item.message }}
            </div>
            @if (item.detail) {
              <div
                class="toast__detail"
                [title]="item.detailFull ?? item.detail"
                data-testid="toast-detail"
              >
                @if (item.detailFull) {
                  <span aria-hidden="true">{{ item.detail }}</span>
                  <span class="sr-only">{{ item.detailFull }}</span>
                } @else {
                  {{ item.detail }}
                }
              </div>
            }
          </div>
          <div class="toast__actions">
            @for (action of item.actions; track $index) {
              <button
                type="button"
                class="toast__btn"
                [attr.data-testid]="action.testId"
                (click)="action.run()"
              >
                {{ action.label }}
              </button>
            }
            @if (item.closeLabel) {
              <button
                type="button"
                class="toast__btn"
                data-testid="toast-close"
                (click)="close(item)"
              >
                {{ item.closeLabel }}
              </button>
            } @else {
              <button
                type="button"
                class="toast__btn toast__close"
                aria-label="关闭通知"
                data-testid="toast-close"
                (click)="close(item)"
              >
                <span aria-hidden="true">×</span>
              </button>
            }
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
      /* In the flow of the review column: above its bottom bar with an 8px gap, and the area
         above shrinks instead of being covered. */
      /* A toast with a second line or buttons: the text gets the whole width, the buttons sit
         on a row of their own below it (a 420px window leaves no room beside them). */
      .toast--stacked {
        flex-wrap: wrap;
        row-gap: 4px;
      }
      .toast--stacked .toast__text {
        flex: 1 1 100%;
      }
      .toast--stacked .toast__actions {
        flex: 1 1 100%;
        justify-content: flex-end;
      }
      .toast--docked {
        position: static;
        flex: none;
        margin: 0 16px 8px;
      }
      .toast__text {
        min-width: 0;
        flex: 1;
      }
      .toast__message {
        font-size: var(--font-size-sm);
        line-height: 21px;
      }
      .toast__icon {
        flex: none;
        margin-top: 2px;
      }
      .toast--error .toast__message {
        display: flex;
        gap: 6px;
        align-items: flex-start;
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
  /**
   * Take part in the layout (a column with a bottom bar below): the toast sits in the flow
   * right above that bar, 8px apart, so it never covers anything. Otherwise it floats at the
   * bottom of the window.
   */
  @Input() docked = false;

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

  close(toast: Toast): void {
    this.toasts.dismiss(toast.id);
    toast.onClose?.();
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
