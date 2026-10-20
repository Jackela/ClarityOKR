import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type { BannerState } from '@clarityokr/contracts';

import { COPY } from './copy';
import { ReminderNavigator } from './reminder-navigator.service';
import { ReminderStore } from './reminder.store';

export type { GoReviewRequest } from './reminder-navigator.service';

/**
 * #54 quarter review banner (S1§11.3), above the quarter picker. role=status the first time a
 * banner shows in this run (announced once); Esc does nothing; 150 ms height animation unless
 * reduced motion. 「去复盘」 asks the parent to open the quarter's OKR and its review title; ✕
 * closes this quarter's banner and the parent moves focus to the quarter picker.
 */
@Component({
  selector: 'clarityokr-review-reminder-banner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state(); as s) {
      @if (s.banner !== 'none') {
        <div
          class="reminder"
          data-testid="review-reminder"
          [attr.data-kind]="s.banner"
          [attr.data-period]="s.period"
          [attr.role]="live() ? 'status' : null"
        >
          <span class="reminder__text">
            <svg class="reminder__icon" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5" />
              <path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" stroke-width="1.5" />
            </svg>
            @if (notice()) {
              <span class="reminder__notice" role="status" data-testid="review-reminder-notice">{{
                t.handoffTimeout
              }}</span>
            } @else {
              {{ s.banner === 'ending' ? t.endingText : t.endedText }}
            }
            <button
              type="button"
              class="reminder__go"
              data-testid="review-reminder-go"
              (click)="go(s)"
            >
              {{ t.goReview }}
            </button>
          </span>
          <button
            type="button"
            class="reminder__close"
            data-testid="review-reminder-close"
            [attr.aria-label]="t.closeLabel"
            (click)="close(s)"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .reminder {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        min-height: 40px;
        margin-bottom: var(--space-2);
        padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
        border-left: 4px solid var(--color-brand-primary);
        border-radius: var(--radius-md);
        background: var(--notice-info-bg);
        color: var(--color-text-primary);
        font-size: var(--font-size-sm);
        overflow: hidden;
        animation: reminder-open 150ms ease-out;
      }
      @keyframes reminder-open {
        from {
          max-height: 0;
          opacity: 0;
        }
        to {
          max-height: 80px;
          opacity: 1;
        }
      }
      /* Narrow window (< 360px, S2-10): the sentence wraps and 去复盘 goes under it as text;
         ✕ stays a full button on the right. */
      @media (max-width: 359.98px) {
        .reminder__go {
          flex-basis: 100%;
          text-align: left;
          padding-left: 18px; /* under the sentence, past the clock icon */
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .reminder {
          animation: none;
        }
      }
      .reminder__text {
        display: inline-flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 4px;
      }
      .reminder__icon {
        width: 14px;
        height: 14px;
        flex: none;
      }
      .reminder__go {
        min-height: 32px;
        padding: 0 2px;
        border: 0;
        background: transparent;
        color: var(--color-brand-primary);
        font: inherit;
        font-weight: var(--font-weight-semibold);
        text-decoration: underline;
        cursor: pointer;
      }
      .reminder__close {
        flex: none;
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--color-text-secondary);
        font: inherit;
        cursor: pointer;
      }
      .reminder__close:hover {
        background: var(--color-neutral-badge);
      }
      .reminder__go:focus-visible,
      .reminder__close:focus-visible {
        outline: 2px solid var(--color-brand-primary);
        outline-offset: 2px;
      }
    `,
  ],
})
export class ReviewReminderBannerComponent {
  /** The banner was closed: the parent moves focus to the quarter picker. */
  @Output() closed = new EventEmitter<void>();

  readonly t = COPY.reminders;
  private readonly reminders = inject(ReminderStore);
  private readonly navigator = inject(ReminderNavigator);
  readonly state = computed<BannerState>(() => this.reminders.banner());
  readonly live = signal(false);
  /** #88: 「去复盘」 could not reach the sticky note in time (session-only, this quarter). */
  readonly notice = computed<boolean>(() => this.reminders.showsHandoffNotice());
  private shownKey: string | null = null;

  constructor() {
    effect(() => {
      const s = this.state();
      const key = s.banner === 'none' ? null : `${s.banner}:${s.period}`;
      if (key === this.shownKey) return;
      this.shownKey = key;
      untracked(() => this.live.set(this.reminders.claimAnnouncement(s)));
    });
  }

  /**
   * Never disabled, no spinner (#88): a second click while the first is waiting replaces it in
   * main, and only the last one opens. A timeout shows the notice here; focus stays on the button.
   */
  go(s: BannerState): void {
    const period = s.period;
    if (s.targetOkrId && period) {
      // clicked again: the original banner text is back at once; a new timeout shows it again
      this.reminders.clearHandoffNotice();
      void this.navigator.goReview({ okrId: s.targetOkrId, period }).then((outcome) => {
        if (outcome === 'timeout') this.reminders.noteHandoffTimeout(period);
      });
    }
  }

  close(s: BannerState): void {
    if (!s.period) return;
    void this.reminders.dismiss(s.period);
    this.closed.emit();
  }
}
