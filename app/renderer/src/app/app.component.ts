import { CommonModule } from '@angular/common';
import { Component, NgZone, OnDestroy, computed } from '@angular/core';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import type { ClarificationPrompt } from '@clarityokr/contracts';
import { Subject } from 'rxjs';

import { ClarificationWizardComponent } from './clarification/components/clarification-wizard.component';
import { ClarificationOrchestratorService } from './clarification/services/clarification-orchestrator.service';
import { IpcLlmGateway } from './clarification/services/ipc-llm-gateway.service';
import { SyncClarificationState } from './clarification/services/sync-clarification-state.service';
import { Logger } from './core/services/logger.service';
import { OkrStickyNoteComponent } from './okr-sticky/components/okr-sticky-note.component';
import { OkrStickyGatewayService } from './okr-sticky/services/okr-sticky-gateway.service';

// Type guards for safe type narrowing
function hasQuestionProperty(obj: unknown): obj is { question: unknown } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'question' in obj &&
    (obj as { question?: unknown }).question !== undefined
  );
}

interface DraftResponse {
  draft?: {
    objectives?: Array<{ title?: string }>;
  };
}

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
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnDestroy {
  readonly intentControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required.bind(Validators), Validators.minLength(2).bind(Validators)],
  });

  // Computed signals for template conditions
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
  private getShowWizard(): boolean {
    return this.state.hasPrompt() || this.state.hasError() || this.state.isLoading();
  }

  readonly showWizard = computed(() => this.getShowWizard());

  readonly hasStickyNote = computed((): boolean => {
    // Show sticky note reopen button when OKR has been generated
    return !!this.generatedSummary;
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
  private getStickyViewModel() {
    return this.stickyGateway.getCurrentViewModel();
  }

  readonly stickyViewModel = computed(() => this.getStickyViewModel());

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
          const hasQuestion = hasQuestionProperty(result);
          if (!hasQuestion) {
            this.logger.debug(
              '[DEBUG] No more questions, clearing prompt and setting ready to generate',
            );
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
        next: (response: unknown) => {
          this.zone.run(() => {
            // Type-safe access to draft response
            const payload = response as DraftResponse;
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
