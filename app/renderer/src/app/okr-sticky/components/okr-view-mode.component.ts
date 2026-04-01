/**
 * OKR View Mode Component
 *
 * Displays the OKR in read-only mode, showing the list of
 * key results with their metrics and owner badges.
 *
 * @usage
 * ```html
 * <clarityokr-okr-view-mode
 *   [keyResults]="okr.keyResults"
 *   (edit)="onEdit()"
 *   (addKr)="onAddKeyResult()"
 *   [showActions]="true">
 * </clarityokr-okr-view-mode>
 * ```
 *
 * @module okr-sticky/components/okr-view-mode
 */
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

import type { KeyResultViewModel } from './types.js';

@Component({
  selector: 'clarityokr-okr-view-mode',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="okr-view-mode">
      <ol class="okr-view-mode__list">
        <li
          class="okr-view-mode__item"
          *ngFor="let kr of keyResults; trackBy: trackByKeyResultId"
          data-testid="sticky-key-result"
        >
          <div class="okr-view-mode__item-text">{{ kr.statement }}</div>
          <div class="okr-view-mode__item-badges">
            <span *ngIf="kr.metricLabel" class="okr-view-mode__badge" data-testid="sticky-kr-badge">
              {{ kr.metricLabel }}
            </span>
            <span
              *ngIf="kr.ownerLabel"
              class="okr-view-mode__badge okr-view-mode__badge--owner"
              data-testid="sticky-kr-badge"
            >
              {{ kr.ownerLabel }}
            </span>
          </div>
        </li>
      </ol>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .okr-view-mode__list {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      .okr-view-mode__item {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding: var(--space-md);
        border-bottom: 1px solid var(--color-border);
        gap: var(--space-md);
      }

      .okr-view-mode__item:last-child {
        border-bottom: none;
      }

      .okr-view-mode__item-text {
        flex: 1;
        font-size: var(--font-size-base);
      }

      .okr-view-mode__item-badges {
        display: flex;
        gap: var(--space-xs);
        flex-shrink: 0;
      }

      .okr-view-mode__badge {
        display: inline-flex;
        align-items: center;
        padding: var(--space-xs) var(--space-sm);
        background: var(--color-primary-light);
        border-radius: var(--radius-full);
        font-size: var(--font-size-sm);
        color: var(--color-text-muted);
      }

      .okr-view-mode__badge--owner {
        background: var(--color-success-light);
        color: var(--color-success);
      }
    `,
  ],
})
export class OkrViewModeComponent {
  /** Array of key results to display */
  @Input() keyResults: KeyResultViewModel[] = [];

  /**
   * TrackBy function for key results to optimize rendering performance.
   *
   * @param _index - The index of the item in the array (unused)
   * @param item - The key result item
   * @returns The unique identifier for the key result
   */
  readonly trackByKeyResultId = (_: number, item: { id: string }) => item.id;
}
