import { Component, OnDestroy } from '@angular/core';
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
  template: `
    <ng-container *ngIf="!isStickyShell; else stickyShell">
      <main class="app-shell">
        <section class="intent-panel">
          <div class="intent-header">
            <h1 class="headline">ClarityOKR</h1>
            <button
              *ngIf="(hasStickyNote$ | async) === true"
              type="button"
              class="sticky-reopen"
              data-testid="sticky-reopen"
              (click)="reopenSticky()"
            >
              重新打开便签
            </button>
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
              [disabled]="intentControl.invalid || isClarifying"
            >
              开始澄清
            </button>
          </form>
          <p class="status-message" *ngIf="statusMessage">{{ statusMessage }}</p>
        </section>

        <section class="wizard-panel" *ngIf="currentPrompt$ | async as prompt">
          <clarityokr-clarification-wizard
            [prompt]="prompt"
            [isReadyToGenerate]="(isReady$ | async) ?? false"
            [validationError]="(validationError$ | async) ?? null"
            [loading]="(isLoading$ | async) ?? false"
            (optionSelected)="onOptionSelected($event)"
            (generate)="onGenerate()"
          ></clarityokr-clarification-wizard>
        </section>

        <section class="result-panel" *ngIf="generatedSummary">
          <h2 data-testid="okr-summary">{{ generatedSummary }}</h2>
        </section>
      </main>
    </ng-container>

    <ng-template #stickyShell>
      <clarityokr-sticky-note
        [okr]="stickyNote$ | async"
        (addKr)="onAddKeyResult()"
      ></clarityokr-sticky-note>
    </ng-template>
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
          var(--color-bg-gradient-start) 0%,
          var(--color-bg-gradient-end) 45%
        );
      }

      .app-shell {
        margin: 0 auto;
        max-width: 960px;
        padding: var(--spacing-3xl) 1.125rem 4rem;
        display: flex;
        flex-direction: column;
        gap: var(--spacing-2xl);
      }

      .intent-panel {
        background: var(--color-bg-card);
        border-radius: var(--radius-xl);
        padding: 1.75rem;
        box-shadow: var(--shadow-card);
      }

      .intent-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--spacing-lg);
        margin-bottom: var(--spacing-xl);
      }

      .headline {
        margin: 0;
        font-size: var(--font-size-xl);
        font-weight: 700;
      }

      .intent-form {
        display: grid;
        gap: var(--spacing-md);
      }

      .intent-label {
        font-weight: 600;
        font-size: var(--font-size-base);
        color: var(--color-text-muted);
      }

      .intent-input {
        padding: 0.9rem var(--spacing-lg);
        border-radius: var(--radius-lg);
        border: 1px solid rgba(37, 99, 235, 0.25);
        font-size: var(--font-size-md);
        background-color: var(--color-primary-lighter);
        transition:
          border-color 120ms ease,
          box-shadow 120ms ease;
      }

      .intent-input:focus {
        outline: none;
        border-color: rgba(37, 99, 235, 0.65);
        box-shadow: 0 0 0 4px var(--color-primary-light);
      }

      .intent-submit {
        align-self: flex-start;
        padding: var(--spacing-md) 1.75rem;
        border-radius: var(--radius-full);
        border: none;
        background: linear-gradient(
          135deg,
          var(--color-primary) 0%,
          var(--color-primary-darker) 100%
        );
        color: #fff;
        font-weight: 600;
        cursor: pointer;
        transition:
          transform 120ms ease,
          box-shadow 120ms ease;
      }

      .intent-submit:disabled {
        background: rgba(37, 99, 235, 0.35);
        cursor: not-allowed;
        box-shadow: none;
      }

      .intent-submit:not(:disabled):hover {
        transform: translateY(-1px);
        box-shadow: var(--shadow-button-hover);
      }

      .sticky-reopen {
        border: none;
        background: var(--color-primary-light);
        color: var(--color-primary-dark);
        padding: var(--spacing-sm) var(--spacing-lg);
        border-radius: var(--radius-full);
        cursor: pointer;
        font-weight: 600;
        transition: background 120ms ease;
      }

      .sticky-reopen:hover {
        background: rgba(37, 99, 235, 0.2);
      }

      .status-message {
        margin-top: var(--spacing-md);
        color: var(--color-error);
      }

      .wizard-panel {
        background: var(--color-bg-card);
        border-radius: var(--radius-xl);
        padding: 1.75rem;
        box-shadow: var(--shadow-card);
      }

      .result-panel {
        background: var(--color-purple-light);
        border-radius: var(--spacing-lg);
        padding: var(--spacing-xl);
        border: 1px solid var(--color-purple-border);
      }
    `,
  ],
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
