/**
 * OKR Edit Mode Component
 *
 * Displays the OKR in edit mode with form inputs for the
 * objective and key results, including validation and character counters.
 *
 * @usage
 * ```html
 * <clarityokr-okr-edit-mode
 *   [draftObjective]="draftObjective"
 *   [draftKeyResults]="draftKeyResults"
 *   [errors]="errors"
 *   [canSave]="canSave"
 *   (objectiveChange)="onObjectiveChange($event)"
 *   (save)="onSave()"
 *   (cancel)="onCancel()">
 * </clarityokr-okr-edit-mode>
 * ```
 *
 * @module okr-sticky/components/okr-edit-mode
 */
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonComponent, InputComponent } from '@shared/components';
import { TranslatePipe } from '@shared/pipes/translate.pipe';
import type { DraftKeyResult, ValidationError } from '../state/edit-mode.store';

@Component({
  selector: 'clarityokr-okr-edit-mode',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, InputComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="okr-edit-mode">
      <header class="okr-edit-mode__header">
        <div class="okr-edit-mode__field">
          <label for="objective-input">{{ 'okr.sticky.editMode.objectiveLabel' | translate }}</label>
          <clarityokr-input
            id="objective-input"
            [(ngModel)]="draftObjectiveProxy"
            [placeholder]="'okr.sticky.editMode.objectivePlaceholder' | translate"
            [invalid]="hasObjectiveError()"
            [errorMessage]="getObjectiveError()"
            testId="objective-input"
          ></clarityokr-input>
          <span class="char-counter" [class.char-counter--error]="draftObjective.length > 200">
            {{ draftObjective.length }}/200
          </span>
        </div>

        <div class="okr-edit-mode__actions">
          <clarityokr-button
            variant="primary"
            size="sm"
            [disabled]="!canSave"
            testId="save-button"
            (onClick)="save.emit()"
          >
            {{ 'common.save' | translate }}
          </clarityokr-button>
          <clarityokr-button
            variant="ghost"
            size="sm"
            testId="cancel-button"
            (onClick)="cancel.emit()"
          >
            {{ 'common.cancel' | translate }}
          </clarityokr-button>
        </div>
      </header>

      <div class="okr-edit-mode__key-results">
        <label>{{ 'okr.sticky.editMode.keyResultsLabel' | translate }}</label>
        <div class="okr-edit-mode__kr-item" *ngFor="let kr of draftKeyResults; let i = index">
          <clarityokr-input
            [(ngModel)]="kr.statement"
            [placeholder]="'okr.sticky.editMode.keyResultPlaceholder' | translate"
            [invalid]="hasKrError(kr.id)"
            [errorMessage]="getKrError(kr.id)"
            [testId]="'kr-input-' + i"
          ></clarityokr-input>
          <span class="char-counter" [class.char-counter--error]="kr.statement.length > 180">
            {{ kr.statement.length }}/180
          </span>
        </div>
      </div>

      <!-- Validation Errors Summary -->
      <div *ngIf="errors.length > 0" class="validation-errors">
        <div *ngFor="let error of errors" class="validation-error" role="alert">
          {{ error.message }}
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .okr-edit-mode__header {
        display: flex;
        flex-direction: column;
        gap: var(--space-md);
      }

      .okr-edit-mode__field {
        display: flex;
        flex-direction: column;
        gap: var(--space-xs);
      }

      .okr-edit-mode__field label,
      .okr-edit-mode__key-results label {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        color: var(--color-text-muted);
      }

      .okr-edit-mode__actions {
        display: flex;
        gap: var(--space-sm);
        margin-top: var(--space-sm);
      }

      .okr-edit-mode__key-results {
        display: flex;
        flex-direction: column;
        gap: var(--space-md);
        margin-top: var(--space-lg);
      }

      .okr-edit-mode__kr-item {
        display: flex;
        flex-direction: column;
        gap: var(--space-xs);
      }

      .char-counter {
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
        text-align: right;
      }

      .char-counter--error {
        color: var(--color-error);
      }

      .validation-errors {
        margin-top: var(--space-md);
        padding: var(--space-md);
        background: var(--color-error-light);
        border-radius: var(--radius-md);
        border: 1px solid var(--color-error);
      }

      .validation-error {
        font-size: var(--font-size-sm);
        color: var(--color-error);
      }

      .validation-error + .validation-error {
        margin-top: var(--space-xs);
      }
    `,
  ],
})
export class OkrEditModeComponent {
  /** Current draft objective value */
  @Input() draftObjective!: string;

  /** Array of draft key results for editing */
  @Input() draftKeyResults: DraftKeyResult[] = [];

  /** Array of validation errors */
  @Input() errors: ValidationError[] = [];

  /** Whether the current state can be saved */
  @Input() canSave = false;

  /** Event emitted when the draft objective changes */
  @Output() objectiveChange = new EventEmitter<string>();

  /** Event emitted when the user clicks save */
  @Output() save = new EventEmitter<void>();

  /** Event emitted when the user clicks cancel */
  @Output() cancel = new EventEmitter<void>();

  /** Proxy for draft objective to enable two-way binding */
  get draftObjectiveProxy(): string {
    return this.draftObjective;
  }

  set draftObjectiveProxy(value: string) {
    this.objectiveChange.emit(value);
  }

  /**
   * Check if objective has validation error
   */
  hasObjectiveError(): boolean {
    return this.errors.some((e) => e.field === 'objective');
  }

  /**
   * Get objective validation error message
   */
  getObjectiveError(): string {
    const error = this.errors.find((e) => e.field === 'objective');
    return error?.message ?? '';
  }

  /**
   * Check if key result has validation error
   */
  hasKrError(krId: string): boolean {
    return this.errors.some((e) => e.field === `keyResults.${krId}.statement`);
  }

  /**
   * Get key result validation error message
   */
  getKrError(krId: string): string {
    const error = this.errors.find((e) => e.field === `keyResults.${krId}.statement`);
    return error?.message ?? '';
  }
}
