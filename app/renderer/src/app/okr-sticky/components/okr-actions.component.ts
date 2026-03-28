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
import { TranslatePipe } from '../../shared/pipes/translate.pipe.js';
import { ChangeDetectionStrategy, Component, EventEmitter, Output } from '@angular/core';

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
        class="okr-actions__button"
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
        gap: var(--space-sm);
        margin-top: var(--space-sm);
      }

      .okr-actions__button {
        padding: var(--space-sm) var(--space-md);
        border: 1px solid var(--color-primary-alpha-25);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        cursor: pointer;
        font-size: var(--font-size-sm);
        transition: all var(--transition-fast);
      }

      .okr-actions__button:hover {
        background: var(--color-primary-light);
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
