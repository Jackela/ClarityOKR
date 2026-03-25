/*
 * Success Celebration Component - ClarityOKR
 * ------------------------------------------
 * Animated celebration component for success states.
 * Features confetti, checkmark animation, and pulse effects.
 *
 * Features:
 * - Animated checkmark with scale and draw effects
 * - Confetti burst animation
 * - Pulse glow effect
 * - Success message display
 * - Auto-dismiss with countdown
 * - Reduced motion support
 *
 * Accessibility:
 * - role="alert" for success announcement
 * - aria-live="polite" for screen readers
 * - Respects prefers-reduced-motion
 *
 * Usage:
 *   <!-- Basic usage -->
 *   <clarityokr-success-celebration
 *     title="OKR Generated!"
 *     message="Your objectives and key results are ready."
 *     [autoDismiss]="true"
 *     [duration]="5000"
 *     (dismissed)="handleDismiss()">
 *   </clarityokr-success-celebration>
 *
 *   <!-- With custom content -->
 *   <clarityokr-success-celebration>
 *     <ng-container title>Custom Title</ng-container>
 *     <ng-container message>Custom message content.</ng-container>
 *   </clarityokr-success-celebration>
 */

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';

export interface ConfettiPiece {
  id: number;
  x: number;
  y: number;
  rotation: number;
  color: string;
  size: number;
  delay: number;
}

