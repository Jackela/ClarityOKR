/**
 * Button component with glow effects and ripple animations.
 *
 * @example
 * <clarityokr-button variant="primary" (onClick)="submit()">
 *   Submit
 * </clarityokr-button>
 */

import { CommonModule } from '@angular/common';
import type {
  ElementRef} from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
} from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Button component with enhanced visual effects and accessibility.
 */
@Component({
  selector: 'clarityokr-button',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      #buttonElement
      type="button"
      class="btn"
      [class.btn--primary]="variant === 'primary'"
      [class.btn--secondary]="variant === 'secondary'"
      [class.btn--danger]="variant === 'danger'"
      [class.btn--ghost]="variant === 'ghost'"
      [class.btn--sm]="size === 'sm'"
      [class.btn--md]="size === 'md'"
      [class.btn--lg]="size === 'lg'"
      [class.btn--loading]="loading"
      [class.btn--disabled]="disabled || loading"
      [disabled]="disabled || loading"
      [attr.aria-label]="ariaLabel"
      [attr.aria-describedby]="ariaDescribedBy"
      [attr.aria-pressed]="ariaPressed"
      [attr.aria-expanded]="ariaExpanded"
      [attr.aria-busy]="loading || ariaBusy"
      [attr.data-testid]="testId"
      (click)="handleClick($event)"
      (keydown)="onKeydown.emit($event)"
    >
      <!-- Loading spinner -->
      @if (loading) {
        <span class="btn__spinner" aria-hidden="true"></span>
      }

      <!-- Content -->
      <span class="btn__content" [class.btn__content--hidden]="loading">
        <ng-content></ng-content>
      </span>

      <!-- Ripple container -->
      <span class="btn__ripple-container" aria-hidden="true"></span>
    </button>
  `,
  styles: [
    `
      :host {
        display: inline-block;
      }

      .btn {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2);
        border: none;
        border-radius: var(--radius-full);
        font-family: var(--font-family-sans);
        font-weight: var(--font-weight-semibold);
        cursor: pointer;
        overflow: hidden;
        isolation: isolate;
        transition: all var(--duration-fast) var(--ease-out);
      }

      /* Focus styles */
      .btn:focus-visible {
        outline: none;
        box-shadow: var(--shadow-focus-ring);
      }

      /* Disabled state */
      .btn:disabled,
      .btn--disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }

      /* Loading state */
      .btn--loading {
        cursor: wait;
      }

      .btn__spinner {
        position: absolute;
        width: 20px;
        height: 20px;
        border: 2px solid transparent;
        border-top-color: currentColor;
        border-right-color: currentColor;
        border-radius: var(--radius-full);
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .btn__content--hidden {
        opacity: 0;
      }

      /* Sizes */
      .btn--sm {
        padding: var(--space-2) var(--space-4);
        font-size: var(--font-size-sm);
        min-height: 36px;
      }

      .btn--md {
        padding: var(--space-3) var(--space-5);
        font-size: var(--font-size-base);
        min-height: 44px;
      }

      .btn--lg {
        padding: var(--space-4) var(--space-6);
        font-size: var(--font-size-lg);
        min-height: 52px;
      }

      /* ========== PRIMARY VARIANT ========== */
      .btn--primary {
        background: var(--gradient-primary);
        color: white;
        box-shadow:
          var(--shadow-sm),
          0 4px 6px -1px rgba(37, 99, 235, 0.2);
      }

      /* Shine effect overlay */
      .btn--primary::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.25) 0%, transparent 50%);
        opacity: 0;
        transition: opacity var(--duration-fast);
        z-index: 1;
      }

      /* Glow effect on hover */
      .btn--primary::after {
        content: '';
        position: absolute;
        inset: -2px;
        background: var(--gradient-primary);
        border-radius: var(--radius-full);
        opacity: 0;
        filter: blur(12px);
        z-index: -1;
        transition: opacity var(--duration-fast);
      }

      .btn--primary:not(:disabled):hover {
        transform: translateY(-2px);
        box-shadow:
          var(--shadow-lg),
          0 0 30px rgba(37, 99, 235, 0.4);
      }

      .btn--primary:not(:disabled):hover::before {
        opacity: 1;
      }

      .btn--primary:not(:disabled):hover::after {
        opacity: 0.5;
      }

      .btn--primary:not(:disabled):active {
        transform: translateY(0);
        box-shadow: var(--shadow-sm);
      }

      .btn--primary:disabled {
        background: linear-gradient(
          135deg,
          rgba(37, 99, 235, 0.5) 0%,
          rgba(124, 58, 237, 0.5) 100%
        );
        box-shadow: none;
      }

      .btn--primary:disabled::after {
        display: none;
      }

      /* ========== SECONDARY VARIANT ========== */
      .btn--secondary {
        background: var(--color-brand-primary-alpha);
        color: var(--color-brand-primary-hover);
        border: 1px solid transparent;
      }

      .btn--secondary::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(37, 99, 235, 0.1) 0%, transparent 50%);
        opacity: 0;
        transition: opacity var(--duration-fast);
      }

      .btn--secondary:not(:disabled):hover {
        background: var(--color-brand-primary-alpha);
        border-color: var(--color-brand-primary-alpha);
        transform: translateY(-1px);
        box-shadow: var(--shadow-brand-sm);
      }

      .btn--secondary:not(:disabled):hover::before {
        opacity: 1;
      }

      .btn--secondary:not(:disabled):active {
        transform: translateY(0);
      }

      /* ========== DANGER VARIANT ========== */
      .btn--danger {
        background: var(--color-error);
        color: white;
        box-shadow: var(--shadow-sm);
      }

      .btn--danger::after {
        content: '';
        position: absolute;
        inset: -2px;
        background: var(--color-error);
        border-radius: var(--radius-full);
        opacity: 0;
        filter: blur(12px);
        z-index: -1;
        transition: opacity var(--duration-fast);
      }

      .btn--danger:not(:disabled):hover {
        background: var(--color-error-hover);
        transform: translateY(-2px);
        box-shadow:
          var(--shadow-lg),
          0 0 30px rgba(239, 68, 68, 0.4);
      }

      .btn--danger:not(:disabled):hover::after {
        opacity: 0.5;
      }

      .btn--danger:not(:disabled):active {
        transform: translateY(0);
      }

      /* ========== GHOST VARIANT ========== */
      .btn--ghost {
        background: transparent;
        color: var(--color-text-secondary);
        border: 1px solid var(--color-gray-200);
      }

      .btn--ghost:not(:disabled):hover {
        background: var(--color-gray-50);
        border-color: var(--color-gray-300);
        color: var(--color-text-primary);
        transform: translateY(-1px);
      }

      .btn--ghost:not(:disabled):active {
        transform: translateY(0);
        background: var(--color-gray-100);
      }

      /* ========== RIPPLE EFFECT ========== */
      .btn__ripple-container {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
        border-radius: inherit;
      }

      .ripple {
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.5);
        transform: scale(0);
        animation: ripple-animation 0.6s linear;
        pointer-events: none;
      }

      @keyframes ripple-animation {
        to {
          transform: scale(4);
          opacity: 0;
        }
      }

      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .btn,
        .btn::before,
        .btn::after {
          transition: none;
        }

        .btn:not(:disabled):hover {
          transform: none;
        }

        .ripple {
          animation: none;
          opacity: 0.3;
          transform: scale(2);
        }
      }
    `,
  ],
})
export class ButtonComponent {
  @ViewChild('buttonElement', { static: true })
  private buttonElement!: ElementRef<HTMLButtonElement>;

  /**
   * Visual style variant
   * @default 'primary'
   */
  @Input() variant: ButtonVariant = 'primary';

  /**
   * Button size
   * @default 'md'
   */
  @Input() size: ButtonSize = 'md';

  /**
   * Whether the button is disabled
   * @default false
   */
  @Input() disabled = false;

  /**
   * Whether the button is in loading state
   * @default false
   */
  @Input() loading = false;

  /**
   * Test ID for testing
   */
  @Input() testId?: string;

  /**
   * Accessible label for screen readers
   */
  @Input() ariaLabel?: string;

  /**
   * ID of element describing this button
   */
  @Input() ariaDescribedBy?: string;

  /**
   * For toggle buttons: current pressed state
   */
  @Input() ariaPressed?: boolean;

  /**
   * For expandable buttons: current expanded state
   */
  @Input() ariaExpanded?: boolean;

  /**
   * Whether the button is currently busy
   */
  @Input() ariaBusy?: boolean;

  /**
   * Emitted when button is clicked
   */
  @Output() onClick = new EventEmitter<MouseEvent>();

  /**
   * Emitted on keydown event
   */
  @Output() onKeydown = new EventEmitter<KeyboardEvent>();

  /**
   * Handle click with ripple effect
   */
  handleClick(event: MouseEvent): void {
    // Create ripple
    this.createRipple(event);

    // Emit click event
    this.onClick.emit(event);
  }

  /**
   * Create ripple animation at click position
   */
  private createRipple(event: MouseEvent): void {
    const button = this.buttonElement.nativeElement;
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;

    const ripple = document.createElement('span');
    ripple.classList.add('ripple');
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    const container = button.querySelector('.btn__ripple-container');
    if (container) {
      container.appendChild(ripple);

      // Remove ripple after animation
      setTimeout(() => {
        ripple.remove();
      }, 600);
    }
  }

  /**
   * Focus the button programmatically
   */
  focus(): void {
    this.buttonElement.nativeElement.focus();
  }

  /**
   * Blur the button programmatically
   */
  blur(): void {
    this.buttonElement.nativeElement.blur();
  }
}
