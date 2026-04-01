/**
 * OKR Feedback Component
 *
 * Allows users to provide feedback on generated OKRs with thumbs up/down
 * rating and optional comment text.
 *
 * @usage
 * ```html
 * <clarityokr-okr-feedback
 *   [sessionId]="sessionId"
 *   [okrId]="okrId"
 *   (submitFeedback)="onFeedbackSubmitted($event)">
 * </clarityokr-okr-feedback>
 * ```
 *
 * @module okr-sticky/components/okr-feedback
 */
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

/** Feedback rating type */
export type FeedbackRating = 'positive' | 'negative' | null;

/** Feedback submission payload */
export interface FeedbackSubmission {
  /** Associated session ID */
  sessionId: string;
  /** Associated OKR ID */
  okrId: string;
  /** User's rating (thumbs up/down) */
  rating: 'positive' | 'negative';
  /** Optional comment text */
  comment: string;
  /** Timestamp of submission */
  submittedAt: string;
}

@Component({
  selector: 'clarityokr-okr-feedback',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="okr-feedback">
      <div class="okr-feedback__question">
        {{ 'okr.feedback.question' | translate }}
      </div>

      <div class="okr-feedback__rating">
        <button
          type="button"
          class="okr-feedback__thumb"
          [class.okr-feedback__thumb--selected]="selectedRating() === 'positive'"
          [attr.aria-pressed]="selectedRating() === 'positive'"
          data-testid="feedback-thumb-up"
          (click)="selectRating('positive')"
          [attr.aria-label]="'okr.feedback.thumbsUp' | translate"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"
            />
          </svg>
        </button>

        <button
          type="button"
          class="okr-feedback__thumb"
          [class.okr-feedback__thumb--selected]="selectedRating() === 'negative'"
          [class.okr-feedback__thumb--negative]="selectedRating() === 'negative'"
          [attr.aria-pressed]="selectedRating() === 'negative'"
          data-testid="feedback-thumb-down"
          (click)="selectRating('negative')"
          [attr.aria-label]="'okr.feedback.thumbsDown' | translate"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"
            />
          </svg>
        </button>
      </div>

      @if (showCommentSection()) {
        <div class="okr-feedback__comment-section">
          <textarea
            class="okr-feedback__textarea"
            [(ngModel)]="commentText"
            [placeholder]="'okr.feedback.placeholder' | translate"
            [attr.aria-label]="'okr.feedback.commentLabel' | translate"
            data-testid="feedback-comment"
            rows="3"
          ></textarea>

          <button
            type="button"
            class="okr-feedback__submit"
            [disabled]="!canSubmit()"
            [class.okr-feedback__submit--disabled]="!canSubmit()"
            data-testid="feedback-submit"
            (click)="submit()"
          >
            {{ 'okr.feedback.submit' | translate }}
          </button>
        </div>
      }

      @if (isSubmitted()) {
        <div class="okr-feedback__success" data-testid="feedback-success">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>{{ 'okr.feedback.thankYou' | translate }}</span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .okr-feedback {
        padding: var(--space-md);
        background: var(--color-surface);
        border-radius: var(--radius-lg);
        border: 1px solid var(--color-primary-alpha-15);
      }

      .okr-feedback__question {
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
        margin-bottom: var(--space-sm);
        text-align: center;
      }

      .okr-feedback__rating {
        display: flex;
        justify-content: center;
        gap: var(--space-md);
        margin-bottom: var(--space-sm);
      }

      .okr-feedback__thumb {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border: 2px solid var(--color-primary-alpha-25);
        border-radius: var(--radius-full);
        background: var(--color-surface);
        color: var(--color-text-muted);
        cursor: pointer;
        transition: all var(--transition-fast);
      }

      .okr-feedback__thumb:hover {
        border-color: var(--color-primary-alpha-65);
        color: var(--color-primary);
        transform: scale(1.05);
      }

      .okr-feedback__thumb--selected {
        border-color: var(--color-success);
        background: var(--color-success-light);
        color: var(--color-success);
      }

      .okr-feedback__thumb--selected.okr-feedback__thumb--negative {
        border-color: var(--color-error);
        background: var(--color-error-light);
        color: var(--color-error);
      }

      .okr-feedback__comment-section {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
        animation: fadeIn var(--transition-normal) ease;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .okr-feedback__textarea {
        width: 100%;
        padding: var(--space-sm) var(--space-md);
        border: 1px solid var(--color-primary-alpha-25);
        border-radius: var(--radius-md);
        font-family: var(--font-family);
        font-size: var(--font-size-sm);
        background: var(--color-primary-light);
        color: var(--color-text);
        resize: vertical;
        min-height: 80px;
        transition:
          border-color var(--transition-fast),
          box-shadow var(--transition-fast);
      }

      .okr-feedback__textarea:focus {
        outline: none;
        border-color: var(--color-primary-alpha-65);
        box-shadow: var(--shadow-ring);
      }

      .okr-feedback__textarea::placeholder {
        color: var(--color-text-placeholder);
      }

      .okr-feedback__submit {
        padding: var(--space-sm) var(--space-lg);
        border: none;
        border-radius: var(--radius-md);
        background: var(--gradient-primary);
        color: white;
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        cursor: pointer;
        transition: all var(--transition-fast);
      }

      .okr-feedback__submit:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: var(--shadow-md);
      }

      .okr-feedback__submit--disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .okr-feedback__success {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-xs);
        padding: var(--space-sm);
        color: var(--color-success);
        font-size: var(--font-size-sm);
        animation: fadeIn var(--transition-normal) ease;
      }

      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .okr-feedback__thumb,
        .okr-feedback__submit {
          transition: none;
        }

        .okr-feedback__thumb:hover {
          transform: none;
        }

        .okr-feedback__comment-section,
        .okr-feedback__success {
          animation: none;
        }
      }
    `,
  ],
})
export class OkrFeedbackComponent {
  /** Session ID associated with this feedback */
  @Input() sessionId!: string;

  /** OKR ID associated with this feedback */
  @Input() okrId!: string;

  /** Event emitted when feedback is submitted */
  @Output() submitFeedback = new EventEmitter<FeedbackSubmission>();

  /** Currently selected rating (thumbs up/down) */
  selectedRating = signal<FeedbackRating>(null);

  /** Comment text entered by user */
  commentText = '';

  /** Whether feedback has been submitted */
  isSubmitted = signal(false);

  /** Whether to show the comment section (after rating selected) */
  showCommentSection = () => this.selectedRating() !== null && !this.isSubmitted();

  /** Whether the form can be submitted */
  canSubmit = () => this.selectedRating() !== null && !this.isSubmitted();

  /**
   * Select a rating (thumbs up or down)
   * @param rating - The selected rating
   */
  selectRating(rating: 'positive' | 'negative'): void {
    if (this.isSubmitted()) {
      return;
    }
    this.selectedRating.set(rating);
  }

  /**
   * Submit the feedback
   * Emits the submitFeedback event with the collected data
   */
  submit(): void {
    const rating = this.selectedRating();
    if (!rating || this.isSubmitted()) {
      return;
    }

    const submission: FeedbackSubmission = {
      sessionId: this.sessionId,
      okrId: this.okrId,
      rating,
      comment: this.commentText.trim(),
      submittedAt: new Date().toISOString(),
    };

    this.submitFeedback.emit(submission);
    this.isSubmitted.set(true);
  }

  /**
   * Reset the feedback form to initial state
   */
  reset(): void {
    this.selectedRating.set(null);
    this.commentText = '';
    this.isSubmitted.set(false);
  }
}
