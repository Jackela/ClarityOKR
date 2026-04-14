/**
 * OKR Actions Component
 *
 * Displays action buttons for the OKR sticky note including
 * edit mode toggle and add key result.
 *
 * @usage
 * ```html
 * <clarityokr-okr-actions
 *   (edit)="onEdit()"
 *   (addKr)="onAddKeyResult()">
 * </clarityokr-okr-actions>
 * ```
 *
 * @module okr-sticky/components/okr-actions
 */
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Output } from '@angular/core';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'clarityokr-okr-actions',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="okr-actions">
      <button
        type="button"
        class="okr-actions__button"
        data-testid="edit-button"
        (click)="edit.emit()"
      >
        {{ 'common.edit' | translate }}
      </button>
      <button
        type="button"
        class="okr-actions__button okr-actions__button--primary"
        data-testid="sticky-add-kr"
        (click)="addKr.emit()"
      >
        {{ 'okr.actions.addKeyResult' | translate }}
      </button>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .okr-actions {
        display: flex;
        gap: var(--space-2);
        margin-top: var(--space-sm);
      }

      .okr-actions__button {
        padding: var(--space-2) var(--space-3);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-full);
        background: var(--color-bg-primary);
        color: var(--color-text-secondary);
        cursor: pointer;
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        transition:
          background-color var(--duration-fast) var(--ease-snappy),
          border-color var(--duration-fast) var(--ease-snappy),
          color var(--duration-fast) var(--ease-snappy),
          transform var(--duration-micro) var(--ease-snappy);
      }

      .okr-actions__button:hover {
        background: var(--color-bg-secondary);
        color: var(--color-text-primary);
        border-color: var(--color-border-strong);
      }

      .okr-actions__button:active {
        transform: scale(0.97);
      }

      .okr-actions__button--primary {
        background: var(--color-brand-primary);
        color: var(--color-text-inverse);
        border-color: transparent;
      }

      .okr-actions__button--primary:hover {
        background: var(--color-brand-primary-hover);
      }
    `,
  ],
})
export class OkrActionsComponent {
  /** Event emitted when the user clicks the edit button */
  @Output() edit = new EventEmitter<void>();

  /** Event emitted when the user clicks the add key result button */
  @Output() addKr = new EventEmitter<void>();
}
