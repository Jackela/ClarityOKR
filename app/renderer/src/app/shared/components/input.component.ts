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
import { Component, Input, Output, EventEmitter, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

@Component({
  selector: 'clarityokr-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
        color: var(--color-text-muted);
        margin-bottom: var(--space-xs);
      }

      .input-wrapper {
        display: flex;
        flex-direction: column;
        gap: var(--space-xs);
      }

      .input {
        width: 100%;
        padding: var(--space-md) var(--space-lg);
        border-radius: var(--radius-lg);
        border: 1px solid var(--color-primary-alpha-25);
        font-size: var(--font-size-base);
        font-family: var(--font-family);
        background-color: var(--color-primary-light);
        color: var(--color-text);
        transition:
          border-color var(--transition-fast),
          box-shadow var(--transition-fast);
      }

      .input::placeholder {
        color: var(--color-text-placeholder);
      }

      .input:focus {
        outline: none;
        border-color: var(--color-primary-alpha-65);
        box-shadow: var(--shadow-ring);
      }

      .input--invalid {
        border-color: var(--color-error);
        background-color: var(--color-error-light);
      }

      .input--invalid:focus {
        box-shadow: 0 0 0 4px rgba(220, 38, 38, 0.12);
      }

      .input--disabled {
        background-color: var(--color-neutral-badge);
        cursor: not-allowed;
        opacity: 0.7;
      }

      .error-message {
        font-size: var(--font-size-sm);
        color: var(--color-error);
        margin-top: var(--space-xs);
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
