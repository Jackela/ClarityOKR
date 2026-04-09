import { CommonModule } from '@angular/common';
import type { ElementRef, OnDestroy, OnInit } from '@angular/core';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ChangeDetectorRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { generateConfettiPieces } from './success-celebration.animations.js';
import { successCelebrationStyles } from './success-celebration.styles.js';
import type { ConfettiPiece } from './success-celebration.types.js';
import {
  clearTimers,
  createDismissTimerState,
  pauseTimer,
  resumeTimer,
  startDismissTimer,
} from './success-celebration.timer.js';

@Component({
  selector: 'clarityokr-success-celebration',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article
      #celebrationContainer
      class="celebration-container"
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      [class.celebration--dismissing]="isDismissing"
    >
      @if (showConfetti) {
        <div class="confetti-container" aria-hidden="true">
          @for (piece of confettiPieces; track piece.id) {
            <div
              class="confetti"
              [style.left.%]="piece.x"
              [style.animation-delay.ms]="piece.delay"
              [style.background-color]="piece.color"
              [style.transform]="'rotate(' + piece.rotation + 'deg)'"
            ></div>
          }
        </div>
      }

      <div class="celebration-content">
        <div class="checkmark-container" aria-hidden="true">
          <svg class="checkmark" viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg">
            <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none" />
            <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
          </svg>
          <div class="pulse-ring"></div>
          <div class="pulse-ring pulse-ring--delay"></div>
        </div>

        <div class="text-content">
          @if (hasTitleTemplate) {
            <ng-content select="[title]"></ng-content>
          } @else {
            <h2 class="celebration-title">{{ title }}</h2>
          }

          @if (hasMessageTemplate) {
            <ng-content select="[message]"></ng-content>
          } @else if (message) {
            <p class="celebration-message">{{ message }}</p>
          }
        </div>

        @if (autoDismiss) {
          <div class="progress-container">
            <div
              class="progress-bar"
              [style.animation-duration.ms]="duration"
              [class.progress-bar--paused]="timerState.isPaused"
            ></div>
          </div>
        }

        <button
          type="button"
          class="dismiss-button"
          (click)="dismiss()"
          (mouseenter)="pause()"
          (mouseleave)="resume()"
          aria-label="Dismiss success message"
        >
          @if (autoDismiss) {
            <span>Dismiss ({{ timerState.remainingTime / 1000 }}s)</span>
          } @else {
            <span>Dismiss</span>
          }
        </button>
      </div>
    </article>
  `,
  styles: successCelebrationStyles,
})
export class SuccessCelebrationComponent implements OnInit, OnDestroy {
  @ViewChild('celebrationContainer', { static: true })
  private container!: ElementRef<HTMLElement>;

  @Input() title = 'Success!';
  @Input() message?: string;
  @Input() showConfetti = true;
  @Input() autoDismiss = true;
  @Input() duration = 5000;
  @Output() dismissed = new EventEmitter<void>();

  confettiPieces: ConfettiPiece[] = [];
  isDismissing = false;
  hasTitleTemplate = false;
  hasMessageTemplate = false;
  timerState = createDismissTimerState(this.duration);

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.generateConfetti();
    if (this.autoDismiss) {
      startDismissTimer(this.timerState, this.duration, () => this.dismiss(), this.cdr);
    }
  }

  ngOnDestroy(): void {
    clearTimers(this.timerState);
  }

  private generateConfetti(): void {
    if (!this.showConfetti) return;
    this.confettiPieces = generateConfettiPieces();
  }

  pause(): void {
    pauseTimer(this.timerState);
  }

  resume(): void {
    resumeTimer(this.timerState);
  }

  dismiss(): void {
    if (this.isDismissing) return;
    this.isDismissing = true;
    this.cdr.markForCheck();
    clearTimers(this.timerState);
    setTimeout(() => {
      this.dismissed.emit();
    }, 300);
  }
}
