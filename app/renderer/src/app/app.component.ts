import { CommonModule } from '@angular/common';
import { Component, computed, type OnDestroy } from '@angular/core';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';

import { ClarificationWizardComponent } from './clarification/components/clarification-wizard.component';
import type { ClarificationFlowService } from './clarification/services/clarification-flow.service';
import type { SyncClarificationState } from './clarification/services/sync-clarification-state.service';
import type { OkrStickyGatewayService } from './okr-sticky/services/okr-sticky-gateway.service';
import { OkrStickyNoteComponent } from './okr-sticky/components/okr-sticky-note.component';

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
              [attr.aria-label]="flow.state.isClarifying ? '正在加载中' : '开始澄清目标意图'"
              [disabled]="intentControl.invalid || flow.state.isClarifying"
              [attr.aria-busy]="flow.state.isClarifying"
            >
              {{ flow.state.isClarifying ? '加载中...' : '开始澄清' }}
            </button>
          </form>
          @if (flow.state.statusMessage) {
            <p class="status-message" role="alert" aria-live="assertive">
              {{ flow.state.statusMessage }}
            </p>
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

        @if (flow.state.generatedSummary) {
          <section class="result-panel">
            <h2 data-testid="okr-summary">{{ flow.state.generatedSummary }}</h2>
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

  readonly showWizard = computed(
    () => this.state.hasPrompt() || this.state.hasError() || this.state.isLoading(),
  );

  readonly hasStickyNote = computed(() => !!this.flow.state.generatedSummary);

  readonly stickyViewModel = computed(() => this.stickyGateway.getCurrentViewModel());

  readonly isStickyShell =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('view') === 'sticky';

  constructor(
    readonly flow: ClarificationFlowService,
    readonly state: SyncClarificationState,
    private readonly stickyGateway: OkrStickyGatewayService,
  ) {}

  beginClarification(event?: Event): void {
    event?.preventDefault();
    if (this.intentControl.invalid) {
      this.intentControl.markAsTouched();
      return;
    }
    this.flow.beginClarification(this.intentControl.value);
  }

  onOptionSelected(optionId: string): void {
    this.flow.onOptionSelected(optionId);
  }

  async onGenerate(): Promise<void> {
    await this.flow.onGenerate(this.intentControl.value);
  }

  onRetry(): void {
    this.flow.onRetry(this.intentControl.value);
  }

  onAddKeyResult(): void {
    this.stickyGateway.addKeyResult();
  }

  async reopenSticky(): Promise<void> {
    await this.stickyGateway.reopenSticky();
  }

  ngOnDestroy(): void {
    this.flow.dispose();
  }
}
