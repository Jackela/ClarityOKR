/**
 * Button component with glow effects and ripple animations.
 *
 * @example
 * <clarityokr-button variant="primary" (onClick)="submit()">
 *   Submit
 * </clarityokr-button>
 */

import { CommonModule } from '@angular/common';
import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';

import { buttonStyles } from './button.component.styles.js';
import type { ButtonSize, ButtonVariant } from './button.component.types.js';
import { createRipple } from './button.component.utils.js';

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
  styles: buttonStyles,
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
    if (this.disabled || this.loading) {
      return;
    }

    createRipple(this.buttonElement.nativeElement, event);
    this.onClick.emit(event);
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
