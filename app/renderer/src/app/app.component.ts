import { CommonModule } from '@angular/common';
import { Component, computed, type OnDestroy } from '@angular/core';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { Subject } from 'rxjs';

import { ClarificationWizardComponent } from './clarification/components/clarification-wizard.component';
import { ClarificationOrchestratorService } from './clarification/services/clarification-orchestrator.service';
import { ClarificationStateMachine } from './clarification/services/clarification-state-machine.service';
import { IpcLlmGateway } from './clarification/services/ipc-llm-gateway.service';
import { OkrStickyService } from './okr-sticky/services/okr-sticky.service';
import { OkrStickyNoteComponent } from './okr-sticky/components/okr-sticky-note.component';
import { Logger } from './core/services/logger.service';
import { TranslatePipe } from './shared/pipes/translate.pipe';

@Component({
  selector: 'clarityokr-root',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ClarificationWizardComponent,
    OkrStickyNoteComponent,
    TranslatePipe,
  ],
  template: `
    @if (!isStickyShell) {
      <a href="#main-content" class="skip-link">{{ 'common.skipToContent' | translate }}</a>
      <main id="main-content" class="app-shell" tabindex="-1">
        <section class="intent-panel">
          <div class="intent-header">
            <h1 class="headline">ClarityOKR</h1>
            @if (hasStickyNote()) {
              <button
                type="button"
                class="sticky-reopen"
                (click)="reopenSticky()"
                [attr.aria-label]="'app.reopenSticky' | translate"
              >
                {{ 'app.reopenSticky' | translate }}
              </button>
            }
          </div>

          @if (!showClarificationWizard()) {
            <form class="intent-form" (submit)="beginClarification($event)">
              <label for="intent-input" class="intent-label">
                {{ 'app.intentLabel' | translate }}
              </label>
              <div class="input-row">
                <input
                  id="intent-input"
                  type="text"
                  [formControl]="intentControl"
                  class="intent-input"
                  [placeholder]="'app.intentPlaceholder' | translate"
                  [attr.aria-invalid]="intentControl.invalid && intentControl.touched"
                  [attr.aria-describedby]="
                    intentControl.invalid && intentControl.touched ? 'intent-error' : null
                  "
                />
                <button
                  type="submit"
                  class="submit-button"
                  [disabled]="intentControl.invalid"
                  [attr.aria-disabled]="intentControl.invalid"
                >
                  {{ 'app.startClarification' | translate }}
                </button>
              </div>
              @if (intentControl.invalid && intentControl.touched) {
                <div id="intent-error" class="error-message" role="alert">
                  {{ 'app.intentRequired' | translate }}
                </div>
              }
            </form>
          }
        </section>

        @if (showClarificationWizard()) {
          <clarityokr-clarification-wizard
            (optionSelected)="onOptionSelected($event)"
            (generate)="onGenerate()"
            (retry)="onRetry()"
            (goBack)="state.reset()"
          ></clarityokr-clarification-wizard>
        }

        @if (hasStickyNote()) {
          <section class="result-panel" aria-live="polite">
            <clarityokr-sticky-note
              [okr]="stickyViewModel()"
              (addKr)="onAddKeyResult()"
            ></clarityokr-sticky-note>
          </section>
        }
      </main>
    } @else {
      <clarityokr-sticky-note
        [okr]="stickyViewModel()"
        (addKr)="onAddKeyResult()"
      ></clarityokr-sticky-note>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--color-bg-default);
      }

      .app-shell {
        max-width: var(--max-width-content);
        margin: 0 auto;
        padding: var(--space-6) var(--space-4);
      }

      .intent-panel {
        margin-bottom: var(--space-8);
      }

      .intent-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-6);
      }

      .headline {
        font-size: var(--font-size-3xl);
        font-weight: var(--font-weight-bold);
        color: var(--color-text-primary);
        margin: 0;
      }

      .sticky-reopen {
        padding: var(--space-2) var(--space-4);
        background: var(--color-brand-primary-light);
        color: var(--color-brand-primary);
        border: none;
        border-radius: var(--radius-lg);
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        cursor: pointer;
        transition: background-color var(--duration-fast);
      }

      .sticky-reopen:hover {
        background: var(--color-brand-primary-alpha);
      }

      .intent-form {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .intent-label {
        font-size: var(--font-size-lg);
        font-weight: var(--font-weight-medium);
        color: var(--color-text-primary);
      }

      .input-row {
        display: flex;
        gap: var(--space-3);
      }

      .intent-input {
        flex: 1;
        padding: var(--space-3) var(--space-4);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        font-size: var(--font-size-base);
        background: var(--color-surface);
        color: var(--color-text-primary);
      }

      .intent-input:focus {
        outline: none;
        border-color: var(--color-brand-primary);
        box-shadow: var(--shadow-focus-ring);
      }

      .submit-button {
        padding: var(--space-3) var(--space-6);
        background: var(--color-brand-primary);
        color: white;
        border: none;
        border-radius: var(--radius-lg);
        font-size: var(--font-size-base);
        font-weight: var(--font-weight-medium);
        cursor: pointer;
        transition: background-color var(--duration-fast);
      }

      .submit-button:hover:not(:disabled) {
        background: var(--color-brand-primary-hover);
      }

      .submit-button:disabled {
        background: var(--color-text-disabled);
        cursor: not-allowed;
      }

      .error-message {
        color: var(--color-error);
        font-size: var(--font-size-sm);
      }

      .result-panel {
        margin-top: var(--space-8);
      }

      .skip-link {
        position: absolute;
        top: -100%;
        left: 50%;
        transform: translateX(-50%);
        padding: var(--space-2) var(--space-4);
        background: var(--color-brand-primary);
        color: white;
        border-radius: var(--radius-md);
        z-index: var(--z-max);
        transition: top var(--duration-fast);
      }

      .skip-link:focus {
        top: var(--space-2);
      }
    `,
  ],
})
export class AppComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private llmBusy = false;

  readonly intentControl = new FormControl('', {
    validators: [Validators.required, Validators.minLength(3)],
    nonNullable: true,
  });

  readonly showClarificationWizard = computed(
    () => this.state.workflowState() !== 'idle' || this.state.hasPrompt() || this.state.hasError(),
  );

  readonly hasStickyNote = computed(() => !!this.stickyGateway.getCurrentViewModel());

  readonly stickyViewModel = computed(() => this.stickyGateway.getCurrentViewModel());

  readonly isStickyShell =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('view') === 'sticky';

  constructor(
    readonly state: ClarificationStateMachine,
    private readonly orchestrator: ClarificationOrchestratorService,
    private readonly stickyGateway: OkrStickyService,
    private readonly llmGateway: IpcLlmGateway,
    private readonly logger: Logger,
  ) {}

  beginClarification(event?: Event): void {
    event?.preventDefault();
    if (this.intentControl.invalid) {
      this.intentControl.markAsTouched();
      return;
    }

    const intent = this.intentControl.value;
    this.state.reset();
    this.state.start(intent);

    const sessionId = crypto.randomUUID();
    this.orchestrator.requestPrompt(sessionId, intent).subscribe({
      error: (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.state.setError({ message, recoverable: true });
      },
    });
  }

  onOptionSelected(optionId: string): void {
    if (this.llmBusy) {
      return;
    }

    const prompt = this.state.currentPrompt();
    if (!prompt) {
      return;
    }

    this.llmBusy = true;
    this.state.setLoading(true);

    this.orchestrator.recordSelection(crypto.randomUUID(), prompt.id, optionId).subscribe({
      error: () => {
        this.llmBusy = false;
        this.state.setLoading(false);
      },
    });

    this.llmGateway.getNextQuestion({ turns: [] }, { questionId: prompt.id, optionId }).subscribe({
      next: () => {
        this.llmBusy = false;
        this.state.setLoading(false);
      },
      error: (err: unknown) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.state.setError({ message: errorMessage, recoverable: true });
        this.llmBusy = false;
        this.state.setLoading(false);
      },
    });
  }

  async onGenerate(): Promise<void> {
    const intent = this.intentControl.value;
    const sessionId = crypto.randomUUID();

    try {
      await this.stickyGateway.generate(sessionId, intent);
    } catch (error) {
      this.logger.error('[renderer] generate failed', error);
    }
  }

  onRetry(): void {
    this.state.clearError();
    const intent = this.intentControl.value;
    const sessionId = crypto.randomUUID();

    this.orchestrator.requestPrompt(sessionId, intent).subscribe({
      error: (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.state.setError({ message, recoverable: true });
      },
    });
  }

  onAddKeyResult(): void {
    this.stickyGateway.addKeyResult();
  }

  async reopenSticky(): Promise<void> {
    await this.stickyGateway.reopenSticky();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
