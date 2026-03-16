/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents */
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';

import { SyncClarificationState } from '../services/sync-clarification-state.service';

@Component({
  selector: 'clarityokr-clarification-wizard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section aria-label="目标澄清向导">
      <!-- Live region for loading status -->
      <div aria-live="polite" aria-atomic="true" class="sr-only">
        @if (state.isLoading()) {
          正在加载下一步
        }
      </div>

      <!-- Loading indicator -->
      @if (state.isLoading()) {
        <p class="loading" data-testid="clarification-loading" role="status" aria-busy="true">
          正在加载下一步…
        </p>
      }

      <!-- Current prompt display -->
      @if (state.currentPrompt(); as prompt) {
        <h2 data-testid="prompt-question" id="prompt-question">{{ prompt.question }}</h2>

        @if (prompt.context) {
          <p class="context" id="prompt-context">{{ prompt.context }}</p>
        }

        <div
          class="option-grid"
          role="radiogroup"
          [attr.aria-labelledby]="'prompt-question'"
          [attr.aria-describedby]="prompt.context ? 'prompt-context' : null"
        >
          @for (option of prompt.options; track option.id) {
            <button
              type="button"
              class="option"
              data-testid="clarification-option"
              role="radio"
              [attr.aria-label]="
                option.label + (option.description ? '：' + option.description : '')
              "
              (click)="onOptionSelect(option.id)"
              (keydown)="onOptionKeydown($event, option.id)"
            >
              <span class="option-label">{{ option.label }}</span>
              @if (option.description) {
                <small class="option-description">{{ option.description }}</small>
              }
            </button>
          }
        </div>

        @if (state.validationError(); as validationError) {
          <p class="validation" role="alert" id="validation-error">{{ validationError }}</p>
        }

        <button
          type="button"
          class="generate"
          data-testid="clarification-generate"
          [disabled]="!state.isReadyToGenerate()"
          [attr.data-ready]="state.isReadyToGenerate()"
          [attr.aria-describedby]="state.validationError() ? 'validation-error' : null"
          (click)="onGenerate()"
        >
          生成 OKR
        </button>
      }

      <!-- Generate button when ready but no prompt (error state with selections) -->
      @if (state.isReadyToGenerate() && !state.currentPrompt()) {
        <button
          type="button"
          class="generate"
          data-testid="clarification-generate"
          [disabled]="false"
          [attr.data-ready]="true"
          [attr.aria-label]="'生成 OKR - 已准备好'"
          (click)="onGenerate()"
        >
          生成 OKR
        </button>
      }

      <!-- Error display -->
      @if (state.hasError()) {
        <div class="error-container" data-testid="error-message" role="alert" aria-live="assertive">
          <p class="error-text">{{ state.errorMessage() }}</p>
          <button
            type="button"
            class="retry"
            data-testid="retry-button"
            aria-label="重试加载澄清问题"
            (click)="onRetry()"
          >
            重试
          </button>
        </div>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        padding: var(--space-lg);
      }
      .context {
        color: var(--color-text-muted-alt);
        margin-bottom: var(--space-lg);
      }
      .option-grid {
        display: grid;
        gap: var(--space-md);
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        margin: var(--space-lg) 0;
      }
      .option {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        padding: var(--space-md);
        border-radius: var(--radius-md);
        border: 1px solid var(--color-primary-alpha-25);
        background-color: var(--color-primary-light);
        cursor: pointer;
        text-align: left;
        transition:
          transform var(--transition-fast),
          box-shadow var(--transition-fast);
      }
      .option:hover {
        transform: translateY(-1px);
        box-shadow: var(--shadow-md);
      }

      .option:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
        box-shadow: var(--shadow-ring);
      }
      .option-label {
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-primary);
      }
      .option-description {
        margin-top: var(--space-xs);
        color: var(--color-text-muted-alt);
      }
      .validation {
        color: var(--color-error-hover);
        font-size: var(--font-size-md);
        margin-bottom: var(--space-lg);
      }
      .loading {
        color: var(--color-success);
        font-size: var(--font-size-md);
        margin-bottom: var(--space-sm);
      }
      .error-container {
        background-color: var(--color-error-light);
        border: 1px solid var(--color-error-alpha-30);
        border-radius: var(--radius-sm);
        padding: var(--space-lg);
        margin-bottom: var(--space-lg);
      }
      .error-text {
        color: var(--color-error-hover);
        font-size: var(--font-size-md);
        margin-bottom: var(--space-md);
      }
      .retry {
        padding: var(--space-sm) var(--space-lg);
        border-radius: var(--radius-sm);
        background-color: var(--color-error);
        color: var(--color-surface);
        border: none;
        cursor: pointer;
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-semibold);
        transition: background-color var(--transition-fast);
      }
      .retry:hover {
        background-color: var(--color-error-hover);
      }

      .retry:focus-visible {
        outline: 2px solid var(--color-error);
        outline-offset: 2px;
      }

      .generate {
        padding: var(--space-md) var(--space-2xl);
        border-radius: var(--radius-full);
        background-color: var(--color-primary);
        color: var(--color-surface);
        border: none;
        cursor: pointer;
        font-weight: var(--font-weight-semibold);
        transition:
          background-color var(--transition-fast),
          transform var(--transition-fast);
      }
      .generate:not(:disabled):hover {
        background-color: var(--color-primary-hover);
        transform: translateY(-1px);
      }
      .generate:disabled {
        background-color: rgba(37, 99, 235, 0.35);
        cursor: not-allowed;
      }

      .generate:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
      }

      /* Screen reader only class */
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      /* Responsive styles */
      @media (max-width: 768px) {
        :host {
          padding: var(--space-md);
        }

        .option-grid {
          grid-template-columns: 1fr;
          gap: var(--space-sm);
        }

        .option {
          padding: var(--space-lg);
        }

        .generate {
          width: 100%;
          padding: var(--space-md) var(--space-lg);
        }

        .error-container {
          padding: var(--space-md);
        }
      }

      @media (max-width: 640px) {
        h2 {
          font-size: var(--font-size-lg);
        }

        .option {
          padding: var(--space-md);
        }

        .option-label {
          font-size: var(--font-size-base);
        }

        .option-description {
          font-size: var(--font-size-xs);
        }

        .context {
          font-size: var(--font-size-sm);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .option,
        .retry,
        .generate {
          transition: none;
        }

        .option:hover {
          transform: none;
        }
      }
    `,
  ],
})
export class ClarificationWizardComponent {
  @Output() readonly optionSelected = new EventEmitter<string>();
  @Output() readonly generate = new EventEmitter<void>();
  @Output() readonly retry = new EventEmitter<void>();

  constructor(public readonly state: SyncClarificationState) {}

  onOptionSelect(optionId: string): void {
    const prompt = this.state.currentPrompt();
    if (prompt?.id) {
      this.state.recordSelection(prompt.id, optionId);
    }
    this.optionSelected.emit(optionId);
  }

  onOptionKeydown(event: KeyboardEvent, optionId: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onOptionSelect(optionId);
    }
  }

  onGenerate(): void {
    this.generate.emit();
  }

  onRetry(): void {
    this.retry.emit();
  }
}
