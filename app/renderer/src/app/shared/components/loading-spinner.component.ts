/**
 * Loading indicator with accessibility support.
 *
 * @example
 * <clarityokr-loading-spinner size="md" message="Loading..." />
 */

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { I18nService } from '../services/i18n.service.js';
import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { I18nService } from '../services/i18n.service.js';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Available spinner sizes
 */
export type SpinnerSize = 'sm' | 'md' | 'lg';

/**
 * Loading spinner component for indicating ongoing operations.
 * Uses primary brand color to avoid semantic confusion with success states.
 */
@Component({
  selector: 'clarityokr-loading-spinner',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="spinner-container"
      [class.spinner-container--inline]="!message"
      role="status"
      aria-live="polite"
      [attr.aria-busy]="true"
      [attr.aria-label]="ariaLabel || i18n.translate('loading.ariaLabel')"
    >
      <div
        class="spinner"
        [class.spinner--sm]="size === 'sm'"
        [class.spinner--md]="size === 'md'"
        [class.spinner--lg]="size === 'lg'"
      >
        <div class="spinner__track"></div>
        <div class="spinner__indicator"></div>
      </div>
      @if (message) {
        <span class="spinner__message">{{ message }}</span>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .spinner-container {
        display: flex;
        align-items: center;
        gap: var(--space-md);
        /* FIXED: Use primary brand color instead of success green */
        color: var(--color-brand-primary);
      }

      .spinner-container--inline {
        display: inline-flex;
      }

      .spinner {
        position: relative;
        flex-shrink: 0;
      }

      /* Modern dual-ring spinner design */
      .spinner__track,
      .spinner__indicator {
        position: absolute;
        top: 0;
        left: 0;
        border-radius: var(--radius-full);
        border-style: solid;
      }

      /* Background track */
      .spinner__track {
        border-color: var(--color-brand-primary-alpha);
      }

      /* Animated indicator */
      .spinner__indicator {
        border-color: transparent;
        border-top-color: currentColor;
        border-right-color: currentColor;
        animation: spinner-rotate var(--duration-normal) linear infinite;
      }

      /* Size variants */
      .spinner--sm {
        width: 16px;
        height: 16px;
      }

      .spinner--sm .spinner__track,
      .spinner--sm .spinner__indicator {
        width: 16px;
        height: 16px;
        border-width: 2px;
      }

      .spinner--md {
        width: 24px;
        height: 24px;
      }

      .spinner--md .spinner__track,
      .spinner--md .spinner__indicator {
        width: 24px;
        height: 24px;
        border-width: 2px;
      }

      .spinner--lg {
        width: 32px;
        height: 32px;
      }

      .spinner--lg .spinner__track,
      .spinner--lg .spinner__indicator {
        width: 32px;
        height: 32px;
        border-width: 3px;
      }

      /* Message text */
      .spinner__message {
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        font-weight: var(--font-weight-medium);
      }

      /* Animation */
      @keyframes spinner-rotate {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }

      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .spinner__indicator {
          animation: none;
          border-color: currentColor;
          opacity: 0.5;
        }
      }
    `,
  ],
})
export class LoadingSpinnerComponent {
  /**
   * Spinner size variant
   * @default 'md'
   */
  @Input() size: SpinnerSize = 'md';

  /**
   * Optional loading message to display next to spinner
   */
  @Input() message?: string;

  /**
   * Accessible label for screen readers
   * Defaults to 'Loading' if not provided
   */
  /**
   * Accessible label for screen readers
   * Defaults to translated 'Loading' if not provided
   */
  @Input() ariaLabel?: string;

  /** I18n service for translations */
  protected readonly i18n = inject(I18nService);
}
