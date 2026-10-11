import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * A 0–100 progress bar (spec §2.3, §3.12). Not the step indicator: the value is a percent,
 * it may be missing (no `aria-valuenow`, empty track) and the fill colour comes from a
 * variant (`overall` or one of the four statuses).
 */
@Component({
  selector: 'clarityokr-meter-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="meter"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      [attr.aria-valuenow]="value"
      [attr.aria-valuetext]="valueText"
      [attr.aria-label]="label"
      [attr.data-testid]="testId"
    >
      @if (value !== null) {
        <div
          class="meter__fill"
          [class]="'meter__fill meter__fill--' + variant"
          [style.width.%]="value"
        ></div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        flex: 1;
        min-width: 0;
      }
      .meter {
        height: 8px;
        border-radius: var(--radius-full);
        background: var(--meter-track);
        overflow: hidden;
      }
      .meter__fill {
        height: 100%;
        border-radius: var(--radius-full);
        transition: width var(--duration-normal) var(--ease-out);
        background: var(--meter-fill-overall);
      }
      .meter__fill--not_started {
        background: var(--status-not_started-fill);
      }
      .meter__fill--in_progress {
        background: var(--status-in_progress-fill);
      }
      .meter__fill--at_risk {
        background: var(--status-at_risk-fill);
      }
      .meter__fill--done {
        background: var(--status-done-fill);
      }
    `,
  ],
})
export class MeterBarComponent {
  @Input() value: number | null = null;
  @Input() label = '';
  @Input() valueText = '';
  @Input() variant: 'overall' | 'not_started' | 'in_progress' | 'at_risk' | 'done' = 'overall';
  @Input() testId?: string;
}
