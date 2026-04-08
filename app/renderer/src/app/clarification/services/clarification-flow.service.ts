import { Injectable, NgZone } from '@angular/core';
import type { ClarificationPrompt } from '@clarityokr/contracts';
import { Subject } from 'rxjs';
import type { Observable } from 'rxjs';

import type { Logger } from '../../core/services/logger.service';
import type { OkrStickyGatewayService } from '../../okr-sticky/services/okr-sticky-gateway.service';
import { hasQuestionProperty, isDraftResponse } from '../../shared/type-guards/llm-response.guards';
import type { IpcLlmGateway } from './ipc-llm-gateway.service';
import type { ClarificationOrchestratorService } from './clarification-orchestrator.service';
import type { SyncClarificationState } from './sync-clarification-state.service';

export interface ClarificationFlowState {
  isClarifying: boolean;
  statusMessage: string;
  generatedSummary: string;
  sessionId: string | null;
}

@Injectable({ providedIn: 'root' })
export class ClarificationFlowService {
  private llmBusy = false;
  private latestPrompt: ClarificationPrompt | null = null;
  private readonly destroy$ = new Subject<void>();

  private _state: ClarificationFlowState = {
    isClarifying: false,
    statusMessage: '',
    generatedSummary: '',
    sessionId: null,
  };

  get state(): ClarificationFlowState {
    return { ...this._state };
  }

  get state$(): Observable<void> {
    return this.destroy$.asObservable();
  }

  constructor(
    private readonly orchestrator: ClarificationOrchestratorService,
    private readonly state: SyncClarificationState,
    private readonly stickyGateway: OkrStickyGatewayService,
    private readonly llmGateway: IpcLlmGateway,
    private readonly zone: NgZone,
    private readonly logger: Logger,
  ) {}

  /**
   * Initialize a new clarification session
   */
  beginClarification(intent: string): void {
    this.state.reset();
    this._state.statusMessage = '';
    this._state.generatedSummary = '';
    this._state.isClarifying = true;
    this._state.sessionId = crypto.randomUUID();

    this.logger.info('[renderer] beginClarification invoked', {
      intent,
      sessionId: this._state.sessionId,
    });

    this.state.setIntent(intent);
    this.orchestrator.requestPrompt(this._state.sessionId, intent).subscribe({
      next: () => {
        this._state.isClarifying = false;
      },
      error: (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.zone.run(() => {
          this.state.setError({ message: '网络错误，请重试', recoverable: true });
          this._state.statusMessage = message;
          this._state.isClarifying = false;
          this.logger.debug('[FLOW-SERVICE] Error state set:', message);
        });
      },
    });
  }

  /**
   * Handle user selecting an option in the clarification flow
   */
  onOptionSelected(optionId: string): void {
    this.logger.debug('[DEBUG] onOptionSelected called with optionId:', optionId);

    if (!this._state.sessionId) {
      this.logger.warn('[DEBUG] onOptionSelected early return: missing sessionId');
      return;
    }

    const prompt = this.state.currentPrompt();
    if (!prompt) {
      this.logger.warn('[DEBUG] onOptionSelected early return: no current prompt');
      return;
    }

    this.latestPrompt = prompt;

    this.logger.debug('[DEBUG] Calling recordSelection...');
    this.orchestrator.recordSelection(this._state.sessionId, prompt.id, optionId).subscribe({
      next: () => this.logger.debug('[DEBUG] recordSelection completed successfully'),
      error: (error: unknown) => {
        this.zone.run(() => {
          this.logger.error('[DEBUG] recordSelection error:', error);
          this._state.statusMessage = error instanceof Error ? error.message : String(error);
        });
      },
    });

    if (this.llmBusy) {
      this.logger.warn('[DEBUG] Skipping next question request: llmBusy is true');
      return;
    }

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
          const hasQuestion = hasQuestionProperty(result);
          if (!hasQuestion) {
            this.logger.debug('[DEBUG] No more questions, clearing prompt');
            this.state.setPrompt(null);
          }
          this.logger.debug('[DEBUG] Setting llmBusy=false');
          this.llmBusy = false;
          this.state.setLoading(false);
        },
        error: (err: unknown) => {
          this.zone.run(() => {
            this.logger.error('[DEBUG] llmGateway.getNextQuestion error:', err);
            const errorMessage = err instanceof Error ? err.message : String(err);
            this._state.statusMessage = '请求超时或失败，请重试。';
            this.state.setError({ message: errorMessage, recoverable: true });
            this.llmBusy = false;
          });
        },
      });
    this.logger.debug('[DEBUG] onOptionSelected completed - async operations started');
  }

  /**
   * Generate OKR from the current clarification session
   */
  async onGenerate(intent: string): Promise<void> {
    if (!this._state.sessionId) {
      return;
    }

    this._state.statusMessage = '';
    this._state.isClarifying = true;

    try {
      this.logger.info('[renderer] onGenerate invoked with session', this._state.sessionId);
      const viewModel = await this.stickyGateway.generate(this._state.sessionId, intent);
      this._state.generatedSummary = viewModel.objective;

      const turns: Array<{ questionId: string; optionId: string; timestamp: string }> = [];
      this.llmGateway.generateDraft({ turns }).subscribe({
        next: (response: unknown) => {
          this.zone.run(() => {
            if (isDraftResponse(response)) {
              const first = response.draft?.objectives?.[0];
              if (first && typeof first.title === 'string' && first.title) {
                this._state.generatedSummary = first.title;
              }
            }
          });
        },
        error: (err: unknown) => {
          this.zone.run(() => {
            this.logger.warn('[renderer] LLM draft generation failed', err);
            this._state.statusMessage = '生成失败或超时，请稍后重试。';
          });
        },
      });
    } catch (error) {
      this.logger.error('[renderer] generate failed', error);
      this._state.statusMessage = error instanceof Error ? error.message : String(error);
    } finally {
      this._state.isClarifying = false;
    }
  }

  /**
   * Retry the clarification flow after an error
   */
  onRetry(intent: string): void {
    this._state.statusMessage = '';
    this.state.setLoading(true);
    this.orchestrator.clearError();
    if (this._state.sessionId && intent) {
      this.orchestrator.requestPrompt(this._state.sessionId, intent).subscribe({
        error: (error: unknown) => {
          this.zone.run(() => {
            this._state.statusMessage = error instanceof Error ? error.message : String(error);
          });
        },
      });
    }
  }

  /**
   * Reset the flow state
   */
  reset(): void {
    this._state = {
      isClarifying: false,
      statusMessage: '',
      generatedSummary: '',
      sessionId: null,
    };
    this.llmBusy = false;
    this.latestPrompt = null;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
