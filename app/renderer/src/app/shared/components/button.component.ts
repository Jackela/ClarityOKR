/*
 * Button Component - ClarityOKR Design System
 * -------------------------------------------
 * Reusable button component with multiple variants.
 *
 * Usage:
 *   <clarityokr-button>Default</clarityokr-button>
 *   <clarityokr-button variant="primary">Primary</clarityokr-button>
 *   <clarityokr-button variant="secondary">Secondary</clarityokr-button>
 *   <clarityokr-button variant="danger">Danger</clarityokr-button>
 *   <clarityokr-button [disabled]="true">Disabled</clarityokr-button>
 */

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'clarityokr-button',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="btn"
      [class.btn--primary]="variant === 'primary'"
      [class.btn--secondary]="variant === 'secondary'"
      [class.btn--danger]="variant === 'danger'"
      [class.btn--ghost]="variant === 'ghost'"
      [class.btn--sm]="size === 'sm'"
      [class.btn--md]="size === 'md'"
      [class.btn--lg]="size === 'lg'"
      [disabled]="disabled"
      [attr.aria-label]="ariaLabel"
      [attr.aria-describedby]="ariaDescribedBy"
      [attr.aria-pressed]="ariaPressed"
      [attr.aria-expanded]="ariaExpanded"
      [attr.aria-busy]="ariaBusy"
      [attr.data-testid]="testId"
      (click)="onClick.emit($event)"
      (keydown)="onKeydown.emit($event)"
    >
      <ng-content></ng-content>
    </button>
  `,
  styles: [
    `
      :host {
        display: inline-block;
      }

      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-xs);
        border: none;
        border-radius: var(--radius-full);
        font-family: var(--font-family);
        font-weight: var(--font-weight-semibold);
        cursor: pointer;
        transition:
          transform var(--transition-fast),
          box-shadow var(--transition-fast),
          background-color var(--transition-fast);
      }

      .btn:focus-visible {
        outline: none;
        box-shadow: var(--shadow-ring);
      }

      .btn:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }

      /* Sizes */
      .btn--sm {
        padding: var(--space-sm) var(--space-lg);
        font-size: var(--font-size-sm);
      }

      .btn--md {
        padding: var(--space-md) var(--space-xl);
        font-size: var(--font-size-base);
      }

      .btn--lg {
        padding: var(--space-lg) var(--space-2xl);
        font-size: var(--font-size-lg);
      }

      /* Variants */
      .btn--primary {
        background: linear-gradient(
          135deg,
          var(--color-primary) 0%,
          var(--color-accent-purple) 100%
        );
        color: var(--color-surface);
        box-shadow: var(--shadow-xs);
      }

      .btn--primary:not(:disabled):hover {
        transform: translateY(-1px);
        box-shadow: var(--shadow-lg);
      }

      .btn--primary:disabled {
        background: rgba(37, 99, 235, 0.35);
        box-shadow: none;
      }

      .btn--secondary {
        background: var(--color-primary-light);
        color: var(--color-primary-hover);
      }

      .btn--secondary:not(:disabled):hover {
        background: var(--color-primary-light-hover);
      }

      .btn--danger {
        background: var(--color-error);
        color: var(--color-surface);
      }

      .btn--danger:not(:disabled):hover {
        background: var(--color-error-hover);
      }

      .btn--ghost {
        background: transparent;
        color: var(--color-text-muted);
      }

      .btn--ghost:not(:disabled):hover {
        background: var(--color-primary-light);
        color: var(--color-primary-hover);
      }
    `,
  ],
})
export class ButtonComponent {
  @Input() variant: ButtonVariant = 'primary';
  @Input() size: ButtonSize = 'md';
  @Input() disabled = false;
  @Input() testId?: string;
  @Input() ariaLabel?: string;
  @Input() ariaDescribedBy?: string;
  @Input() ariaPressed?: boolean;
  @Input() ariaExpanded?: boolean;
  @Input() ariaBusy?: boolean;
  @Output() onClick = new EventEmitter<MouseEvent>();
  @Output() onKeydown = new EventEmitter<KeyboardEvent>();
}
