/*
 * Loading Spinner Component - ClarityOKR Design System
 * ---------------------------------------------------
 * Reusable loading indicator component.
 *
 * Usage:
 *   <clarityokr-loading-spinner></clarityokr-loading-spinner>
 *   <clarityokr-loading-spinner size="lg" message="Loading..."></clarityokr-loading-spinner>
 */

import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

export type SpinnerSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'clarityokr-loading-spinner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="spinner-container" [class.spinner-container--inline]="!message">
      <div
        class="spinner"
        [class.spinner--sm]="size === 'sm'"
        [class.spinner--md]="size === 'md'"
        [class.spinner--lg]="size === 'lg'"
        role="status"
        aria-label="Loading"
      >
        <div class="spinner__circle"></div>
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
        color: var(--color-success);
        font-size: var(--font-size-md);
      }

      .spinner-container--inline {
        display: inline-flex;
      }

      .spinner {
        position: relative;
      }

      .spinner__circle {
        border-radius: 50%;
        border: 2px solid transparent;
        border-top-color: currentColor;
        border-right-color: currentColor;
        animation: spin 0.8s linear infinite;
      }

      /* Sizes */
      .spinner--sm .spinner__circle {
        width: 16px;
        height: 16px;
      }

      .spinner--md .spinner__circle {
        width: 24px;
        height: 24px;
      }

      .spinner--lg .spinner__circle {
        width: 32px;
        height: 32px;
        border-width: 3px;
      }

      .spinner__message {
        font-size: var(--font-size-sm);
        color: var(--color-success);
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class LoadingSpinnerComponent {
  @Input() size: SpinnerSize = 'md';
  @Input() message?: string;
}
