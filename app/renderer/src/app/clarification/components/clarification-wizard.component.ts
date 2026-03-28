/**
 * Multi-step wizard for OKR clarification process.
 *
 * @example
 * <clarityokr-clarification-wizard
 *   (optionSelected)="onSelect($event)"
 *   (generate)="onGenerate()"
 *   (goBack)="onBack()">
 * </clarityokr-clarification-wizard>
 */

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Output,
} from '@angular/core';

import { ProgressIndicatorComponent } from '../../shared/components/progress-indicator.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { SyncClarificationState } from '../services/sync-clarification-state.service';

@Component({
  selector: 'clarityokr-clarification-wizard',
  standalone: true,
  imports: [CommonModule, ProgressIndicatorComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./clarification-wizard.component.scss'],
  template: `
    <section
      class="wizard-container"
      aria-label="目标澄清向导"
      [attr.aria-busy]="state.isLoading()"
    >
      <!-- Progress Indicator -->
      @if (state.history().length > 0 || state.currentPrompt()) {
        <clarityokr-progress-indicator
          [current]="state.history().length + (state.currentPrompt() ? 1 : 0)"
          [total]="estimatedTotalSteps"
          label="问题"
        ></clarityokr-progress-indicator>
      }

      <!-- Back Button -->
      @if (state.history().length > 0) {
        <button type="button" class="back-button" (click)="goBack.emit()" aria-label="返回上一步">
          <span aria-hidden="true">←</span> 返回
        </button>
      }

      <!-- Live region for loading status -->
      <div
        aria-live="polite"
        aria-atomic="true"
        class="sr-only"
        [attr.aria-hidden]="!state.isLoading()"
      >
        @if (state.isLoading()) {
          正在加载下一步
        }
      </div>

      <!-- Skeleton Loading State -->
      @if (state.isLoading()) {
        <div class="loading-container" role="status" aria-label="加载中">
          <clarityokr-skeleton
            type="text"
            [lines]="2"
            [lastLineWidth]="60"
            ariaLabel="加载问题"
          ></clarityokr-skeleton>
          <div class="skeleton-spacing"></div>
          <clarityokr-skeleton
            type="options"
            [count]="3"
            ariaLabel="加载选项"
          ></clarityokr-skeleton>
        </div>
      }

      <!-- Current prompt display -->
      @if (state.currentPrompt(); as prompt) {
        <article class="prompt-container">
          <header class="prompt-header">
            <h2 class="prompt-question" data-testid="prompt-question" id="prompt-question">
              {{ prompt.question }}
            </h2>
            @if (prompt.context) {
              <p class="prompt-context" id="prompt-context">{{ prompt.context }}</p>
            }
          </header>

          <div
            class="option-grid"
            role="radiogroup"
            [attr.aria-labelledby]="'prompt-question'"
            [attr.aria-describedby]="prompt.context ? 'prompt-context' : null"
          >
            @for (option of prompt.options; track option.id; let i = $index) {
              <button
                type="button"
                class="option-card"
                [class.option-card--selected]="state.currentSelection() === option.id"
                data-testid="clarification-option"
                role="radio"
                [attr.aria-checked]="state.currentSelection() === option.id"
                [attr.aria-posinset]="i + 1"
                [attr.aria-setsize]="prompt.options.length"
                [attr.aria-label]="
                  option.label + (option.description ? '：' + option.description : '')
                "
                [attr.data-shortcut]="i < 9 ? i + 1 : null"
                (click)="onOptionSelect(option.id)"
                (keydown)="onOptionKeydown($event, option.id)"
              >
                <div class="option-number" aria-hidden="true">{{ i + 1 }}</div>
                <div class="option-content">
                  <span class="option-label">{{ option.label }}</span>
                  @if (option.description) {
                    <small class="option-description">{{ option.description }}</small>
                  }
                </div>
                @if (state.currentSelection() === option.id) {
                  <span class="option-check" aria-hidden="true">✓</span>
                }
              </button>
            }
          </div>

          <p class="keyboard-hint" aria-hidden="true">
            提示：按数字键 1-{{ prompt.options.length }} 快速选择
          </p>

          @if (state.validationError(); as validationError) {
            <div class="validation-error" role="alert" id="validation-error" aria-live="assertive">
              <span class="validation-icon" aria-hidden="true">⚠️</span>{{ validationError }}
            </div>
          }

          <button
            type="button"
            class="generate-button"
            [class.generate-button--ready]="state.isReadyToGenerate()"
            data-testid="clarification-generate"
            [disabled]="!state.isReadyToGenerate()"
            [attr.aria-disabled]="!state.isReadyToGenerate()"
            [attr.aria-describedby]="state.validationError() ? 'validation-error' : null"
            (click)="onGenerate()"
          >
            <span class="generate-text">生成 OKR</span>
            @if (state.isReadyToGenerate()) {
              <span class="generate-hint" aria-hidden="true"> (或按 Ctrl+Enter) </span>
            }
          </button>
        </article>
      }

      <!-- Generate button when ready but no prompt (error recovery) -->
      @if (state.isReadyToGenerate() && !state.currentPrompt()) {
        <article class="prompt-container">
          <div class="ready-state">
            <div class="ready-icon" aria-hidden="true">✓</div>
            <h2 class="ready-title">已准备好生成 OKR</h2>
            <p class="ready-description">
              您已回答了 {{ state.history().length }} 个问题，可以生成 OKR 了
            </p>
            <button
              type="button"
              class="generate-button generate-button--ready"
              data-testid="clarification-generate"
              [attr.aria-label]="'生成 OKR - 已准备好'"
              (click)="onGenerate()"
            >
              <span class="generate-text">生成 OKR</span>
            </button>
          </div>
        </article>
      }

      <!-- Error display -->
      @if (state.hasError()) {
        <div class="error-container" data-testid="error-message" role="alert" aria-live="assertive">
          <div class="error-icon" aria-hidden="true">⚠️</div>
          <div class="error-content">
            <p class="error-text">{{ state.errorMessage() }}</p>
            <button
              type="button"
              class="retry-button"
              data-testid="retry-button"
              aria-label="重试"
              (click)="onRetry()"
            >
              重试
            </button>
          </div>
        </div>
      }
    </section>
  `,
})
export class ClarificationWizardComponent {
  /** Estimated total steps for progress calculation */
  readonly estimatedTotalSteps = 5;

  constructor(public readonly state: SyncClarificationState) {}

  @Output() optionSelected = new EventEmitter<string>();
  @Output() generate = new EventEmitter<void>();
  @Output() retry = new EventEmitter<void>();
  @Output() goBack = new EventEmitter<void>();

  onOptionSelect(optionId: string): void {
    this.optionSelected.emit(optionId);
  }

  onGenerate(): void {
    this.generate.emit();
  }

  onRetry(): void {
    this.retry.emit();
  }

  onOptionKeydown(event: KeyboardEvent, optionId: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onOptionSelect(optionId);
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement) return;

    const currentPrompt = this.state.currentPrompt();
    if (!currentPrompt) return;

    const keyNumber = parseInt(event.key, 10);
    if (!isNaN(keyNumber) && keyNumber >= 1 && keyNumber <= currentPrompt.options.length) {
      event.preventDefault();
      this.onOptionSelect(currentPrompt.options[keyNumber - 1].id);
      return;
    }

    if (event.key === 'Escape' && this.state.history().length > 0) {
      event.preventDefault();
      this.goBack.emit();
      return;
    }

    if (event.key === 'Enter' && event.ctrlKey && this.state.isReadyToGenerate()) {
      event.preventDefault();
      this.onGenerate();
    }
  }
}
