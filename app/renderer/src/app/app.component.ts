/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-redundant-type-constituents */
import { ChangeDetectorRef, Component, NgZone, OnDestroy } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import type { ClarificationPrompt } from '@clarityokr/contracts';
import { combineLatest, Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { ClarificationOrchestratorService } from './clarification/services/clarification-orchestrator.service';
import { IpcLlmGateway } from './clarification/services/ipc-llm-gateway.service';
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

        <section
          class="wizard-panel"
          *ngIf="(currentPrompt$ | async) || (error$ | async) || (isLoading$ | async)"
        >
          <clarityokr-clarification-wizard
            [prompt]="currentPrompt$ | async"
            [isReadyToGenerate]="(isReady$ | async) ?? false"
            [validationError]="(validationError$ | async) ?? null"
            [loading]="(isLoading$ | async) ?? false"
            [error]="(error$ | async) ?? null"
            (optionSelected)="onOptionSelected($event)"
            (generate)="onGenerate()"
            (retry)="onRetry()"
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
  readonly error$: Observable<string | null>;
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
    private readonly llmGateway: IpcLlmGateway,
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.currentPrompt$ = this.store.currentPrompt$ as Observable<ClarificationPrompt | null>;
    this.validationError$ = this.store.validationError$ as Observable<string | null>;
    this.isReady$ = this.store.isReadyToGenerate$ as Observable<boolean>;
    this.isLoading$ = this.store.isLoading$ as Observable<boolean>;
    this.error$ = this.store.errorMessage$ as Observable<string | null>;
    // Log error$ emissions
    this.error$.pipe(takeUntil(this.destroy$)).subscribe((error) => {
      console.log('[APP-COMPONENT] error$ emitted:', error);
    });
    this.stickyNote$ = this.stickyGateway.viewModel$ as Observable<OkrStickyViewModel | null>;
    this.hasStickyNote$ = this.stickyGateway.hasStickyNote$ as Observable<boolean>;
    this.store.currentPrompt$
      .pipe(takeUntil(this.destroy$))
      .subscribe((prompt: ClarificationPrompt | null) => {
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
      .subscribe(([history, selected]: [ClarificationPrompt[], string[]]) => {
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
      next: () => {
        // Success - prompt will be received via currentPrompt$ subscription
        this.isClarifying = false;
      },
      error: (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);

        // Directly set error state
        this.store.setError({ message: '网络错误，请重试', recoverable: true });

        // Force immediate UI state update
        this.zone.run(() => {
          this.statusMessage = message;
          this.isClarifying = false;
          this.cdr.markForCheck();
        });

        // Add log to confirm error has been set
        // eslint-disable-next-line no-console
        console.log('[DEBUG] Error set:', message);
      },
    });
  }

  onOptionSelected(optionId: string): void {
    console.log('[DEBUG] onOptionSelected called with optionId:', optionId);
    console.log('[DEBUG] sessionId:', this.sessionId, 'latestPrompt:', this.latestPrompt);

    if (!this.sessionId || !this.latestPrompt) {
      console.warn('[DEBUG] onOptionSelected early return: missing sessionId or latestPrompt');
      return;
    }

    // Debounce duplicate requests while an LLM call is in-flight
    if (this.llmBusy) {
      console.warn('[DEBUG] onOptionSelected early return: llmBusy is true');
      return;
    }

    console.log('[DEBUG] Calling recordSelection...');
    this.orchestrator.recordSelection(this.sessionId, this.latestPrompt.id, optionId).subscribe({
      next: () => console.log('[DEBUG] recordSelection completed successfully'),
      error: (error: unknown) => {
        this.zone.run(() => {
          console.error('[DEBUG] recordSelection error:', error);
          this.statusMessage = error instanceof Error ? error.message : String(error);
          this.cdr.detectChanges();
        });
      },
    });

    // Also request next question via LLM gateway; non-blocking
    console.log('[DEBUG] Setting llmBusy=true and requesting next question via orchestrator');
    const historyTurns: Array<{ questionId: string; optionId: string; timestamp: string }> = [];
    this.llmBusy = true;
    // Set loading state before making the request so the UI shows loading indicator
    this.store.setLoading('next-question');
    console.log('[DEBUG] Calling llmGateway.getNextQuestion...');
    this.llmGateway
      .getNextQuestion({ turns: historyTurns }, { questionId: this.latestPrompt.id, optionId })
      .subscribe({
        next: (result: unknown) => {
          console.log('[DEBUG] llmGateway.getNextQuestion next() - result:', result);
          console.log('[DEBUG] Setting llmBusy=false');
          this.llmBusy = false;
        },
        error: (err: unknown) => {
          console.error('[DEBUG] llmGateway.getNextQuestion error:', err);
          this.statusMessage = '请求超时或失败，请重试。';
          // Error state is managed through orchestrator to maintain architecture layers
          this.orchestrator
            .requestPrompt(this.sessionId ?? '', this.intentControl.value ?? '')
            .subscribe({
              error: (error) => {
                this.statusMessage = error instanceof Error ? error.message : String(error);
              },
            });
          this.llmBusy = false;
        },
      });
    console.log('[DEBUG] onOptionSelected completed - async operations started');
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
          this.zone.run(() => {
            const first = (payload as { draft?: { objectives?: Array<{ title?: string }> } })?.draft
              ?.objectives?.[0];
            if (first && typeof first.title === 'string' && first.title) {
              this.generatedSummary = first.title;
            }
            this.cdr.detectChanges();
          });
        },
        (err: unknown) => {
          this.zone.run(() => {
            // eslint-disable-next-line no-console
            console.warn('[renderer] LLM draft generation failed', err);
            this.statusMessage = '生成失败或超时，请稍后重试。';
            this.cdr.detectChanges();
          });
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

  onRetry(): void {
    // Clear error through orchestrator to maintain architecture layers
    this.orchestrator.clearError();
    this.statusMessage = '';
    if (this.sessionId && this.intentControl.value) {
      this.orchestrator.requestPrompt(this.sessionId, this.intentControl.value).subscribe({
        error: (error: unknown) => {
          this.zone.run(() => {
            this.statusMessage = error instanceof Error ? error.message : String(error);
            this.cdr.detectChanges();
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
