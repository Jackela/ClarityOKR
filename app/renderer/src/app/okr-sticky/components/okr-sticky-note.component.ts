/**
 * OKR Sticky Note Component - Always-on-Top OKR Display
 *
 * This component displays a generated OKR (Objective and Key Results) in a
 * compact, sticky-note style format. It serves as the main visualization
 * for the OKR clarification workflow output.
 *
 * Key Responsibilities:
 * - Display OKR objective and key results in a readable format
 * - Show metadata including generation time and edit status
 * - Visual indicators for manual edits and metrics
 * - Emit events for user interactions (add key result)
 *
 * Features:
 * - Responsive layout using CSS Grid and Flexbox
 * - Change detection optimization with OnPush strategy
 * - Date pipe formatting for timestamps
 * - Conditional rendering for optional metadata
 *
 * Dependencies:
 * - Angular CommonModule: Common directives (NgIf, NgFor, DatePipe)
 * - OkrStickyViewModel: Type definition for component input data
 *
 * @usage
 * ```html
 * <clarityokr-sticky-note
 *   [okr]="okrViewModel"
 *   (addKr)="onAddKeyResult()">
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
 *   generatedAt: new Date(),
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
  Inject,
  Input,
  Output,
  signal,
} from '@angular/core';

import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { OkrStickyService, type OkrStickyViewModel } from '../services/okr-sticky.service';
import { EditModeStore } from '../state/edit-mode.store';
import { OkrEditModeComponent } from './okr-edit-mode.component';
import { OkrActionsComponent } from './okr-actions.component';

/**
 * Component that renders an OKR as a sticky note card.
 *
 * This standalone component displays the objective, key results, and metadata
 * in a compact visual format suitable for an always-on-top window. It uses
 * OnPush change detection for performance and emits events for user actions.
 *
 * @usageNotes
 * The component expects an OkrStickyViewModel input. If the input is null,
 * the component renders nothing (using *ngIf).
 *
 * Key features:
 * - Displays objective as the main header
 * - Lists key results with metrics and owner badges
 * - Shows generation timestamp and edit status
 * - Emits addKr event when the user wants to add a new key result
 */
