import {
  type AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  type QueryList,
  ViewChildren,
  signal,
} from '@angular/core';

import type { DraftKeyResult } from '../okr-sticky/state/edit-mode.store';
import { ButtonComponent } from '../shared/components/button.component';
import { COPY } from './copy';
import { TextFieldComponent } from './text-field.component';
import { evaluateText } from './text-limit';
import { TEXT_LIMITS } from '@clarityokr/contracts';

export type TextSaveFailure = 'none' | 'failed' | 'over_limit';

/**
 * Text edit mode (spec §3.9): objective, key result text and the metric of every key result
 * in text areas with live limit checks, and a bottom bar with undo / redo / cancel / save.
 * Progress, status and period are not editable here. It is purely presentational: the draft,
 * the undo history and the save request live with the parent.
 */
@Component({
  selector: 'clarityokr-text-edit',
  standalone: true,
  imports: [ButtonComponent, TextFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="edit"
      role="group"
      [attr.aria-label]="t.formLabel"
      data-testid="text-edit"
      (keydown)="onKeydown($event)"
      (focusout)="onFocusOut($event)"
    >
      <div class="edit__body">
        <p class="edit__explain" data-testid="edit-explain">{{ t.explain }}</p>
        <p class="edit__explain">{{ t.progressNote }}</p>

        <clarityokr-text-field
          id="edit-objective"
          [label]="t.objective"
          [value]="objective"
          [maxLength]="limits.objective"
          [rows]="2"
          [readonly]="saving"
          [required]="true"
          [emptyError]="showEmpty('objective') ? t.objectiveEmpty : ''"
          testId="edit-objective"
          (valueChange)="onObjective($event)"
        />

        @for (kr of keyResults; track kr.id; let i = $index) {
          <div class="edit__kr" data-testid="edit-kr">
            <clarityokr-text-field
              [id]="'edit-kr-' + kr.id"
              [label]="t.keyResult(i + 1)"
              [value]="kr.statement"
              [maxLength]="limits.keyResult"
              [rows]="2"
              [readonly]="saving"
              [required]="true"
              [placeholder]="t.krPlaceholder"
              [emptyError]="showEmpty(kr.id) ? t.krEmpty : ''"
              [testId]="'edit-kr-' + i"
              (valueChange)="onStatement(kr.id, $event)"
            />
            <clarityokr-text-field
              [id]="'edit-metric-' + kr.id"
              [label]="t.metricShort"
              [srPrefix]="'关键结果 ' + (i + 1) + ' 的'"
              [value]="kr.successMetric"
              [maxLength]="limits.successMetric"
              [rows]="1"
              [readonly]="saving"
              [placeholder]="t.metricPlaceholder"
              [testId]="'edit-metric-' + i"
              (valueChange)="onMetric(kr.id, $event)"
            />
          </div>
        }
      </div>

      @if (saveError !== 'none') {
        <div class="edit__fail" role="alert" data-testid="edit-save-failed">
          {{ saveError === 'over_limit' ? t.saveOverLimit : t.saveFailed }}
        </div>
      }
      @if (saving) {
        <span class="sr-only" role="status">{{ t.saving }}</span>
      }
      <span id="edit-save-hint" class="sr-only">{{ hint() }}</span>

      <div class="edit__bar" data-testid="edit-bar">
        <div class="edit__bar-side">
          <clarityokr-button
            variant="ghost"
            size="sm"
            testId="edit-undo"
            [attr.title]="t.undoTitle"
            [ariaLabel]="t.undo + '文字修改'"
            [disabled]="!canUndo || saving"
            (onClick)="undo.emit()"
          >
            <svg class="edit__icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path
                d="M6 3 2.5 6.5 6 10M3 6.5h6.5a3.5 3.5 0 0 1 0 7H7"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            {{ t.undo }}
          </clarityokr-button>
          <clarityokr-button
            variant="ghost"
            size="sm"
            testId="edit-redo"
            [attr.title]="t.redoTitle"
            [ariaLabel]="t.redo + '文字修改'"
            [disabled]="!canRedo || saving"
            (onClick)="redo.emit()"
          >
            <svg class="edit__icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path
                d="M10 3l3.5 3.5L10 10M13 6.5H6.5a3.5 3.5 0 0 0 0 7H9"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            {{ t.redo }}
          </clarityokr-button>
        </div>
        <div class="edit__bar-side">
          <clarityokr-button
            variant="secondary"
            size="sm"
            testId="edit-cancel"
            [disabled]="saving"
            (onClick)="cancel.emit()"
          >
            {{ t.cancel }}
          </clarityokr-button>
          <clarityokr-button
            variant="primary"
            size="sm"
            testId="edit-save"
            [disabled]="!canSave"
            [loading]="saving"
            [ariaDescribedBy]="canSave ? undefined : describedBy()"
            (onClick)="save.emit()"
          >
            {{ t.save }}
          </clarityokr-button>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./text-edit.component.scss'],
})
export class TextEditComponent implements AfterViewInit {
  @Input({ required: true }) objective = '';
  @Input({ required: true }) keyResults: readonly DraftKeyResult[] = [];
  @Input() canUndo = false;
  @Input() canRedo = false;
  @Input() canSave = false;
  @Input() saving = false;
  @Input() saveError: TextSaveFailure = 'none';
  /**
   * Where the focus goes on open: the new key result's text (add flow), a key result's metric
   * (「添加度量」); otherwise the objective.
   */
  @Input() focusTarget: { id: string; field: 'statement' | 'metric' } | null = null;

  @Output() objectiveChange = new EventEmitter<string>();
  @Output() statementChange = new EventEmitter<{ id: string; value: string }>();
  @Output() metricChange = new EventEmitter<{ id: string; value: string }>();
  @Output() undo = new EventEmitter<void>();
  @Output() redo = new EventEmitter<void>();
  @Output() save = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  readonly t = COPY.edit;
  readonly limits = TEXT_LIMITS;

  @ViewChildren(TextFieldComponent) private fields!: QueryList<TextFieldComponent>;

  /** Fields the user has touched: an empty one only shows its error after that. */
  private readonly touched = signal<ReadonlySet<string>>(new Set());

  ngAfterViewInit(): void {
    const list = this.fields.toArray();
    const target = this.focusTarget
      ? list.find(
          (field) =>
            field.id ===
            `${this.focusTarget?.field === 'metric' ? 'edit-metric' : 'edit-kr'}-${this.focusTarget?.id}`,
        )
      : list[0];
    (target ?? list[0])?.focus();
  }

  showEmpty(key: string): boolean {
    if (!this.touched().has(key)) return false;
    return key === 'objective'
      ? this.objective.trim().length === 0
      : (this.keyResults.find((kr) => kr.id === key)?.statement.trim().length ?? 1) === 0;
  }

  private touch(key: string): void {
    if (this.touched().has(key)) return;
    this.touched.update((set) => new Set(set).add(key));
  }

  onObjective(value: string): void {
    this.touch('objective');
    this.objectiveChange.emit(value);
  }

  onStatement(id: string, value: string): void {
    this.touch(id);
    this.statementChange.emit({ id, value });
  }

  onMetric(id: string, value: string): void {
    this.metricChange.emit({ id, value });
  }

  /** Leaving a field marks it touched (so an empty new key result shows its error). */
  onFocusOut(event: FocusEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement)) return;
    if (target.id === 'edit-objective') this.touch('objective');
    else if (target.id.startsWith('edit-kr-')) this.touch(target.id.slice('edit-kr-'.length));
  }

  /** Explains the disabled save button: the first thing that is empty or over its limit. */
  describedBy(): string {
    const invalid = (text: string, limit: number): boolean => evaluateText(text, limit).invalid;
    if (invalid(this.objective, this.limits.objective)) return 'edit-objective-error';
    for (const kr of this.keyResults) {
      if (invalid(kr.statement, this.limits.keyResult)) return `edit-kr-${kr.id}-error`;
      if (invalid(kr.successMetric, this.limits.successMetric)) return `edit-metric-${kr.id}-error`;
    }
    return 'edit-save-hint';
  }

  hint(): string {
    return this.describedBy() === 'edit-save-hint' && !this.canSave ? this.t.needFill : '';
  }

  onKeydown(event: KeyboardEvent): void {
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && !event.altKey) {
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (this.canUndo && !this.saving) this.undo.emit();
        return;
      }
      if ((key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey && !event.shiftKey)) {
        event.preventDefault();
        if (this.canRedo && !this.saving) this.redo.emit();
        return;
      }
      if (key === 'enter' || (key === 's' && !event.shiftKey)) {
        event.preventDefault();
        if (this.canSave) this.save.emit();
        return;
      }
    }
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      if (!this.saving) this.cancel.emit();
    }
  }
}
