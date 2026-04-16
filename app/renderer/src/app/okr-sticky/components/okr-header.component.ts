/**
 * OKR Header Component
 *
 * Displays the OKR title (objective) and metadata including
 * generation timestamp and edit status.
 *
 * @usage
 * ```html
 * <clarityokr-okr-header
 *   [objective]="okr.objective"
 *   [generatedAt]="okr.generatedAt"
 *   [lastEditedAt]="okr.lastEditedAt"
 *   [hasManualEdits]="okr.hasManualEdits">
 * </clarityokr-okr-header>
 * ```
 *
 * @module okr-sticky/components/okr-header
 */
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { TranslatePipe } from '@shared/pipes/translate.pipe';

@Component({
  selector: 'clarityokr-okr-header',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="okr-header">
      <h1 data-testid="sticky-objective">{{ objective }}</h1>
      <div class="okr-header__meta">
        <span class="okr-header__badge"> {{ 'okr.header.generated' | translate }}: {{ generatedAt | date: 'medium' }} </span>
        <span *ngIf="lastEditedAt" class="okr-header__badge okr-header__badge--edit">
          {{ 'okr.header.lastEdited' | translate }}: {{ lastEditedAt | date: 'medium' }}
        </span>
        <span
          *ngIf="hasManualEdits"
          class="okr-header__badge okr-header__badge--edit"
          data-testid="sticky-manual-edits"
        >
          {{ 'okr.header.manualEdits' | translate }}
        </span>
      </div>
    </header>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .okr-header {
        margin-bottom: var(--space-md);
      }

      .okr-header h1 {
        font-size: var(--font-size-xl);
        font-weight: var(--font-weight-bold);
        margin: 0 0 var(--space-xs) 0;
        line-height: var(--line-height-tight);
        color: var(--color-text-primary);
      }

      .okr-header__meta {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        margin-bottom: var(--space-xs);
      }

      .okr-header__badge {
        display: inline-flex;
        align-items: center;
        padding: var(--space-1) var(--space-2);
        background: var(--color-bg-secondary);
        border-radius: var(--radius-full);
        font-size: var(--font-size-xs);
        color: var(--color-text-secondary);
      }

      .okr-header__badge--edit {
        background: var(--color-warning-light);
        color: var(--color-warning);
      }
    `,
  ],
})
export class OkrHeaderComponent {
  /** The objective title to display */
  @Input() objective!: string;

  /** ISO timestamp when the OKR was generated */
  @Input() generatedAt!: string;

  /** Optional ISO timestamp of last edit */
  @Input() lastEditedAt: string | null = null;

  /** Whether the OKR has been manually edited */
  @Input() hasManualEdits = false;
}
