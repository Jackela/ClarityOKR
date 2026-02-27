import { ChangeDetectionStrategy, Component, OnDestroy } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import type { ClarificationPrompt } from '@clarityokr/contracts';
import { okrDraftResponseSchema } from '@clarityokr/contracts';
import type { Observable } from 'rxjs';
import { combineLatest, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { ClarificationOrchestratorService } from './clarification/services/clarification-orchestrator.service';
import { LlmGatewayService } from './clarification/services/llm-gateway.service';
import { ClarificationStore } from './clarification/state/clarification.store';
import type { OkrStickyViewModel } from './okr-sticky/services/okr-projection.service';
import { OkrStickyGatewayService } from './okr-sticky/services/okr-sticky-gateway.service';

@Component({
  selector: 'clarityokr-root',
  standalone: false,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnDestroy {
  readonly intentControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(2)],
  });

  readonly currentPrompt$: Observable<ClarificationPrompt | null>;
  readonly validationError$: Observable<string | null>;
  readonly isReady$: Observable<boolean>;
  readonly isLoading$: Observable<boolean>;
  readonly stickyNote$: Observable<OkrStickyViewModel | null>;
  readonly hasStickyNote$: Observable<boolean>;
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
    private readonly store: ClarificationStore,
    private readonly stickyGateway: OkrStickyGatewayService,
    private readonly llmGateway: LlmGatewayService,
  ) {
    this.currentPrompt$ = this.store.currentPrompt$;
    this.validationError$ = this.store.validationError$;
    this.isReady$ = this.store.isReadyToGenerate$;
    this.isLoading$ = this.store.isLoading$;
    this.stickyNote$ = this.stickyGateway.viewModel$;
    this.hasStickyNote$ = this.stickyGateway.hasStickyNote$;
    this.store.currentPrompt$.pipe(takeUntil(this.destroy$)).subscribe((prompt) => {
      this.latestPrompt = prompt;
      if (prompt) {
        // eslint-disable-next-line no-console
        console.info('[renderer] prompt received', {
          promptId: prompt.id,
          sequence: prompt.sequence,
          question: prompt.question,
        });
        this.isClarifying = false;
      }
    });

    combineLatest([this.store.history$, this.store.selectedOptionIds$])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([history, selected]) => {
        if (history.length >= 2 && selected.length > 0) {
          this.orchestrator.markReady(true);
        }
      });
  }

  beginClarification(event?: Event): void {
    event?.preventDefault();
    if (this.intentControl.invalid) {
      this.intentControl.markAsTouched();
      return;
    }

    this.store.reset();
    this.orchestrator.markReady(false);
    this.statusMessage = '';
    this.generatedSummary = '';
    this.isClarifying = true;
    this.sessionId = crypto.randomUUID();
    // eslint-disable-next-line no-console
    console.info('[renderer] beginClarification invoked', {
      intent: this.intentControl.value,
      valid: this.intentControl.valid,
      sessionId: this.sessionId,
    });

    this.orchestrator.requestPrompt(this.sessionId, this.intentControl.value).subscribe({
      error: (error: unknown) => {
        this.statusMessage = error instanceof Error ? error.message : String(error);
        this.isClarifying = false;
      },
    });
  }

  onOptionSelected(optionId: string): void {
    if (!this.sessionId || !this.latestPrompt) {
      return;
    }

    // Debounce duplicate requests while an LLM call is in-flight
    if (this.llmBusy) {
      // eslint-disable-next-line no-console
      console.info('[renderer] ignoring selection while LLM request is in-flight');
      return;
    }

    this.orchestrator.recordSelection(this.sessionId, this.latestPrompt.id, optionId).subscribe({
      error: (error: unknown) => {
        this.statusMessage = error instanceof Error ? error.message : String(error);
      },
    });

    // Also request next question via LLM gateway; non-blocking
    const historyTurns: Array<{ questionId: string; optionId: string; timestamp: string }> = [];
    this.llmBusy = true;
    this.store.setLoading(true);
    this.llmGateway
      .getNextQuestion({ turns: historyTurns }, { questionId: this.latestPrompt.id, optionId })
      .subscribe({
        next: () => {
          this.llmBusy = false;
          this.store.setLoading(false);
        },
        error: (err) => {
          // eslint-disable-next-line no-console
          console.warn('[renderer] LLM next-question failed', err);
          this.statusMessage = '请求超时或失败，请重试。';
          this.llmBusy = false;
          this.store.setLoading(false);
        },
      });
  }

  async onGenerate(): Promise<void> {
    if (!this.sessionId) {
      return;
    }

    this.statusMessage = '';
    this.isClarifying = true;

    try {
      // eslint-disable-next-line no-console
      console.info('[renderer] onGenerate invoked with session', this.sessionId);
      const viewModel = await this.stickyGateway.generate(this.sessionId, this.intentControl.value);
      this.generatedSummary = viewModel.objective;

      // Also request OKR draft via LLM (non-blocking for UI)
      const turns: Array<{ questionId: string; optionId: string; timestamp: string }> = [];
      this.llmGateway.generateDraft({ turns }).subscribe(
        (payload: unknown) => {
          const parsed = okrDraftResponseSchema.safeParse(payload);
          if (parsed.success) {
            const first = parsed.data.draft.objectives[0];
            if (first?.title) {
              this.generatedSummary = first.title;
            }
          }
        },
        (err: unknown) => {
          // eslint-disable-next-line no-console
          console.warn('[renderer] LLM draft generation failed', err);
          this.statusMessage = '生成失败或超时，请稍后重试。';
        },
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[renderer] generate failed', error);
      this.statusMessage = error instanceof Error ? error.message : String(error);
    } finally {
      this.isClarifying = false;
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
