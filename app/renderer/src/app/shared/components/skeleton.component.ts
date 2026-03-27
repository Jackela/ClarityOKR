/*
 * Skeleton Loading Component - ClarityOKR UX Enhancement
 * ------------------------------------------------------
 * Skeleton placeholder for content loading states.
 * Provides visual feedback during data fetching.
 *
 * Features:
 * - Multiple skeleton types (text, card, circle, options)
 * - Shimmer animation for perceived performance
 * - Accessible with aria-busy and aria-label
 * - Responsive to container width
 *
 * Accessibility:
 * - aria-busy="true" indicates loading state
 * - aria-label describes what's loading
 * - Removed from accessibility tree when complete
 *
 * Usage:
 *   <!-- Text skeleton -->
 *   <clarityokr-skeleton type="text" [lines]="3"></clarityokr-skeleton>
 *
 *   <!-- Option cards skeleton -->
 *   <clarityokr-skeleton type="options" [count]="4"></clarityokr-skeleton>
 *
 *   <!-- Circle skeleton for avatars/icons -->
 *   <clarityokr-skeleton type="circle" size="40"></clarityokr-skeleton>
 */

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Available skeleton types for different content shapes
 */
export type SkeletonType = 'text' | 'card' | 'circle' | 'options' | 'custom';

/**
 * Skeleton loading placeholder component.
 * Displays animated placeholder while content loads.
 */
@Component({
  selector: 'clarityokr-skeleton',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="skeleton-container"
      role="status"
      aria-busy="true"
      [attr.aria-label]="ariaLabel || 'Loading content'"
    >
      @switch (type) {
        @case ('text') {
          @for (line of linesArray; track $index) {
            <div
              class="skeleton-line"
              [class.skeleton-line--last]="$index === linesArray.length - 1"
              [style.width.%]="$index === linesArray.length - 1 ? lastLineWidth : 100"
            ></div>
          }
        }

        @case ('card') {
          <div class="skeleton-card">
            <div class="skeleton-card__header"></div>
            <div class="skeleton-card__content">
              @for (line of linesArray; track $index) {
                <div class="skeleton-line"></div>
              }
            </div>
          </div>
        }

        @case ('circle') {
          <div class="skeleton-circle" [style.width.px]="size" [style.height.px]="size"></div>
        }

        @case ('options') {
          <div class="skeleton-options">
            @for (option of optionsArray; track $index) {
              <div class="skeleton-option-card">
                <div class="skeleton-option-card__icon"></div>
                <div class="skeleton-option-card__content">
                  <div class="skeleton-line skeleton-line--short"></div>
                  <div class="skeleton-line skeleton-line--medium"></div>
                </div>
              </div>
            }
          </div>
        }

        @case ('custom') {
          <ng-content></ng-content>
        }
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .skeleton-container {
        width: 100%;
      }

      /* Base shimmer animation */
      .skeleton-line,
      .skeleton-circle,
      .skeleton-card,
      .skeleton-option-card {
        background: linear-gradient(
          90deg,
          var(--color-gray-100) 0%,
          var(--color-gray-200) 50%,
          var(--color-gray-100) 100%
        );
        background-size: 200% 100%;
        animation: shimmer 1.5s ease-in-out infinite;
        border-radius: var(--radius-md);
      }

      @keyframes shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }

      /* Text skeleton */
      .skeleton-line {
        height: 1rem;
        margin-bottom: var(--space-3);
      }

      .skeleton-line--last {
        margin-bottom: 0;
      }

      .skeleton-line--short {
        width: 60%;
      }

      .skeleton-line--medium {
        width: 80%;
      }

      /* Card skeleton */
      .skeleton-card {
        padding: var(--space-5);
        background: var(--color-bg-surface);
        border: 1px solid var(--color-gray-200);
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow-sm);
      }

      .skeleton-card__header {
        height: 1.5rem;
        width: 40%;
        margin-bottom: var(--space-4);
        background: inherit;
        border-radius: var(--radius-md);
        animation: inherit;
      }

      .skeleton-card__content {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      /* Circle skeleton */
      .skeleton-circle {
        border-radius: var(--radius-full);
        flex-shrink: 0;
      }

      /* Options skeleton (for clarification wizard) */
      .skeleton-options {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
      }

      .skeleton-option-card {
        display: flex;
        align-items: center;
        gap: var(--space-4);
        padding: var(--space-5);
        background: var(--color-bg-surface);
        border: 1px solid var(--color-gray-200);
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow-sm);
      }

      .skeleton-option-card__icon {
        width: 40px;
        height: 40px;
        border-radius: var(--radius-lg);
        background: inherit;
        animation: inherit;
        flex-shrink: 0;
      }

      .skeleton-option-card__content {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .skeleton-option-card__content .skeleton-line {
        margin-bottom: 0;
        height: 0.875rem;
      }

      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .skeleton-line,
        .skeleton-circle,
        .skeleton-card,
        .skeleton-option-card {
          animation: none;
          background: var(--color-gray-100);
        }
      }
    `,
  ],
})
export class SkeletonComponent {
  /**
   * Skeleton type variant
   * @default 'text'
   */
  @Input() type: SkeletonType = 'text';

  /**
   * Number of lines for text type
   * @default 3
   */
  @Input() lines: number = 3;

  /**
   * Number of options for options type
   * @default 3
   */
  @Input() count: number = 3;

  /**
   * Size in pixels for circle type
   * @default 40
   */
  @Input() size: number = 40;

  /**
   * Accessible label describing what's loading
   */
  @Input() ariaLabel?: string;

  /**
   * Width percentage for the last line (creates staggered effect)
   * @default 60
   */
  @Input() lastLineWidth: number = 60;

  /**
   * Get array for *ngFor iteration
   */
  get linesArray(): number[] {
    return Array(this.lines)
      .fill(0)
      .map((_, i) => i);
  }

  /**
   * Get array for options iteration
   */
  get optionsArray(): number[] {
    return Array(this.count)
      .fill(0)
      .map((_, i) => i);
  }
}
