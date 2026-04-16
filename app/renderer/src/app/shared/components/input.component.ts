/*
 * Input Component - ClarityOKR Design System
 * ------------------------------------------
 * Reusable input component with consistent styling.
 *
 * Usage:
 *   <clarityokr-input
 *     [(value)]="inputValue"
 *     placeholder="Enter text">
 *   </clarityokr-input>
 *
 *   <clarityokr-input
 *     [disabled]="true"
 *     [invalid]="hasError">
 *   </clarityokr-input>
 */

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  Output,
  EventEmitter,
  forwardRef,
} from '@angular/core';
import { NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';
import type { ControlValueAccessor } from '@angular/forms';

@Component({
  selector: 'clarityokr-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="input-wrapper">
      @if (label) {
        <label class="input-label" [attr.for]="inputId">{{ label }}</label>
      }
      <input
        [id]="inputId"
        type="text"
        class="input"
        [class.input--invalid]="invalid"
        [class.input--disabled]="disabled"
        [value]="value"
        [placeholder]="placeholder"
        [disabled]="disabled"
        [attr.aria-invalid]="invalid"
        [attr.aria-describedby]="errorId"
        [attr.aria-label]="ariaLabel"
        [attr.aria-required]="required"
        [attr.data-testid]="testId"
        (input)="onInput($event)"
        (blur)="onBlur()"
        (keydown)="onKeydown.emit($event)"
      />
      @if (invalid && errorMessage) {
        <span [id]="errorId" class="error-message" role="alert" aria-live="assertive">{{
          errorMessage
        }}</span>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .input-label {
        display: block;
        font-weight: var(--font-weight-medium);
        font-size: var(--font-size-sm);
        color: var(--color-text-secondary);
        margin-bottom: var(--space-2);
      }

      .input-wrapper {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }

      .input {
        width: 100%;
        min-height: 48px;
        padding: var(--space-3) var(--space-4);
        border-radius: var(--radius-lg);
        border: 1px solid var(--color-border);
        font-size: var(--font-size-base);
        font-family: var(--font-family-sans);
        background-color: var(--color-bg-primary);
        color: var(--color-text-primary);
        transition:
          border-color var(--duration-fast) var(--ease-snappy),
          box-shadow var(--duration-fast) var(--ease-snappy),
          background-color var(--duration-fast) var(--ease-snappy);
      }

      .input::placeholder {
        color: var(--color-text-placeholder);
      }

      .input:focus {
        outline: none;
        border-color: var(--color-brand-primary);
        box-shadow: var(--shadow-focus-ring);
      }

      .input--invalid {
        border-color: var(--color-error);
        background-color: var(--color-error-light);
      }

      .input--invalid:focus {
        box-shadow: var(--shadow-focus-ring-error);
      }

      .input--disabled {
        background-color: var(--color-bg-secondary);
        cursor: not-allowed;
        opacity: 0.6;
      }

      .error-message {
        font-size: var(--font-size-sm);
        color: var(--color-error);
        margin-top: var(--space-2);
      }
    `,
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => InputComponent),
      multi: true,
    },
  ],
})
export class InputComponent implements ControlValueAccessor {
  @Input() placeholder = '';
  @Input() disabled = false;
  @Input() invalid = false;
  @Input() errorMessage = '';
  @Input() testId?: string;
  @Input() label = '';
  @Input() ariaLabel?: string;
  @Input() required = false;
  @Output() onKeydown = new EventEmitter<KeyboardEvent>();

  value = '';
  inputId = `input-${Math.random().toString(36).substr(2, 9)}`;
  errorId = `error-${Math.random().toString(36).substr(2, 9)}`;

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  onInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.value = target.value;
    this.onChange(this.value);
  }

  onBlur(): void {
    this.onTouched();
  }

  writeValue(value: string): void {
    this.value = value || '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
