import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  EventEmitter,
  Input,
  type OnChanges,
  Output,
  ViewChild,
  signal,
} from '@angular/core';

import { COPY } from './copy';
import { evaluateText, type TextLimitKind, type TextLimitState } from './text-limit';

/**
 * Multi-line text field with a permanent counter and instant limit validation (spec §3.9a).
 *
 * - Counts grapheme clusters (one emoji = one character); never truncates.
 * - Over the limit: 2px error border, `⚠ n/limit`, an error row under the box, `aria-invalid`.
 * - Announces ONCE when the field goes from within the limit to over it (`role="alert"`) and
 *   once when it is back within it (`role="status"`).
 */
@Component({
  selector: 'clarityokr-text-field',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="field">
      <!-- prettier-ignore -->
      <label class="field__label" [for]="id">@if (srPrefix) {<span class="sr-only">{{ srPrefix }}</span>}{{ label }}</label>
      <textarea
        #input
        class="field__input"
        [id]="id"
        [attr.rows]="rows"
        [value]="value"
        [placeholder]="placeholder"
        [readOnly]="readonly"
        [attr.aria-invalid]="invalid ? 'true' : null"
        [attr.aria-describedby]="describedBy"
        [attr.aria-required]="required ? 'true' : null"
        [attr.data-testid]="testId"
        [class.field__input--invalid]="invalid"
        [style.min-height.px]="minHeight"
        (input)="onInput($event)"
      ></textarea>
      <div class="field__foot">
        <span class="field__error" [id]="errorId" [attr.data-testid]="testId + '-error'">
          @if (limit.kind !== 'ok') {
            <span aria-hidden="true">⚠ </span>{{ errorText }}
          } @else if (emptyError) {
            <span aria-hidden="true">⚠ </span>{{ emptyError }}
          }
        </span>
        <span
          class="field__count"
          [class.field__count--over]="limit.kind === 'too_long'"
          role="note"
          [title]="countLabel"
          [attr.aria-label]="countLabel"
          [attr.data-testid]="testId + '-count'"
        >
          @if (limit.kind === 'too_long') {
            <span aria-hidden="true">⚠ </span>
          }
          {{ limit.count }}/{{ limit.limit }}
        </span>
      </div>
      <span class="sr-only" role="alert" [attr.data-testid]="testId + '-alert'">{{
        alertText()
      }}</span>
      <span class="sr-only" role="status" [attr.data-testid]="testId + '-status'">{{
        statusText()
      }}</span>
    </div>
  `,
  styleUrls: ['./text-field.component.scss'],
})
export class TextFieldComponent implements OnChanges {
  @Input({ required: true }) id = '';
  @Input({ required: true }) label = '';
  /** Name used in announcements; defaults to the label. */
  @Input() announceName = '';
  /** Read before the visible label (e.g. 「关键结果 1 的」 before 「度量（…）」). */
  @Input() srPrefix = '';
  @Input() value = '';
  @Input({ required: true }) maxLength = 200;
  @Input() rows = 2;
  /** Minimum height of the box in px (spec: 48 for forms, 96 for the review). */
  @Input() minHeight = 48;
  @Input() placeholder = '';
  @Input() readonly = false;
  @Input() required = false;
  @Input() testId = 'text-field';
  /** Shown when the field is within its limit but not acceptable (e.g. empty required). */
  @Input() emptyError = '';
  /** Extra ids for `aria-describedby` (e.g. a hidden hint). */
  @Input() describedByExtra = '';
  @Output() valueChange = new EventEmitter<string>();

  @ViewChild('input', { static: true }) private input!: ElementRef<HTMLTextAreaElement>;

  readonly alertText = signal('');
  readonly statusText = signal('');

  limit: TextLimitState = evaluateText('', 200);
  private previous: TextLimitKind = 'ok';
  private first = true;

  get errorId(): string {
    return `${this.id}-error`;
  }

  get invalid(): boolean {
    return this.limit.kind !== 'ok' || this.emptyError !== '';
  }

  get describedBy(): string | null {
    const ids = [this.invalid ? this.errorId : '', this.describedByExtra].filter(Boolean);
    return ids.length > 0 ? ids.join(' ') : null;
  }

  get name(): string {
    return this.announceName || this.label;
  }

  get errorText(): string {
    return this.limit.kind === 'cluster_too_long'
      ? COPY.limit.cluster
      : COPY.limit.over(this.limit.over);
  }

  get countLabel(): string {
    return COPY.limit.countLabel(this.limit.count, this.limit.limit);
  }

  ngOnChanges(): void {
    this.limit = evaluateText(this.value, this.maxLength);
    const kind = this.limit.kind;
    if (!this.first && kind !== this.previous) {
      if (this.previous === 'ok') {
        this.statusText.set('');
        this.alertText.set(
          kind === 'cluster_too_long'
            ? COPY.limit.clusterAlert(this.name)
            : COPY.limit.overAlert(this.name, this.limit.over),
        );
      } else if (kind === 'ok') {
        this.alertText.set('');
        this.statusText.set(COPY.limit.backInRange(this.name));
      }
    }
    // cluster <-> too_long keeps the original alert: it is still "over".
    this.first = false;
    this.previous = kind;
  }

  focus(): void {
    this.input.nativeElement.focus();
  }

  onInput(event: Event): void {
    const text = (event.target as HTMLTextAreaElement).value;
    this.valueChange.emit(text);
  }
}
