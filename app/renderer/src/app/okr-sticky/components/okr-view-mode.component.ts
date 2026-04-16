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
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

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
          class="okr-view-mode__item animate-enter-up"
          *ngFor="let kr of keyResults; trackBy: trackByKeyResultId; let i = index"
          [class.animate-stagger-1]="i === 0"
          [class.animate-stagger-2]="i === 1"
          [class.animate-stagger-3]="i === 2"
          [class.animate-stagger-4]="i === 3"
          [class.animate-stagger-5]="i >= 4"
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
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .okr-view-mode__item {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding: var(--space-3);
        background: var(--color-bg-primary);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        gap: var(--space-md);
      }

      .okr-view-mode__item-text {
        flex: 1;
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        color: var(--color-text-primary);
        line-height: var(--line-height-normal);
      }

      .okr-view-mode__item-badges {
        display: flex;
        gap: var(--space-1);
        flex-shrink: 0;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .okr-view-mode__badge {
        display: inline-flex;
        align-items: center;
        padding: var(--space-1) var(--space-2);
        background: var(--color-bg-secondary);
        border-radius: var(--radius-full);
        font-size: var(--font-size-xs);
        color: var(--color-text-secondary);
      }

      .okr-view-mode__badge--owner {
        background: var(--color-success-light);
        color: var(--color-success);
      }

      @media (prefers-reduced-motion: reduce) {
        .okr-view-mode__item {
          animation: none;
          opacity: 1;
          transform: none;
        }
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
