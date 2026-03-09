import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output } from '@angular/core';

import { SyncClarificationState } from '../services/sync-clarification-state.service';

@Component({
  selector: 'clarityokr-clarification-wizard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section>
      <!-- Loading indicator -->
      @if (state.isLoading()) {
        <p class="loading" data-testid="clarification-loading">正在加载下一步…</p>
      }

      <!-- Current prompt display -->
      @if (state.currentPrompt(); as prompt) {
        <h2 data-testid="prompt-question">{{ prompt.question }}</h2>

        @if (prompt.context) {
          <p class="context">{{ prompt.context }}</p>
        }

        <div class="option-grid" role="group" aria-label="Clarification options">
          @for (option of prompt.options; track option.id) {
            <button
              type="button"
              class="option"
              data-testid="clarification-option"
              (click)="onOptionSelect(option.id)"
            >
              <span class="option-label">{{ option.label }}</span>
              @if (option.description) {
                <small class="option-description">{{ option.description }}</small>
              }
            </button>
          }
        </div>

        @if (state.validationError()) {
          <p class="validation">{{ state.validationError() }}</p>
        }

        <button
          type="button"
          class="generate"
          data-testid="clarification-generate"
          [disabled]="!state.isReadyToGenerate()"
          [attr.data-ready]="state.isReadyToGenerate()"
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
          (click)="onGenerate()"
        >
          生成 OKR
        </button>
      }

      <!-- Error display -->
      @if (state.hasError()) {
        <div class="error-container" data-testid="error-message">
          <p class="error-text">{{ state.errorMessage() }}</p>
          <button type="button" class="retry" data-testid="retry-button" (click)="onRetry()">
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
        padding: 1rem;
      }
      .context {
        color: rgba(15, 23, 42, 0.7);
        margin-bottom: 1rem;
      }
      .option-grid {
        display: grid;
        gap: 0.75rem;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        margin: 1rem 0;
      }
      .option {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        padding: 0.75rem;
        border-radius: 0.75rem;
        border: 1px solid rgba(37, 99, 235, 0.25);
        background-color: rgba(37, 99, 235, 0.08);
        cursor: pointer;
        text-align: left;
        transition:
          transform 120ms ease,
          box-shadow 120ms ease;
      }
      .option:hover {
        transform: translateY(-1px);
        box-shadow: 0 8px 16px rgba(37, 99, 235, 0.1);
      }
      .option-label {
        font-weight: 600;
        color: #1d4ed8;
      }
      .option-description {
        margin-top: 0.25rem;
        color: rgba(30, 41, 59, 0.7);
      }
      .validation {
        color: #b91c1c;
        font-size: 0.9rem;
        margin-bottom: 1rem;
      }
      .loading {
        color: #0f766e;
        font-size: 0.9rem;
        margin-bottom: 0.5rem;
      }
      .error-container {
        background-color: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: 0.5rem;
        padding: 1rem;
        margin-bottom: 1rem;
      }
      .error-text {
        color: #b91c1c;
        font-size: 0.9rem;
        margin-bottom: 0.75rem;
      }
      .retry {
        padding: 0.5rem 1rem;
        border-radius: 0.5rem;
        background-color: #dc2626;
        color: #fff;
        border: none;
        cursor: pointer;
        font-size: 0.875rem;
      }
      .retry:hover {
        background-color: #b91c1c;
      }
      .generate {
        padding: 0.75rem 1.75rem;
        border-radius: 999px;
        background-color: #2563eb;
        color: #fff;
        border: none;
        cursor: pointer;
      }
      .generate:disabled {
        background-color: rgba(37, 99, 235, 0.35);
        cursor: not-allowed;
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const prompt = this.state.currentPrompt();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (prompt && prompt.id) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      this.state.recordSelection(prompt.id, optionId);
    }
    this.optionSelected.emit(optionId);
  }

  onGenerate(): void {
    this.generate.emit();
  }

  onRetry(): void {
    this.retry.emit();
  }
}
