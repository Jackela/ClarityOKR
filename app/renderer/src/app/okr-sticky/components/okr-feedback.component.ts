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
import type { FeedbackRating, FeedbackSubmission } from './okr-feedback.types.js';

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
  styleUrl: './okr-feedback.component.scss',
})
export class OkrFeedbackComponent {
  @Input() sessionId!: string;
  @Input() okrId!: string;
  @Output() submitFeedback = new EventEmitter<FeedbackSubmission>();

  readonly selectedRating = signal<FeedbackRating>(null);
  commentText = '';
  readonly isSubmitted = signal(false);

  readonly showCommentSection = () => this.selectedRating() !== null && !this.isSubmitted();
  readonly canSubmit = () => this.selectedRating() !== null && !this.isSubmitted();

  selectRating(rating: 'positive' | 'negative'): void {
    if (this.isSubmitted()) {
      return;
    }
    this.selectedRating.set(rating);
  }

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

  reset(): void {
    this.selectedRating.set(null);
    this.commentText = '';
    this.isSubmitted.set(false);
  }
}
