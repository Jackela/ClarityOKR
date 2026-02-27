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
        font-family:
          'Segoe UI',
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          'Helvetica Neue',
          sans-serif;
        color: #0f172a;
        display: block;
        min-height: 100vh;
        background: linear-gradient(180deg, #f3f4ff 0%, #ffffff 45%);
      }

      .app-shell {
        margin: 0 auto;
        max-width: 960px;
        padding: 2.5rem 1.125rem 4rem;
        display: flex;
        flex-direction: column;
        gap: 2rem;
      }

      .intent-panel {
        background: #fff;
        border-radius: 1.25rem;
        padding: 1.75rem;
        box-shadow: 0 24px 48px rgba(15, 23, 42, 0.08);
      }

      .intent-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }

      .headline {
        margin: 0;
        font-size: 2rem;
        font-weight: 700;
      }

      .intent-form {
        display: grid;
        gap: 0.75rem;
      }

      .intent-label {
        font-weight: 600;
        font-size: 0.9rem;
        color: rgba(15, 23, 42, 0.75);
      }

      .intent-input {
        padding: 0.9rem 1rem;
        border-radius: 0.85rem;
        border: 1px solid rgba(37, 99, 235, 0.25);
        font-size: 1rem;
        background-color: rgba(37, 99, 235, 0.06);
        transition:
          border-color 120ms ease,
          box-shadow 120ms ease;
      }

      .intent-input:focus {
        outline: none;
        border-color: rgba(37, 99, 235, 0.65);
        box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
      }

      .intent-submit {
        align-self: flex-start;
        padding: 0.75rem 1.75rem;
        border-radius: 999px;
        border: none;
        background: linear-gradient(135deg, #2563eb 0%, #4338ca 100%);
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
        box-shadow: 0 12px 24px rgba(37, 99, 235, 0.2);
      }

      .sticky-reopen {
        border: none;
        background: rgba(37, 99, 235, 0.12);
        color: #1d4ed8;
        padding: 0.5rem 1rem;
        border-radius: 999px;
        cursor: pointer;
        font-weight: 600;
        transition: background 120ms ease;
      }

      .sticky-reopen:hover {
        background: rgba(37, 99, 235, 0.2);
      }

      .status-message {
        margin-top: 0.75rem;
        color: #b91c1c;
      }

      .wizard-panel {
        background: #fff;
        border-radius: 1.25rem;
        padding: 1.75rem;
        box-shadow: 0 24px 48px rgba(15, 23, 42, 0.08);
      }

      .result-panel {
        background: rgba(79, 70, 229, 0.08);
        border-radius: 1rem;
        padding: 1.5rem;
        border: 1px solid rgba(79, 70, 229, 0.25);
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
