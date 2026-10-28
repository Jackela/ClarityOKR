import { CommonModule } from '@angular/common';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import {
  Component,
  Injector,
  NgZone,
  Renderer2,
  computed,
  inject,
  signal,
  type OnDestroy,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { IPC_CHANNELS, type DraftRow } from '@clarityokr/contracts';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { Subject, defer } from 'rxjs';
import { finalize, switchMap, takeUntil } from 'rxjs/operators';

import { ClarificationWizardComponent } from './clarification/components/clarification-wizard.component';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ClarificationOrchestratorService } from './clarification/services/clarification-orchestrator.service';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ClarificationStateMachine } from './clarification/services/clarification-state-machine.service';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { OkrStickyService } from './okr-sticky/services/okr-sticky.service';
import { StickyShellComponent } from './closed-loop/sticky-shell.component';
import { OkrStickyNoteComponent } from './okr-sticky/components/okr-sticky-note.component';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Logger } from './core/services/logger.service';
import { TranslatePipe } from './shared/pipes/translate.pipe';
import { ThemeToggleComponent } from './shared/components/theme-toggle.component';
import { DialogComponent } from './shared/components/dialog.component';
import { ClosedLoopApi } from './closed-loop/closed-loop-api.service';
import { COPY } from './closed-loop/copy';
import { ExitConfirmComponent } from './closed-loop/exit-confirm.component';
import { StorageNoticesComponent } from './closed-loop/storage-notices.component';
import { UnsavedReporter } from './closed-loop/unsaved-reporter.service';
import { DraftRestoreBarComponent } from './closed-loop/draft-restore-bar.component';
import {
  DraftRestoreHosts,
  textEditDraftRows,
  textEditTarget,
  type DraftApplyResult,
} from './closed-loop/draft-restore';
import { watchDraftRows } from './closed-loop/draft-reporter';
import { EditModeStore } from './okr-sticky/state/edit-mode.store';

