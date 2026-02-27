import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { ClarificationPrompt } from '@clarityokr/contracts';

@Component({
  selector: 'clarityokr-clarification-wizard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section *ngIf="prompt">
      <h2 data-testid="prompt-question">{{ prompt.question }}</h2>
      <p class="context">{{ prompt.context }}</p>
      <p class="loading" *ngIf="loading" data-testid="clarification-loading">正在加载下一步…</p>
      <div class="option-grid" role="group" aria-label="Clarification options">
        <button
          type="button"
          class="option"
          data-testid="clarification-option"
          *ngFor="let option of prompt.options"
          (click)="optionSelected.emit(option.id)"
        >
          <span class="option-label">{{ option.label }}</span>
          <small *ngIf="option.description" class="option-description">{{
            option.description
          }}</small>
        </button>
      </div>
      <p class="validation" *ngIf="validationError">{{ validationError }}</p>
      <button
        type="button"
        class="generate"
        data-testid="clarification-generate"
        [disabled]="!isReadyToGenerate"
        (click)="generate.emit()"
      >
        生成 OKR
      </button>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        padding: var(--spacing-lg);
      }
      .context {
        color: var(--color-text-light);
        margin-bottom: var(--spacing-lg);
      }
      .option-grid {
        display: grid;
        gap: var(--spacing-md);
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        margin: var(--spacing-lg) 0;
      }
      .option {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        padding: var(--spacing-md);
        border-radius: var(--radius-md);
        border: 1px solid rgba(37, 99, 235, 0.25);
        background-color: var(--color-primary-light);
        cursor: pointer;
        text-align: left;
        transition:
          transform 120ms ease,
          box-shadow 120ms ease;
      }
      .option:hover {
        transform: translateY(-1px);
        box-shadow: var(--shadow-option-hover);
      }
      .option-label {
        font-weight: 600;
        color: var(--color-primary-dark);
      }
      .option-description {
        margin-top: var(--spacing-xs);
        color: var(--color-text-light);
      }
      .validation {
        color: var(--color-error);
        font-size: var(--font-size-base);
        margin-bottom: var(--spacing-lg);
      }
      .loading {
        color: var(--color-success);
        font-size: var(--font-size-base);
        margin-bottom: var(--spacing-sm);
      }
      .generate {
        padding: var(--spacing-md) 1.75rem;
        border-radius: var(--radius-full);
        background-color: var(--color-primary);
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
  @Input() prompt: ClarificationPrompt | null = null;
  @Input() isReadyToGenerate = false;
  @Input() validationError: string | null = null;
  @Input() loading = false;

  @Output() readonly optionSelected = new EventEmitter<string>();
  @Output() readonly generate = new EventEmitter<void>();
}
