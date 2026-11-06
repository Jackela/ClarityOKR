/*
 * Progress Indicator Component - ClarityOKR UX Enhancement
 * --------------------------------------------------------
 * Visual progress indicator for multi-step processes.
 *
 * Features:
 * - Step counter display (e.g., "Step 2 of 5")
 * - Visual progress bar with smooth animations
 * - Responsive to state changes
 * - Accessible with proper ARIA attributes
 *
 * Accessibility:
 * - role="progressbar" for semantic meaning
 * - aria-valuenow, aria-valuemin, aria-valuemax for screen readers
 * - aria-label for context
 *
 * Usage:
 *   <clarityokr-progress-indicator
 *     [current]="currentStep"
 *     [total]="totalSteps"
 *     label="Question">
 *   </clarityokr-progress-indicator>
 */

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Progress indicator for showing completion status.
 * Displays both numeric counter and visual progress bar.
 */
@Component({
  selector: 'clarityokr-progress-indicator',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="progress-container"
      role="progressbar"
      [attr.aria-label]="label + ' progress'"
      [attr.aria-valuenow]="complete ? total : current"
      [attr.aria-valuemin]="1"
      [attr.aria-valuemax]="total"
    >
      <!-- #123 S3§12.9: counter omitted from DOM on ready (not visibility/opacity) -->
      @if (showCounter) {
        <span class="progress-counter"> {{ label }} {{ current }} / {{ total }} </span>
      }

      <!-- Progress bar (keeps height/radius; on ready moves up into the counter row spot) -->
      <div class="progress-bar" aria-hidden="true">
        <div
          class="progress-fill"
          [style.width.%]="calculatePercentage()"
          [class.progress-fill--complete]="complete"
        ></div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .progress-container {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        margin-bottom: var(--space-6);
      }

      /* Step counter text */
      .progress-counter {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-secondary);
        text-transform: uppercase;
        letter-spacing: var(--letter-spacing-wide);
      }

      /* Progress bar track */
      .progress-bar {
        width: 100%;
        height: 6px;
        background: var(--color-bg-tertiary);
        border-radius: var(--radius-full);
        overflow: hidden;
        position: relative;
      }

      /* Progress fill */
      .progress-fill {
        height: 100%;
        background: var(--gradient-primary);
        border-radius: var(--radius-full);
        transition: width var(--duration-smooth) cubic-bezier(0.22, 1, 0.36, 1);
        position: relative;
      }

      /* No width animation when jumping to the ready full bar (#123 S3§12.9) */
      .progress-fill--complete {
        transition: none;
      }

      /* Glow effect on the leading edge */
      .progress-fill::after {
        content: '';
        position: absolute;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        width: 8px;
        height: 8px;
        background: var(--color-brand-primary);
        border-radius: var(--radius-full);
        box-shadow: 0 0 10px var(--color-brand-primary);
        opacity: 0;
        transition: opacity var(--duration-fast);
      }

      [data-theme='dark'] .progress-fill::after {
        box-shadow: 0 0 12px var(--color-brand-primary);
      }

      .progress-fill:not(.progress-fill--complete)::after {
        opacity: 1;
      }

      /* Complete state — full green gradient */
      .progress-fill--complete {
        background: var(--gradient-success);
      }

      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .progress-fill {
          transition: none;
        }
      }
    `,
  ],
})
export class ProgressIndicatorComponent {
  /** Current step number (1-based), the question on screen. */
  @Input({ required: true }) current!: number;

  /** Total number of steps. */
  @Input({ required: true }) total!: number;

  /**
   * Label prefix for the counter (e.g., "Question", "Step")
   * @default 'Step'
   */
  @Input() label: string = 'Step';

  /**
   * When false, the 「n / total」 row is not rendered (#123 ready screen).
   * @default true
   */
  @Input() showCounter = true;

  /**
   * When true, bar is full with the green complete gradient (ready-to-generate).
   * Question pages leave this false so the last open question stays answered/total.
   */
  @Input() complete = false;

  /**
   * Bar width = answered / total. `current` is the question on screen (1-based);
   * answered count is current − 1 while that question is still open.
   */
  calculatePercentage(): number {
    if (this.total <= 0) return 0;
    if (this.complete) return 100;
    return Math.max(0, Math.min(100, ((this.current - 1) / this.total) * 100));
  }
}
