import { CommonModule } from '@angular/common';
import { Component, NgZone, OnDestroy, computed } from '@angular/core';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import type { ClarificationPrompt } from '@clarityokr/contracts';
import { Subject } from 'rxjs';

import { ClarificationOrchestratorService } from './clarification/services/clarification-orchestrator.service';
import { IpcLlmGateway } from './clarification/services/ipc-llm-gateway.service';
import { SyncClarificationState } from './clarification/services/sync-clarification-state.service';
import { OkrStickyGatewayService } from './okr-sticky/services/okr-sticky-gateway.service';
import { ClarificationWizardComponent } from './clarification/components/clarification-wizard.component';
import { OkrStickyNoteComponent } from './okr-sticky/components/okr-sticky-note.component';
import { Logger } from './core/services/logger.service';

@Component({
  selector: 'clarityokr-root',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ClarificationWizardComponent,
    OkrStickyNoteComponent,
  ],
  template: `
    @if (!isStickyShell) {
      <a href="#main-content" class="skip-link">跳转到主内容</a>
      <main id="main-content" class="app-shell" tabindex="-1">
        <section class="intent-panel">
          <div class="intent-header">
            <h1 class="headline">ClarityOKR</h1>
            @if (hasStickyNote()) {
              <button
                type="button"
                class="sticky-reopen"
                data-testid="sticky-reopen"
                aria-label="重新打开便签窗口"
                (click)="reopenSticky()"
              >
                重新打开便签
              </button>
            }
          </div>
          <form class="intent-form" (submit)="beginClarification($event)">
            <label class="intent-label" for="intent-input">初始目标意图</label>
            <input
              id="intent-input"
              type="text"
              class="intent-input"
              [formControl]="intentControl"
              [attr.aria-invalid]="intentControl.invalid"
              data-testid="intent-input"
              placeholder="例如：提高效率"
            />
            <button
              type="submit"
              class="intent-submit"
              data-testid="start-clarification"
              [attr.aria-label]="isClarifying ? '正在加载中' : '开始澄清目标意图'"
              [disabled]="intentControl.invalid || isClarifying"
              [attr.aria-busy]="isClarifying"
            >
              {{ isClarifying ? '加载中...' : '开始澄清' }}
            </button>
          </form>
          @if (statusMessage) {
            <p class="status-message" role="alert" aria-live="assertive">{{ statusMessage }}</p>
          }
        </section>

        @if (showWizard()) {
          <section class="wizard-panel">
            <clarityokr-clarification-wizard
              (optionSelected)="onOptionSelected($event)"
              (generate)="onGenerate()"
              (retry)="onRetry()"
            ></clarityokr-clarification-wizard>
          </section>
        }

        @if (generatedSummary) {
          <section class="result-panel">
            <h2 data-testid="okr-summary">{{ generatedSummary }}</h2>
          </section>
        }
      </main>
    } @else {
      <!-- Sticky note view -->
      <clarityokr-sticky-note
        [okr]="stickyViewModel()"
        (addKr)="onAddKeyResult()"
      ></clarityokr-sticky-note>
    }
  `,
  styles: [
    `
      :host {
        font-family: var(--font-family);
        color: var(--color-text);
        display: block;
        min-height: 100vh;
        background: linear-gradient(
          180deg,
          var(--color-background-gradient-start) 0%,
          var(--color-background-gradient-end) 45%
        );
      }

      .skip-link {
        position: absolute;
        top: -40px;
        left: 0;
        background: var(--color-primary);
        color: var(--color-surface);
        padding: var(--space-sm) var(--space-lg);
        text-decoration: none;
        font-weight: var(--font-weight-semibold);
        border-radius: 0 0 var(--radius-md) 0;
        z-index: calc(var(--z-modal) + 1);
        transition: top var(--transition-fast);
      }

      .skip-link:focus {
        top: 0;
        outline: 2px solid var(--color-surface);
        outline-offset: 2px;
      }

      .app-shell {
        margin: 0 auto;
        max-width: var(--max-width-content);
        padding: var(--space-4xl) var(--container-padding) var(--space-5xl);
        display: flex;
        flex-direction: column;
        gap: var(--space-3xl);
      }

      .intent-panel {
        background: var(--color-surface);
        border-radius: var(--radius-2xl);
        padding: var(--space-2xl);
        box-shadow: var(--shadow-xl);
      }

      .intent-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-lg);
        margin-bottom: var(--space-xl);
        flex-wrap: wrap;
      }

      .headline {
        margin: 0;
        font-size: var(--font-size-2xl);
        font-weight: var(--font-weight-bold);
      }

      .intent-form {
        display: grid;
        gap: var(--space-md);
      }

      .intent-label {
        font-weight: var(--font-weight-semibold);
        font-size: var(--font-size-md);
        color: var(--color-text-muted);
      }

      .intent-input {
        padding: var(--space-md) var(--space-lg);
        border-radius: var(--radius-lg);
        border: 1px solid var(--color-primary-alpha-25);
        font-size: var(--font-size-base);
        background-color: var(--color-primary-light);
        transition:
          border-color var(--transition-fast),
          box-shadow var(--transition-fast);
      }

      .intent-input:focus {
        outline: none;
        border-color: var(--color-primary-alpha-65);
        box-shadow: var(--shadow-ring);
      }

      .intent-input:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
      }

      .intent-submit {
        align-self: flex-start;
        padding: var(--space-md) var(--space-2xl);
        border-radius: var(--radius-full);
        border: none;
        background: linear-gradient(
          135deg,
          var(--color-primary) 0%,
          var(--color-accent-purple) 100%
        );
        color: var(--color-surface);
        font-weight: var(--font-weight-semibold);
        cursor: pointer;
        transition:
          transform var(--transition-fast),
          box-shadow var(--transition-fast);
      }

      .intent-submit:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
      }

      .intent-submit:disabled {
        background: rgba(37, 99, 235, 0.35);
        cursor: not-allowed;
        box-shadow: none;
      }

      .intent-submit:not(:disabled):hover {
        transform: translateY(-1px);
        box-shadow: var(--shadow-lg);
      }

      .sticky-reopen {
        border: none;
        background: var(--color-primary-light-hover);
        color: var(--color-primary-hover);
        padding: var(--space-sm) var(--space-lg);
        border-radius: var(--radius-full);
        cursor: pointer;
        font-weight: var(--font-weight-semibold);
        transition: background var(--transition-fast);
      }

      .sticky-reopen:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
      }

      .sticky-reopen:hover {
        background: rgba(37, 99, 235, 0.2);
      }

      .status-message {
        margin-top: var(--space-md);
        color: var(--color-error-hover);
      }

      .status-message[role='alert'] {
        animation: fadeIn var(--transition-fast);
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .wizard-panel {
        background: var(--color-surface);
        border-radius: var(--radius-2xl);
        padding: var(--space-2xl);
        box-shadow: var(--shadow-xl);
      }

      .result-panel {
        background: var(--color-success-light);
        border-radius: var(--radius-xl);
        padding: var(--space-xl);
        border: 1px solid var(--color-success-alpha-25);
      }

      /* Responsive styles */
      @media (max-width: 768px) {
        .app-shell {
          padding: var(--space-2xl) var(--container-padding) var(--space-3xl);
          gap: var(--space-2xl);
        }

        .intent-panel,
        .wizard-panel {
          padding: var(--space-xl);
        }

        .intent-header {
          flex-direction: column;
          align-items: flex-start;
          gap: var(--space-md);
        }

        .headline {
          font-size: var(--font-size-2xl);
        }

        .intent-submit {
          align-self: stretch;
          width: 100%;
        }

        .result-panel {
          padding: var(--space-lg);
        }
      }

      @media (max-width: 640px) {
        .app-shell {
          padding: var(--space-xl) var(--container-padding) var(--space-2xl);
        }

        .intent-panel,
        .wizard-panel {
          padding: var(--space-lg);
          border-radius: var(--radius-xl);
        }

        .headline {
          font-size: var(--font-size-xl);
        }

        .intent-input {
          font-size: var(--font-size-base);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .intent-submit,
        .sticky-reopen {
          transition: none;
        }

        @keyframes fadeIn {
          from,
          to {
            opacity: 1;
            transform: none;
          }
        }
      }
    `,
  ],
})
export class AppComponent implements OnDestroy {
  readonly intentControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(2)],
  });

  // Computed signals for template conditions
  readonly showWizard = computed((): boolean => {
    // Ensure wizard stays visible when error occurs to allow retry
    // This prevents the retry button from being removed during error state transitions
    return this.state.hasPrompt() || this.state.hasError() || this.state.isLoading();
  });

  readonly hasStickyNote = computed((): boolean => {
    // Show sticky note reopen button when OKR has been generated
    return !!this.generatedSummary;
  });

  readonly stickyViewModel = computed(() => {
    // Get the current OKR view model from the gateway service
    return this.stickyGateway.getCurrentViewModel();
  });

  readonly isStickyShell =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('view') === 'sticky';

  statusMessage = '';
  private llmBusy = false;
  generatedSummary = '';
  isClarifying = false;

  private sessionId: string | null = null;
  private latestPrompt: ClarificationPrompt | null = null;
  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly orchestrator: ClarificationOrchestratorService,
    public readonly state: SyncClarificationState,
    private readonly stickyGateway: OkrStickyGatewayService,
    private readonly llmGateway: IpcLlmGateway,
    private readonly zone: NgZone,
    private readonly logger: Logger,
  ) {
    // Subscribe to prompt changes for logging
    // Note: In a full Signal-based architecture, this would be a computed or effect
    // For now, we keep minimal subscription for side effects
    this.logger.debug('[APP-COMPONENT] Initialized with Signal-based state');
  }

  beginClarification(event?: Event): void {
    event?.preventDefault();
    if (this.intentControl.invalid) {
      this.intentControl.markAsTouched();
      return;
    }

    this.state.reset();
    this.statusMessage = '';
    this.generatedSummary = '';
    this.isClarifying = true;
    this.sessionId = crypto.randomUUID();

    this.logger.info('[renderer] beginClarification invoked', {
      intent: this.intentControl.value,
      valid: this.intentControl.valid,
      sessionId: this.sessionId,
    });

    this.state.setIntent(this.intentControl.value);
    this.orchestrator.requestPrompt(this.sessionId, this.intentControl.value).subscribe({
      next: () => {
        this.isClarifying = false;
      },
      error: (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.zone.run(() => {
          this.state.setError({ message: '网络错误，请重试', recoverable: true });
          this.statusMessage = message;
          this.isClarifying = false;
          this.logger.debug('[APP-COMPONENT] Error state set:', message);
        });
      },
    });
  }

  onOptionSelected(optionId: string): void {
    this.logger.debug('[DEBUG] onOptionSelected called with optionId:', optionId);

    if (!this.sessionId) {
      this.logger.warn('[DEBUG] onOptionSelected early return: missing sessionId');
      return;
    }

    const prompt = this.state.currentPrompt();
    if (!prompt) {
      this.logger.warn('[DEBUG] onOptionSelected early return: no current prompt');
      return;
    }

    // Always record selection first, regardless of llmBusy state
    this.latestPrompt = prompt;

    this.logger.debug('[DEBUG] Calling recordSelection...');
    this.orchestrator.recordSelection(this.sessionId, prompt.id, optionId).subscribe({
      next: () => this.logger.debug('[DEBUG] recordSelection completed successfully'),
      error: (error: unknown) => {
        this.zone.run(() => {
          this.logger.error('[DEBUG] recordSelection error:', error);
          this.statusMessage = error instanceof Error ? error.message : String(error);
        });
      },
    });

    // If already processing a request, skip requesting next question
    if (this.llmBusy) {
      this.logger.warn('[DEBUG] Skipping next question request: llmBusy is true');
      return;
    }

    // Also request next question via LLM gateway; non-blocking
    this.logger.debug('[DEBUG] Setting llmBusy=true and requesting next question');
    const historyTurns: Array<{ questionId: string; optionId: string; timestamp: string }> = [];
    this.llmBusy = true;
    this.state.setLoading(true);

    this.logger.debug('[DEBUG] Calling llmGateway.getNextQuestion...');
    this.llmGateway
      .getNextQuestion({ turns: historyTurns }, { questionId: prompt.id, optionId })
      .subscribe({
        next: (result) => {
          this.logger.debug('[DEBUG] llmGateway.getNextQuestion next() - result:', result);
          // Check if no more questions (clarification complete)
          const hasQuestion =
            result && typeof result === 'object' && 'question' in result && result.question;
          if (!hasQuestion) {
            this.logger.debug('[DEBUG] No more questions, clearing prompt and setting ready to generate');
            this.state.setPrompt(null);
            this.state.setReady(true);
          }
          this.logger.debug('[DEBUG] Setting llmBusy=false');
          this.llmBusy = false;
          this.state.setLoading(false);
        },
        error: (err: unknown) => {
          this.zone.run(() => {
            this.logger.error('[DEBUG] llmGateway.getNextQuestion error:', err);
            const errorMessage = err instanceof Error ? err.message : String(err);
            this.statusMessage = '请求超时或失败，请重试。';
            // Set error state to show error UI
            // Note: setError already sets loading to false internally
            this.state.setError({ message: errorMessage, recoverable: true });
            this.llmBusy = false;
          });
        },
      });
    this.logger.debug('[DEBUG] onOptionSelected completed - async operations started');
  }

  async onGenerate(): Promise<void> {
    if (!this.sessionId) {
      return;
    }

    this.statusMessage = '';
    this.isClarifying = true;

    try {
      this.logger.info('[renderer] onGenerate invoked with session', this.sessionId);
      const viewModel = await this.stickyGateway.generate(this.sessionId, this.intentControl.value);
      this.generatedSummary = viewModel.objective;

      // Also request OKR draft via LLM (non-blocking for UI)
      const turns: Array<{ questionId: string; optionId: string; timestamp: string }> = [];
      this.llmGateway.generateDraft({ turns }).subscribe({
        next: (response) => {
          this.zone.run(() => {
            // Type-safe access to draft response
            const payload = response as { draft?: { objectives?: Array<{ title?: string }> } };
            const first = payload?.draft?.objectives?.[0];
            if (first && typeof first.title === 'string' && first.title) {
              this.generatedSummary = first.title;
            }
          });
        },
        error: (err: unknown) => {
          this.zone.run(() => {
            this.logger.warn('[renderer] LLM draft generation failed', err);
            this.statusMessage = '生成失败或超时，请稍后重试。';
          });
        },
      });
    } catch (error) {
      this.logger.error('[renderer] generate failed', error);
      this.statusMessage = error instanceof Error ? error.message : String(error);
    } finally {
      this.isClarifying = false;
    }
  }

  onRetry(): void {
    this.statusMessage = '';
    // Ensure loading state is set before clearing error to prevent wizard from disappearing
    this.state.setLoading(true);
    this.orchestrator.clearError();
    if (this.sessionId && this.intentControl.value) {
      this.orchestrator.requestPrompt(this.sessionId, this.intentControl.value).subscribe({
        error: (error: unknown) => {
          this.zone.run(() => {
            this.statusMessage = error instanceof Error ? error.message : String(error);
          });
        },
      });
    }
  }

  onAddKeyResult(): void {
    this.stickyGateway.addKeyResult();
  }

  async reopenSticky(): Promise<void> {
    try {
      await this.stickyGateway.reopenSticky();
    } catch (error) {
      this.statusMessage = error instanceof Error ? error.message : String(error);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