@Component({
  selector: 'clarityokr-root',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ClarificationWizardComponent,
    OkrStickyNoteComponent,
    StickyShellComponent,
    TranslatePipe,
    ThemeToggleComponent,
    StorageNoticesComponent,
    DialogComponent,
    ExitConfirmComponent,
    DraftRestoreBarComponent,
  ],
  template: `
    @if (!isStickyShell) {
      <a href="#main-content" class="skip-link">{{ 'common.skipToContent' | translate }}</a>
      <!-- Full-width bars above the content (spec §7 / §7a): memory, fresh file, legacy. -->
      <clarityokr-storage-notices window="main" />
      <!-- #110: what a session end left unsaved in the wizard (S3§12). -->
      <clarityokr-draft-restore-bar />
      <main id="main-content" class="app-shell" tabindex="-1">
        <section class="intent-panel">
          <div class="intent-header">
            <h1 class="headline" id="main-heading" tabindex="-1">ClarityOKR</h1>
            <div class="intent-header__actions">
              @if (hasStickyNote()) {
                <button
                  type="button"
                  class="sticky-reopen"
                  data-testid="sticky-reopen"
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
                  data-testid="intent-input"
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
                  data-testid="start-clarification"
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
          <section class="result-panel" data-testid="okr-summary" aria-label="OKR">
            <clarityokr-sticky-note #mainNote [okr]="stickyViewModel()"></clarityokr-sticky-note>
          </section>
        }
        @if (newOkrConfirm()) {
          <clarityokr-dialog
            [title]="newOkrCopy.confirmTitle"
            [body]="newOkrCopy.confirmBody"
            [cancelLabel]="newOkrCopy.keep"
            [confirmLabel]="newOkrCopy.restart"
            [danger]="true"
            testId="new-okr-dialog"
            (cancelled)="keepWizard()"
            (confirmed)="restartWizard()"
          />
        }
      </main>
    } @else {
      <clarityokr-sticky-shell [okr]="stickyViewModel()"></clarityokr-sticky-shell>
    }
    <!-- Quit / restart confirmation (spec §1.2c), in whichever window the main process picks. -->
    <clarityokr-exit-confirm />
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

  readonly newOkrCopy = COPY.newOkr;
  /** The current clarification already produced an OKR (the state machine stays in `ready`). */
  private readonly okrGenerated = signal(false);
  /** §4.5a: 「新建 OKR」 arrived while the wizard holds input. */
  readonly newOkrConfirm = signal(false);

  private readonly intentValue = toSignal(this.intentControl.valueChanges, { initialValue: '' });
  private readonly editor = inject(EditModeStore);
  /** The main window's note (its text edit), for 恢复 of a text edit draft (#110). */
  private readonly mainNote = viewChild<OkrStickyNoteComponent>('mainNote');
  private readonly closedLoopApi = inject(ClosedLoopApi);
  private readonly zone = inject(NgZone);
  private unsubscribeNewOkr: () => void = () => undefined;

  /**
   * The wizard holds input that is not an OKR yet: a typed goal, or a clarification that started
   * and did not complete (answers, a question on screen, an error to retry).
   */
  readonly wizardDirty = computed(() => {
    const workflow = this.state.workflowState();
    if (workflow === 'completed' || (this.okrGenerated() && workflow !== 'idle')) return false;
    if (workflow !== 'idle') return true;
    return this.intentValue().trim().length > 0 || this.state.history().length > 0;
  });

  constructor(
    readonly state: ClarificationStateMachine,
    private readonly orchestrator: ClarificationOrchestratorService,
    private readonly stickyGateway: OkrStickyService,
    private readonly logger: Logger,
    private readonly renderer: Renderer2,
  ) {
    if (this.isStickyShell) return;
    inject(UnsavedReporter).watch(
      computed(() => ({
        wizard: this.wizardDirty(),
        textEdit: this.editor.isEditing() && this.editor.isDirty(),
        reviewDraft: false,
      })),
      inject(Injector),
    );
    // #110: the wizard's content, for a draft if the session ends (S3§12.1).
    watchDraftRows(
      computed<DraftRow[]>(() => {
        const rows: DraftRow[] = this.wizardDirty()
          ? [{ kind: 'wizard', step: this.wizardStep(), intent: this.intentValue() }]
          : [];
        // The main window's own text edit (S3§12, 产品经理 decision 2①): same rows as the sticky's.
        const okrId = this.stickyViewModel()?.id;
        if (okrId) rows.push(...textEditDraftRows(this.editor, okrId));
        return rows;
      }),
      inject(Injector),
    );
    inject(DraftRestoreHosts).register({
      targetOf: (row) => {
        if (row.kind === 'textEdit') {
          const vm = this.stickyViewModel();
          const saved =
            vm && vm.id === row.okrId
              ? vm.keyResults.map((kr) => ({
                  id: kr.id,
                  statement: kr.statement,
                  successMetric: kr.metricLabel ?? '',
                }))
              : null;
          return textEditTarget(row, saved, this.editor.isEditing() && this.editor.isDirty());
        }
        return this.wizardDirty() ? 'dirty' : 'untouched';
      },
      apply: (rows) => this.applyDraft(rows),
      focusHeading: () => document.getElementById('main-heading')?.focus(),
    });
    this.unsubscribeNewOkr = this.closedLoopApi.onEvent(IPC_CHANNELS.WIZARD_NEW_OKR, () =>
      this.zone.run(() => this.onNewOkr()),
    );
  }

  /**
   * #110 「恢复」 in the main window: the wizard goal back into its field, the key result texts
   * back into the note's text edit (all still unsaved). Focus (S3§12.3): wizard goal first, else
   * the first restored key result input. Undone by `rollback` when the draft cannot be settled.
   */
  private async applyDraft(rows: readonly DraftRow[]): Promise<DraftApplyResult> {
    const wizard = rows.find((r) => r.kind === 'wizard');
    const vm = this.stickyViewModel();
    const krs = rows.flatMap((r) =>
      r.kind === 'textEdit' && vm && r.okrId === vm.id
        ? [{ krId: r.krId, statement: r.draft.statement, successMetric: r.draft.successMetric }]
        : [],
    );
    // A text edit row of an OKR this window does not show cannot be put back here.
    if (rows.some((r) => r.kind === 'textEdit') && krs.length === 0) return { ok: false };
    if (!wizard && krs.length === 0) return { ok: false };
    const intentBefore = this.intentControl.value;
    const c = this.intentControl;
    const stateBefore = { touched: c.touched, dirty: c.dirty };
    const wasEditing = this.editor.isEditing();
    const editBefore = this.editor.draftKeyResults().map((kr) => ({ ...kr }));
    if (krs.length > 0) {
      const note = this.mainNote();
      if (!note || !note.restoreDraft(krs)) return { ok: false };
    }
    if (wizard && wizard.kind === 'wizard') {
      this.newOkrConfirm.set(false);
      this.intentControl.setValue(wizard.intent);
    }
    const focusId = wizard ? 'intent-input' : `edit-kr-${krs[0].krId}`;
    setTimeout(() => {
      document
        .querySelector<HTMLElement>(`[id="${focusId}"]`)
        ?.focus({ focusVisible: true } as FocusOptions);
    }, 50);
    return {
      ok: true,
      rollback: () => {
        if (wizard) {
          // S3-05: the field goes back exactly as it was, validation state included (no hint).
          c.setValue(intentBefore);
          if (stateBefore.dirty) c.markAsDirty();
          else c.markAsPristine();
          if (stateBefore.touched) c.markAsTouched();
          else c.markAsUntouched();
          // the blur of the focused goal field must not mark it touched again
          (document.activeElement as HTMLElement | null)?.blur?.();
          setTimeout(() => {
            if (!stateBefore.touched) c.markAsUntouched();
          }, 0);
        }
        if (krs.length > 0) {
          if (!wasEditing) this.editor.cancelEdits();
          else for (const kr of editBefore) this.editor.updateKeyResult(kr.id, kr);
        }
      },
    };
  }

  /** The wizard step on screen: 1 for the goal, then one per question answered. */
  wizardStep(): number {
    return this.state.workflowState() === 'idle' ? 1 : this.state.history().length + 1;
  }

  /** 「新建 OKR」 from the sticky window (spec §4.5 / §4.5a); the window is already shown. */
  onNewOkr(): void {
    if (this.newOkrConfirm()) return;
    if (this.wizardDirty()) {
      this.newOkrConfirm.set(true);
      return;
    }
    this.resetWizard();
  }

  /** 「继续当前向导」 / Esc: nothing is lost; the focus goes back to where it was. */
  keepWizard(): void {
    this.newOkrConfirm.set(false);
    // The dialog gives the focus back to the field that had it; when the window had no focus
    // before (the click came from the sticky window), the wizard's first field takes it.
    setTimeout(() => {
      if (document.activeElement === document.body || document.activeElement === null) {
        this.focusWizardStart();
      }
    }, 0);
  }

  /** 「重新开始」: back to step one, focus in its first field. */
  restartWizard(): void {
    this.newOkrConfirm.set(false);
    this.resetWizard();
  }

  private resetWizard(): void {
    this.okrGenerated.set(false);
    this.state.reset();
    this.intentControl.reset('');
    setTimeout(() => this.focusWizardStart(), 0);
  }

  private focusWizardStart(): void {
    const input = document.getElementById('intent-input');
    if (input) {
      input.focus();
      return;
    }
    (document.querySelector('clarityokr-clarification-wizard') as HTMLElement | null)?.focus();
  }

  beginClarification(event?: Event): void {
    event?.preventDefault();
    if (this.intentControl.invalid) {
      this.intentControl.markAsTouched();
      return;
    }

    const intent = this.intentControl.value;
    this.okrGenerated.set(false);
    this.state.reset();
    this.state.start(intent);

    this.currentSessionId = crypto.randomUUID();
    defer(() => this.orchestrator.requestPrompt(this.currentSessionId, intent))
      .pipe(takeUntil(this.destroy$))
      .subscribe({
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
    // A new answer after 生成 OKR is new input again (unsaved until the next OKR).
    this.okrGenerated.set(false);

    defer(() => this.orchestrator.recordSelection(this.currentSessionId, prompt.id, optionId))
      .pipe(
        switchMap(() => this.orchestrator.requestNextQuestion(prompt.id, optionId)),
        finalize(() => {
          this.llmBusy = false;
          this.state.setLoading(false);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        error: (error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          this.state.setError({ message, recoverable: true });
        },
      });
  }

  async onGenerate(): Promise<void> {
    const intent = this.intentControl.value;

    try {
      await this.stickyGateway.generate(this.currentSessionId, intent);
      // The wizard's input is an OKR now: nothing unsaved is left in it.
      this.okrGenerated.set(true);
    } catch (error) {
      this.logger.error('[renderer] generate failed', error);
    }
  }

  onRetry(): void {
    this.okrGenerated.set(false);
    const selections = this.state.getStateSnapshot().selections;
    const lastChoice = Object.entries(selections).at(-1);
    this.state.clearError();
    this.state.setLoading(true);
    const request = defer(() =>
      lastChoice
        ? this.orchestrator.requestNextQuestion(lastChoice[0], lastChoice[1])
        : this.orchestrator.requestPrompt(this.currentSessionId, this.intentControl.value),
    );
    request.pipe(takeUntil(this.destroy$)).subscribe({
      error: (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.state.setError({ message, recoverable: true });
      },
    });
  }

  async reopenSticky(): Promise<void> {
    await this.stickyGateway.reopenSticky();
  }

  ngOnDestroy(): void {
    this.unsubscribeNewOkr();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
