/**
 * OKR Sticky Note Component - Always-on-Top OKR Display
 *
 * This component displays a generated OKR (Objective and Key Results) in a
 * compact, sticky-note style format. It serves as the main visualization
 * for the OKR clarification workflow output.
 *
 * This is a **container component** that orchestrates presentational components:
 * - {@link OkrHeaderComponent}: Displays title and metadata
 * - {@link OkrActionsComponent}: Action buttons (edit, add key result)
 * - {@link OkrViewModeComponent}: Read-only key results display
 * - {@link OkrEditModeComponent}: Editable form with validation
 *
 * Key Responsibilities:
 * - Manage container layout and styling
 * - Coordinate edit mode state via EditModeStore
 * - Transform between view model and edit model formats
 * - Emit events for parent component actions
 *
 * Features:
 * - Dual mode: view mode vs edit mode
 * - Responsive layout using CSS Grid and Flexbox
 * - Change detection optimization with OnPush strategy
 * - Validation and character counters in edit mode
 *
 * @usage
 * ```html
 * <clarityokr-sticky-note
 *   [okr]="okrViewModel"
 *   (addKr)="onAddKeyResult()"
 *   (saveEdits)="onSaveEdits($event)">
 * </clarityokr-sticky-note>
 * ```
 *
 * @example
 * ```typescript
 * const viewModel: OkrStickyViewModel = {
 *   objective: 'Improve team productivity',
 *   keyResults: [
 *     { id: 'kr1', statement: 'Reduce deployment time by 50%', metricLabel: 'Time', ownerLabel: 'DevOps' }
 *   ],
 *   generatedAt: new Date().toISOString(),
 *   hasManualEdits: true
 * };
 * ```
 *
 * @module okr-sticky/components/okr-sticky-note
 */
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  inject,
  Input,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonComponent } from '../../shared/components/button.component';
import { InputComponent } from '../../shared/components/input.component';
import { EditModeStore } from '../state/edit-mode.store.js';
import type { OkrStickyViewModel } from './types.js';
import { OkrActionsComponent } from './okr-actions.component.js';
import { OkrEditModeComponent } from './okr-edit-mode.component.js';
import { OkrHeaderComponent } from './okr-header.component.js';
import { OkrViewModeComponent } from './okr-view-mode.component.js';

/**
 * Save edits event payload
 */
export interface SaveEditsEvent {
  objective: string;
  keyResults: Array<{
    id: string;
    statement: string;
    successMetric?: string;
    owner?: string;
  }>;
}

@Component({
  selector: 'clarityokr-sticky-note',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonComponent,
    InputComponent,
    OkrHeaderComponent,
    OkrActionsComponent,
    OkrViewModeComponent,
    OkrEditModeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sticky-note" *ngIf="okr as viewModel">
      <!-- View Mode -->
      <ng-container *ngIf="!editStore.isEditing()">
        <clarityokr-okr-header
          [objective]="viewModel.objective"
          [generatedAt]="viewModel.generatedAt"
          [lastEditedAt]="viewModel.lastEditedAt"
          [hasManualEdits]="viewModel.hasManualEdits"
        ></clarityokr-okr-header>

        <clarityokr-okr-actions
          (edit)="enterEditMode()"
          (addKr)="addKr.emit()"
        ></clarityokr-okr-actions>

        <clarityokr-okr-view-mode [keyResults]="viewModel.keyResults"></clarityokr-okr-view-mode>
      </ng-container>

      <!-- Edit Mode -->
      <ng-container *ngIf="editStore.isEditing()">
        <clarityokr-okr-edit-mode
          [draftObjective]="editStore.draftObjective()"
          [draftKeyResults]="editStore.draftKeyResults()"
          [errors]="editStore.errors()"
          [canSave]="canSave()"
          (objectiveChange)="editStore.updateObjective($event)"
          (save)="onSaveEdits()"
          (cancel)="cancelEdit()"
        ></clarityokr-okr-edit-mode>
      </ng-container>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .sticky-note {
        padding: var(--space-lg);
      }
    `,
  ],
})
export class OkrStickyNoteComponent {
  /**
   * The OKR view model to display.
   *
   * Contains the objective, key results array, and metadata about generation
   * and editing. When null, the component renders nothing.
   */
  @Input() okr: OkrStickyViewModel | null = null;

  /**
   * Event emitted when the user clicks the "Add Key Result" button.
   *
   * Parent components should listen to this event to handle adding
   * new key results to the OKR.
   */
  @Output() addKr = new EventEmitter<void>();

  /**
   * Event emitted when the user saves edits.
   *
   * Contains the updated objective and key results.
   */
  @Output() saveEdits = new EventEmitter<SaveEditsEvent>();

  /**
   * Edit mode store for managing edit state
   */
  readonly editStore = inject(EditModeStore);

  /**
   * Enter edit mode with current OKR values
   */
  enterEditMode(): void {
    if (this.okr) {
      this.editStore.enterEditMode(
        this.okr.objective,
        this.okr.keyResults.map((kr) => ({
          id: kr.id,
          statement: kr.statement,
          successMetric: kr.metricLabel ?? undefined,
          owner: kr.ownerLabel ?? undefined,
        })),
      );
    }
  }

  /**
   * Save edits and emit event
   */
  onSaveEdits(): void {
    if (this.canSave()) {
      const result = this.editStore.saveEdits();
      this.saveEdits.emit({
        objective: result.objective,
        keyResults: result.keyResults,
      });
    }
  }

  /**
   * Cancel edit mode
   */
  cancelEdit(): void {
    this.editStore.cancelEdits();
  }

  /**
   * Check if edits can be saved
   */
  canSave(): boolean {
    return this.editStore.isValid() && this.editStore.isDirty();
  }
}
