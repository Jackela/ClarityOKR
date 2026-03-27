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
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import type { OkrStickyViewModel } from '../services/okr-projection.service';

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
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="sticky-note" *ngIf="okr as viewModel">
      <header class="sticky-note__header">
        <h1 data-testid="sticky-objective">{{ viewModel.objective }}</h1>
        <div class="sticky-note__meta">
          <span class="sticky-note__badge">
            Generated: {{ viewModel.generatedAt | date: 'medium' }}
          </span>
          <span *ngIf="viewModel.lastEditedAt" class="sticky-note__badge sticky-note__badge--edit">
            Last edited: {{ viewModel.lastEditedAt | date: 'medium' }}
          </span>
          <span
            *ngIf="viewModel.hasManualEdits"
            class="sticky-note__badge sticky-note__badge--edit"
            data-testid="sticky-manual-edits"
          >
            Contains manual edits
          </span>
        </div>
        <button
          type="button"
          class="sticky-note__action"
          data-testid="sticky-add-kr"
          (click)="addKr.emit()"
        >
          Add Key Result
        </button>
      </header>

      <ol class="sticky-note__list">
        <li
          class="sticky-note__item"
          *ngFor="let kr of viewModel.keyResults; trackBy: trackByKeyResultId"
          data-testid="sticky-key-result"
        >
          <div class="sticky-note__item-text">{{ kr.statement }}</div>
          <div class="sticky-note__item-badges">
            <span *ngIf="kr.metricLabel" class="sticky-note__badge" data-testid="sticky-kr-badge">
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
        </li>
      </ol>
    </section>
  `,
  styles: [],
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
