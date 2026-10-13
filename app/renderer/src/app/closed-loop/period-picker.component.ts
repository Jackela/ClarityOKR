import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  type OnChanges,
  Output,
} from '@angular/core';
import type { Period } from '@clarityokr/contracts';

import {
  PopupSelectComponent,
  type PopupOption,
} from '../shared/components/popup-select.component';
import { COPY } from './copy';
import { quarterOptions } from './progress-logic';

/**
 * Quarter picker (spec §3.2): a capsule that opens a listbox with "not set" and the quarters
 * from four before to four after the current one. Selecting saves at once; the parent
 * announces the result.
 */
@Component({
  selector: 'clarityokr-period-picker',
  standalone: true,
  imports: [PopupSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <clarityokr-popup-select
      variant="capsule"
      mode="listbox"
      testId="period-picker"
      [options]="options"
      [value]="value"
      [ariaLabel]="copy.period.label + '：' + (value ?? copy.period.none)"
      [disabled]="disabled"
      [disabledTitle]="disabledTitle"
      (selected)="periodChange.emit($event)"
    >
      <span [class.period--none]="value === null">{{ value ?? copy.period.none }}</span>
      <span aria-hidden="true" class="period__caret">▾</span>
    </clarityokr-popup-select>
  `,
  styles: [
    `
      .period--none {
        color: var(--color-text-secondary);
        font-weight: var(--font-weight-medium);
      }
      .period__caret {
        font-size: 10px;
      }
    `,
  ],
})
export class PeriodPickerComponent implements OnChanges {
  @Input() value: Period | null = null;
  @Input() disabled = false;
  @Input() disabledTitle: string | null = null;
  @Input() now: Date = new Date();
  @Output() periodChange = new EventEmitter<string | null>();

  readonly copy = COPY;

  options: PopupOption[] = [];

  ngOnChanges(): void {
    this.options = quarterOptions(this.now, this.value).map((option) => ({
      value: option.value,
      label: option.label,
    }));
  }
}