@Component({
  selector: 'clarityokr-sticky-note',
  standalone: true,
  imports: [CommonModule, TranslatePipe, OkrEditModeComponent, OkrActionsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sticky-note" *ngIf="okr as viewModel" role="region" aria-label="OKR 便利贴">
      @if (editor.isEditing()) {
        <fieldset
          [disabled]="busy()"
          [attr.aria-busy]="busy()"
          [attr.aria-label]="'common.edit' | translate"
          class="sticky-note__edit-fields"
        >
          <clarityokr-okr-edit-mode
            [draftObjective]="editor.draftObjective()"
            [draftKeyResults]="editor.draftKeyResults()"
            [errors]="editor.errors()"
            [canSave]="editor.isValid() && editor.isDirty() && !busy()"
            (objectiveChange)="editor.updateObjective($event)"
            (keyResultChange)="editor.updateKeyResult($event.id, { statement: $event.statement })"
            (save)="save()"
            (cancel)="cancel()"
          />
        </fieldset>
      } @else {
        <header class="sticky-note__header">
          <h1 data-testid="sticky-objective">{{ viewModel.objective }}</h1>
          <div class="sticky-note__meta">
            <span class="sticky-note__badge">
              {{ 'okr.header.generated' | translate }}: {{ viewModel.generatedAt | date: 'medium' }}
            </span>
            <span
              *ngIf="viewModel.lastEditedAt"
              class="sticky-note__badge sticky-note__badge--edit"
            >
              {{ 'okr.header.lastEdited' | translate }}:
              {{ viewModel.lastEditedAt | date: 'medium' }}
            </span>
            <span
              *ngIf="viewModel.hasManualEdits"
              class="sticky-note__badge sticky-note__badge--edit"
              data-testid="sticky-manual-edits"
            >
              {{ 'okr.header.manualEdits' | translate }}
            </span>
          </div>
          <button
            type="button"
            class="sticky-note__action"
            data-testid="sticky-add-kr"
            (click)="addKr.emit()"
          >
            {{ 'okr.actions.addKeyResult' | translate }}
          </button>
        </header>

        <ol class="sticky-note__list">
          <li
            class="sticky-note__item"
            *ngFor="let kr of viewModel.keyResults; trackBy: trackByKeyResultId; let i = index"
            data-testid="sticky-key-result"
          >
            <span class="sticky-note__item-number" aria-hidden="true">{{ i + 1 }}</span>
            <div class="sticky-note__item-content">
              <div class="sticky-note__item-text">{{ kr.statement }}</div>
              <div class="sticky-note__item-badges">
                <span
                  *ngIf="kr.metricLabel"
                  class="sticky-note__badge"
                  data-testid="sticky-kr-badge"
                >
                  {{ kr.metricLabel }}
                </span>
                <span
                  *ngIf="kr.ownerLabel"
                  class="sticky-note__badge sticky-note__badge--owner"
                  data-testid="sticky-kr-badge"
                >
                  {{ kr.ownerLabel }}
                </span>
              </div>
            </div>
          </li>
        </ol>
        <clarityokr-okr-actions (edit)="beginEdit()" (addKr)="addKr.emit()" />
        @if (!busy()) {
          <button
            type="button"
            data-testid="regenerate-button"
            (click)="showPolicies.set(!showPolicies())"
          >
            {{ 'okr.actions.regenerate' | translate }}
          </button>
          <button type="button" data-testid="copy-button" (click)="copy()">
            {{ 'common.copy' | translate }}
          </button>
        }
        @if (showPolicies()) {
          <button type="button" data-testid="policy-overwrite" (click)="regenerate('overwrite')">
            {{ 'okr.actions.overwrite' | translate }}
          </button>
          <button type="button" data-testid="policy-append" (click)="regenerate('append')">
            {{ 'okr.actions.append' | translate }}
          </button>
        }
        @if (copied()) {
          <span role="status" data-testid="copy-success">{{ 'common.copied' | translate }}</span>
        }
      }
      @if (error()) {
        <p role="alert" data-testid="sticky-error">{{ error() }}</p>
      }
    </section>
  `,
  styleUrls: ['./okr-sticky-note.component.scss'],
})
export class OkrStickyNoteComponent {
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly copied = signal(false);
  readonly showPolicies = signal(false);

  constructor(
    @Inject(EditModeStore) readonly editor: EditModeStore,
    @Inject(OkrStickyService) private readonly gateway: OkrStickyService,
  ) {}

  beginEdit(): void {
    if (!this.okr || this.busy()) return;
    this.editor.enterEditMode(
      this.okr.objective,
      this.okr.keyResults.map((kr) => ({
        id: kr.id,
        statement: kr.statement,
        successMetric: kr.metricLabel ?? undefined,
        owner: kr.ownerLabel ?? undefined,
      })),
    );
  }

  /** Cancel local edits only while no gateway operation is pending. */
  cancel(): void {
    if (!this.editor.isEditing() || this.busy()) return;
    this.editor.cancelEdits();
  }

  async save(): Promise<void> {
    if (!this.editor.isValid() || !this.editor.isDirty() || this.busy()) return;
    const state = this.editor.getState();
    await this.perform(async () => {
      await this.gateway.saveEdits({
        objective: state.draftObjective,
        keyResults: state.draftKeyResults.map((kr) => ({
          id: kr.id,
          statement: kr.statement,
          successMetric: kr.successMetric || undefined,
          owner: kr.owner || undefined,
        })),
      });
      this.editor.saveEdits();
    });
  }

  async regenerate(policy: 'overwrite' | 'append'): Promise<void> {
    this.showPolicies.set(false);
    await this.perform(() => this.gateway.regenerate(policy));
  }

  async copy(): Promise<void> {
    this.copied.set(false);
    await this.perform(async () => {
      await this.gateway.copy();
      this.copied.set(true);
    });
  }

  private async perform(operation: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await operation();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy.set(false);
    }
  }

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
   * TrackBy function for key results to optimize rendering performance.
   *
   * Angular uses this to identify which items have changed in the list,
   * minimizing DOM manipulations when the key results array updates.
   *
   * @param _index - The index of the item in the array (unused)
   * @param item - The key result item
   * @returns The unique identifier for the key result
   */
  readonly trackByKeyResultId = (_: number, item: { id: string }) => item.id;
}