/**
 * Success celebration component with animations.
 */
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
      <!-- Confetti layer -->
      @if (showConfetti) {
        <div class="confetti-container" aria-hidden="true">
          @for (piece of confettiPieces; track piece.id) {
            <div
              class="confetti-piece"
              [style.--confetti-x.px]="piece.x"
              [style.--confetti-y.px]="piece.y"
              [style.--confetti-rotation.deg]="piece.rotation"
              [style.--confetti-color]="piece.color"
              [style.--confetti-size.px]="piece.size"
              [style.--confetti-delay.ms]="piece.delay"
            ></div>
          }
        </div>
      }

      <!-- Main content -->
      <div class="celebration-content">
        <!-- Animated checkmark -->
        <div class="checkmark-container" aria-hidden="true">
          <svg class="checkmark" viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg">
            <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none" />
            <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
          </svg>

          <!-- Pulse rings -->
          <div class="pulse-ring"></div>
          <div class="pulse-ring pulse-ring--delay"></div>
        </div>

        <!-- Text content -->
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

        <!-- Progress bar for auto-dismiss -->
        @if (autoDismiss) {
          <div class="progress-container">
            <div
              class="progress-bar"
              [style.animation-duration.ms]="duration"
              [class.progress-bar--paused]="isPaused"
            ></div>
          </div>
        }

        <!-- Dismiss button -->
        <button
          type="button"
          class="dismiss-button"
          (click)="dismiss()"
          (mouseenter)="pauseTimer()"
          (mouseleave)="resumeTimer()"
          aria-label="Dismiss success message"
        >
          @if (autoDismiss) {
            <span>Dismiss ({{ remainingTime / 1000 }}s)</span>
          } @else {
            <span>Dismiss</span>
          }
        </button>
      </div>
    </article>
  `,
  styles: [
    `
      :host {
        display: block;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: var(--z-modal);
        pointer-events: none;
      }

      .celebration-container {
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(15, 23, 42, 0.5);
        backdrop-filter: blur(4px);
        pointer-events: auto;
        animation: fade-in var(--duration-normal) var(--ease-out);
      }

      .celebration--dismissing {
        animation: fade-out var(--duration-normal) var(--ease-in) forwards;
      }

      @keyframes fade-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes fade-out {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }

      /* Confetti */
      .confetti-container {
        position: absolute;
        inset: 0;
        overflow: hidden;
        pointer-events: none;
      }

      .confetti-piece {
        position: absolute;
        left: 50%;
        top: 40%;
        width: var(--confetti-size);
        height: var(--confetti-size);
        background: var(--confetti-color);
        border-radius: 2px;
        animation: confetti-fall 3s var(--ease-out) forwards;
        animation-delay: calc(var(--confetti-delay) * 1ms);
        opacity: 0;
      }

      @keyframes confetti-fall {
        0% {
          transform: translate(0, 0) rotate(0deg);
          opacity: 1;
        }
        100% {
          transform: translate(calc(var(--confetti-x) * 3), calc(var(--confetti-y) * 3 + 300px))
            rotate(calc(var(--confetti-rotation) * 3));
          opacity: 0;
        }
      }

      /* Main content card */
      .celebration-content {
        position: relative;
        background: var(--glass-bg);
        backdrop-filter: var(--glass-blur);
        border: 1px solid var(--glass-border);
        border-radius: var(--radius-2xl);
        padding: var(--space-8);
        text-align: center;
        box-shadow: var(--shadow-xl);
        max-width: 420px;
        width: 90%;
        animation: content-pop var(--duration-slow) var(--ease-bounce);
      }

      @keyframes content-pop {
        0% {
          transform: scale(0.5);
          opacity: 0;
        }
        50% {
          transform: scale(1.05);
        }
        100% {
          transform: scale(1);
          opacity: 1;
        }
      }

      /* Checkmark */
      .checkmark-container {
        position: relative;
        width: 80px;
        height: 80px;
        margin: 0 auto var(--space-6);
      }

      .checkmark {
        width: 100%;
        height: 100%;
        display: block;
      }

      .checkmark__circle {
        stroke: var(--color-success);
        stroke-width: 3;
        stroke-dasharray: 166;
        stroke-dashoffset: 166;
        stroke-linecap: round;
        animation: checkmark-circle var(--duration-slow) var(--ease-out) forwards;
      }

      @keyframes checkmark-circle {
        0% {
          stroke-dashoffset: 166;
          transform: rotate(-90deg);
        }
        100% {
          stroke-dashoffset: 0;
          transform: rotate(0);
        }
      }

      .checkmark__check {
        stroke: var(--color-success);
        stroke-width: 4;
        stroke-dasharray: 48;
        stroke-dashoffset: 48;
        stroke-linecap: round;
        stroke-linejoin: round;
        animation: checkmark-draw 0.4s var(--ease-out) 0.4s forwards;
      }

      @keyframes checkmark-draw {
        0% {
          stroke-dashoffset: 48;
        }
        100% {
          stroke-dashoffset: 0;
        }
      }

      /* Pulse rings */
      .pulse-ring {
        position: absolute;
        inset: -10px;
        border: 3px solid var(--color-success);
        border-radius: var(--radius-full);
        opacity: 0;
        animation: pulse-ring 2s var(--ease-out) infinite;
      }

      .pulse-ring--delay {
        animation-delay: 0.5s;
      }

      @keyframes pulse-ring {
        0% {
          transform: scale(0.8);
          opacity: 0.5;
        }
        100% {
          transform: scale(1.5);
          opacity: 0;
        }
      }

      /* Text content */
      .text-content {
        margin-bottom: var(--space-6);
      }

      .celebration-title {
        font-size: var(--font-size-2xl);
        font-weight: var(--font-weight-bold);
        color: var(--color-text-primary);
        margin: 0 0 var(--space-3) 0;
        line-height: var(--line-height-tight);
      }

      .celebration-message {
        font-size: var(--font-size-base);
        color: var(--color-text-secondary);
        margin: 0;
        line-height: var(--line-height-relaxed);
      }

      /* Progress bar */
      .progress-container {
        width: 100%;
        height: 4px;
        background: var(--color-gray-200);
        border-radius: var(--radius-full);
        overflow: hidden;
        margin-bottom: var(--space-6);
      }

      .progress-bar {
        height: 100%;
        background: var(--gradient-primary);
        border-radius: var(--radius-full);
        animation: progress-shrink linear forwards;
        transform-origin: left;
      }

      .progress-bar--paused {
        animation-play-state: paused;
      }

      @keyframes progress-shrink {
        from {
          transform: scaleX(1);
        }
        to {
          transform: scaleX(0);
        }
      }

      /* Dismiss button */
      .dismiss-button {
        padding: var(--space-3) var(--space-6);
        background: var(--color-brand-primary);
        border: none;
        border-radius: var(--radius-full);
        color: white;
        font-size: var(--font-size-base);
        font-weight: var(--font-weight-semibold);
        cursor: pointer;
        transition: all var(--duration-fast);
        box-shadow: var(--shadow-brand-sm);
      }

      .dismiss-button:hover {
        background: var(--color-brand-primary-hover);
        transform: translateY(-2px);
        box-shadow: var(--shadow-brand-md);
      }

      .dismiss-button:focus-visible {
        outline: none;
        box-shadow: var(--shadow-focus-ring);
      }

      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .celebration-container,
        .celebration-content,
        .checkmark__circle,
        .checkmark__check,
        .confetti-piece,
        .pulse-ring {
          animation: none;
        }

        .checkmark__circle {
          stroke-dashoffset: 0;
        }

        .checkmark__check {
          stroke-dashoffset: 0;
        }

        .confetti-piece {
          display: none;
        }
      }
    `,
  ],
})
export class SuccessCelebrationComponent implements OnInit, OnDestroy {
  @ViewChild('celebrationContainer', { static: true })
  private container!: ElementRef<HTMLElement>;

  /**
   * Title text for the celebration
   * @default 'Success!'
   */
  @Input() title = 'Success!';

  /**
   * Message text describing the success
   */
  @Input() message?: string;

  /**
   * Whether to show confetti animation
   * @default true
   */
  @Input() showConfetti = true;

  /**
   * Whether to auto-dismiss after duration
   * @default true
   */
  @Input() autoDismiss = true;

  /**
   * Duration in milliseconds before auto-dismiss
   * @default 5000
   */
  @Input() duration = 5000;

  /**
   * Emitted when celebration is dismissed
   */
  @Output() dismissed = new EventEmitter<void>();

  confettiPieces: ConfettiPiece[] = [];
  isDismissing = false;
  isPaused = false;
  remainingTime = this.duration;
  hasTitleTemplate = false;
  hasMessageTemplate = false;

  private dismissTimer?: ReturnType<typeof setTimeout>;
  private progressInterval?: ReturnType<typeof setInterval>;

  private readonly confettiColors = [
    '#10b981', // success green
    '#3b82f6', // primary blue
    '#8b5cf6', // purple
    '#06b6d4', // cyan
    '#f59e0b', // amber
    '#ec4899', // pink
  ];

  ngOnInit(): void {
    this.generateConfetti();
    this.startDismissTimer();
  }

  ngOnDestroy(): void {
    this.clearTimers();
  }

  /**
   * Generate confetti pieces
   */
  private generateConfetti(): void {
    if (!this.showConfetti) return;

    const pieceCount = 30;
    this.confettiPieces = Array.from({ length: pieceCount }, (_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 200,
      y: (Math.random() - 0.5) * 100 - 50,
      rotation: Math.random() * 360,
      color: this.confettiColors[Math.floor(Math.random() * this.confettiColors.length)],
      size: Math.random() * 8 + 4,
      delay: Math.random() * 300,
    }));
  }

  /**
   * Start auto-dismiss timer
   */
  private startDismissTimer(): void {
    if (!this.autoDismiss) return;

    this.remainingTime = this.duration;

    // Update remaining time every 100ms
    this.progressInterval = setInterval(() => {
      if (!this.isPaused) {
        this.remainingTime -= 100;
        if (this.remainingTime <= 0) {
          this.remainingTime = 0;
        }
      }
    }, 100);

    // Auto dismiss after duration
    this.dismissTimer = setTimeout(() => {
      this.dismiss();
    }, this.duration);
  }

  /**
   * Pause the dismiss timer
   */
  pauseTimer(): void {
    this.isPaused = true;
  }

  /**
   * Resume the dismiss timer
   */
  resumeTimer(): void {
    this.isPaused = false;
  }

  /**
   * Dismiss the celebration
   */
  dismiss(): void {
    if (this.isDismissing) return;

    this.isDismissing = true;
    this.clearTimers();

    // Wait for animation to complete
    setTimeout(() => {
      this.dismissed.emit();
    }, 300);
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = undefined;
    }
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = undefined;
    }
  }
}
