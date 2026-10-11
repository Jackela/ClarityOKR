import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { MeterBarComponent } from '../shared/components/meter-bar.component';
import { COPY } from './copy';

/** Read-only overall progress block (spec §3.2): number, bar and "m of n filled" line. */
@Component({
  selector: 'clarityokr-overall-progress',
  standalone: true,
  imports: [MeterBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overall" data-testid="overall-progress">
      <div class="overall__label">{{ copy.overall.label }}</div>
      <div class="overall__row">
        <span
          class="overall__value"
          [class.overall__value--empty]="value === null"
          data-testid="overall-value"
        >
          {{ value === null ? '—' : value + '%' }}
        </span>
        <clarityokr-meter-bar
          [value]="value"
          variant="overall"
          [label]="copy.overall.barLabel"
          [valueText]="copy.overall.valueText(value)"
          testId="overall-bar"
        />
      </div>
      <div class="overall__summary" data-testid="overall-summary">
        {{ filled === 0 ? copy.overall.none : copy.overall.summary(total, filled) }}
      </div>
    </div>
  `,
  styles: [
    `
      .overall__label,
      .overall__summary {
        font-size: var(--font-size-xs);
        line-height: 16px;
        color: var(--color-text-secondary);
      }
      .overall__row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 2px 0;
      }
      .overall__value {
        min-width: 56px;
        font-size: var(--font-size-2xl);
        line-height: 28px;
        font-weight: var(--font-weight-semibold);
        font-variant-numeric: tabular-nums;
      }
      .overall__value--empty {
        color: var(--color-text-secondary);
      }
    `,
  ],
})
export class OverallProgressComponent {
  @Input() value: number | null = null;
  /** Non-removed key results. */
  @Input() total = 0;
  /** Of those, how many have a progress value. */
  @Input() filled = 0;
  readonly copy = COPY;
}
