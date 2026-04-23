import { CommonModule } from '@angular/common';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Component, computed, type OnDestroy, Renderer2 } from '@angular/core';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { Subject } from 'rxjs';

import { ClarificationWizardComponent } from './clarification/components/clarification-wizard.component';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ClarificationOrchestratorService } from './clarification/services/clarification-orchestrator.service';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ClarificationStateMachine } from './clarification/services/clarification-state-machine.service';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { IpcLlmGateway } from './clarification/services/ipc-llm-gateway.service';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { OkrStickyService } from './okr-sticky/services/okr-sticky.service';
import { OkrStickyNoteComponent } from './okr-sticky/components/okr-sticky-note.component';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Logger } from './core/services/logger.service';
import { TranslatePipe } from './shared/pipes/translate.pipe';
import { ThemeToggleComponent } from './shared/components/theme-toggle.component';

@Component({
  selector: 'clarityokr-root',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ClarificationWizardComponent,
    OkrStickyNoteComponent,
    TranslatePipe,
    ThemeToggleComponent,
  ],
  template: `
    @if (!isStickyShell) {
      <a href="#main-content" class="skip-link">{{ 'common.skipToContent' | translate }}</a>
      <main id="main-content" class="app-shell" tabindex="-1">
        <section class="intent-panel">
          <div class="intent-header">
            <h1 class="headline">ClarityOKR</h1>
            <div class="intent-header__actions">
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
              <clarityokr-theme-toggle></clarityokr-theme-toggle>
            </div>
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
            class="wizard-panel"
            #wizard
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
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private llmBusy = false;
  private currentSessionId = '';

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
    private readonly renderer: Renderer2,
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

    this.currentSessionId = crypto.randomUUID();
    this.orchestrator.requestPrompt(this.currentSessionId, intent).subscribe({
      error: (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.state.setError({ message, recoverable: true });
      },
    });

    // Move focus to the wizard container for screen reader users
    setTimeout(() => {
      const wizardEl = document.querySelector('clarityokr-clarification-wizard');
      if (wizardEl) {
        this.renderer.setAttribute(wizardEl, 'tabindex', '-1');
        (wizardEl as HTMLElement).focus();
      }
    }, 0);
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

    this.orchestrator.recordSelection(this.currentSessionId, prompt.id, optionId).subscribe({
      error: () => {
        this.llmBusy = false;
        this.state.setLoading(false);
      },
    });

    this.orchestrator.requestNextQuestion(prompt.id, optionId).subscribe({
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

    try {
      await this.stickyGateway.generate(this.currentSessionId, intent);
    } catch (error) {
      this.logger.error('[renderer] generate failed', error);
    }
  }

  onRetry(): void {
    this.state.clearError();
    const intent = this.intentControl.value;
    this.currentSessionId = crypto.randomUUID();

    this.orchestrator.requestPrompt(this.currentSessionId, intent).subscribe({
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
