import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  EventEmitter,
  Input,
  type OnChanges,
  type OnDestroy,
  Output,
  type SimpleChanges,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import type {
  KeyResultRecord,
  KrProgressInfo,
  KrStatus,
  ProgressChangeReply,
} from '@clarityokr/contracts';

import { MeterBarComponent } from '../shared/components/meter-bar.component';
import {
  PopupSelectComponent,
  type PopupOption,
} from '../shared/components/popup-select.component';
import { COPY, STATUS_ICON, STATUS_LABEL, STATUS_ORDER } from './copy';
import { ClosedLoopStore, STALE_CODES, type WriteResult } from './closed-loop.store';
import {
  describeLatestUpdate,
  isDoneButNot100,
  stepProgressText,
  validateProgressInput,
} from './progress-logic';

type EditorMode = 'none' | 'set' | 'replace';

const SLOW_SAVE_MS = 300;

/**
 * One key result: text, metric, status menu, progress bar, inline progress input, the
 * "latest update" row with edit / revert, and the "done but not 100%" hint (spec §3.2–§3.6).
 * Every write goes through {@link ClosedLoopStore}; the row only owns transient UI state.
 */
@Component({
  selector: 'li[clarityokr-kr-row]',
  standalone: true,
  imports: [CommonModule, MeterBarComponent, PopupSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="kr__top">
      @if (selecting) {
        <label class="kr__check">
          <input
            type="checkbox"
            class="kr__check-input"
            data-testid="kr-select"
            [checked]="selected"
            [attr.aria-label]="copy.regen.selectLabel(n, kr.statement)"
            (change)="toggle.emit(kr.id)"
          />
          <span class="kr__check-box" aria-hidden="true"></span>
        </label>
      } @else {
        <span class="kr__num" aria-hidden="true">{{ n }}</span>
      }
      <div class="kr__text" data-testid="kr-statement">
        @if (isNew) {
          <span class="kr__new" data-testid="kr-new-tag"
            ><span class="kr__new-dot" aria-hidden="true"></span>{{ copy.regen.newTag }}</span
          >
        }
        {{ kr.statement }}
      </div>
    </div>

    <div class="kr__indent">
      @if (kr.successMetric) {
        <div class="kr__metric" data-testid="kr-metric" [title]="kr.successMetric">
          {{ copy.kr.metricPrefix }}{{ kr.successMetric }}
        </div>
      } @else {
        <button
          type="button"
          class="kr__link"
          data-testid="kr-add-metric"
          [attr.aria-label]="copy.kr.addMetricLabel(n)"
          [attr.aria-disabled]="blocked ? 'true' : null"
          (click)="onAddMetric()"
        >
          {{ copy.kr.addMetric }}
        </button>
      }

      <div class="kr__controls">
        @if (mode() === 'none') {
          <button
            #valueButton
            type="button"
            class="kr__value"
            data-testid="kr-progress-value"
            [attr.aria-label]="copy.kr.editValueLabel(n, kr.progress)"
            [attr.aria-disabled]="blocked ? 'true' : null"
            [attr.aria-busy]="saving() ? 'true' : null"
            (click)="startEdit('set')"
          >
            {{ kr.progress === null ? copy.kr.notFilled : kr.progress + '%' }}
            @if (slow()) {
              <span class="kr__spinner" aria-hidden="true"></span>
            }
          </button>
        } @else {
          <span class="kr__input-wrap">
            <input
              #valueInput
              type="text"
              inputmode="numeric"
              autocomplete="off"
              class="kr__input"
              data-testid="kr-progress-input"
              [class.kr__input--invalid]="!validation().ok"
              [value]="draft()"
              [attr.aria-label]="copy.kr.inputLabel(n)"
              [attr.aria-invalid]="validation().ok ? null : 'true'"
              [attr.aria-describedby]="validation().ok ? null : errorId"
              (input)="onInput($event)"
              (keydown)="onInputKeydown($event)"
              (blur)="onInputBlur()"
            />
            <span aria-hidden="true" class="kr__suffix">%</span>
          </span>
        }

        <clarityokr-popup-select
          #statusMenu
          variant="pill"
          mode="menu"
          testId="kr-status"
          [tone]="kr.status"
          [options]="statusOptions"
          [value]="kr.status"
          [ariaLabel]="copy.kr.statusLabel(n, kr.status)"
          [disabled]="blocked"
          (selected)="onStatusSelected($event)"
        >
          <span aria-hidden="true">{{ statusIcon(kr.status) }}</span>
          <span>{{ statusLabel(kr.status) }}</span>
          <span aria-hidden="true" class="kr__caret">▾</span>
        </clarityokr-popup-select>

        <clarityokr-meter-bar
          [value]="kr.progress"
          [variant]="kr.status"
          [label]="copy.kr.barLabel(n)"
          [valueText]="copy.kr.barText(kr.progress, kr.status)"
          testId="kr-progress-bar"
        />
      </div>

      @if (errorMessage(); as message) {
        <div class="kr__error" role="alert" [id]="errorId" data-testid="kr-input-error">
          <span aria-hidden="true">⚠</span> {{ message }}
        </div>
      }

      @if (failure(); as failed) {
        <div class="kr__error kr__failure" role="alert" data-testid="kr-save-failed">
          <span aria-hidden="true">⚠</span> {{ copy.kr.saveFailed }}
          <button type="button" class="kr__link" data-testid="kr-retry" (click)="retry(failed)">
            {{ copy.kr.retry }}
          </button>
          <button
            type="button"
            class="kr__link"
            data-testid="kr-discard"
            (click)="failure.set(null)"
          >
            {{ copy.kr.discard }}
          </button>
        </div>
      }

      @if (updateLine(); as line) {
        <div class="kr__update" data-testid="kr-update-line">{{ line.text }}</div>
        <div class="kr__update-actions">
          <button
            type="button"
            class="kr__link kr__link--action"
            [class.kr__link--disabled]="lastDisabled"
            data-testid="kr-edit-last"
            [attr.aria-label]="copy.kr.editLastLabel(n)"
            [attr.aria-disabled]="lastDisabled ? 'true' : null"
            [attr.aria-describedby]="line.kind === 'revert' ? reasonId : null"
            (click)="onEditLast()"
          >
            {{ copy.kr.editLast }}
          </button>
          <button
            type="button"
            class="kr__link kr__link--action"
            [class.kr__link--disabled]="lastDisabled"
            data-testid="kr-revert-last"
            [attr.aria-label]="copy.kr.revertLastLabel(n)"
            [attr.aria-disabled]="lastDisabled ? 'true' : null"
            [attr.aria-describedby]="line.kind === 'revert' ? reasonId : null"
            (click)="onRevertLast()"
          >
            {{ copy.kr.revertLast }}
          </button>
        </div>
        @if (line.kind === 'revert') {
          <div class="kr__update" [id]="reasonId" data-testid="kr-revert-reason">
            {{ copy.kr.revertDisabledReason }}
          </div>
        }
      }

      @if (doneHint) {
        <div class="kr__hint" data-testid="kr-done-hint">
          <span aria-hidden="true">⚠</span>
          <span class="kr__hint-text">{{ copy.kr.doneNot100(kr.progress) }}</span>
          <button
            type="button"
            class="kr__link kr__link--hint"
            data-testid="kr-set-100"
            [attr.aria-label]="copy.kr.setTo100Label(n)"
            [attr.aria-disabled]="blocked ? 'true' : null"
            (click)="onSetTo100()"
          >
            {{ copy.kr.setTo100 }}
          </button>
        </div>
      }

      <span class="sr-only" role="status" data-testid="kr-live">{{ announcement() }}</span>
    </div>
  `,
  styleUrls: ['./kr-row.component.scss'],
})
export class KrRowComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) kr!: KeyResultRecord;
  @Input({ required: true }) n = 1;
  @Input() info: KrProgressInfo | undefined;
  /** Editing is blocked (text edit open, regeneration running...). */
  @Input() blocked = false;
  @Input() now: Date = new Date();
  /** The user asked to add a metric: the note opens the text editor. */
  @Output() addMetric = new EventEmitter<string>();
  /** §3.7 selection mode: a checkbox replaces the number. */
  @Input() selecting = false;
  @Input() selected = false;
  /** Added by the last regeneration (the 「新增」 tag). */
  @Input() isNew = false;
  @Output() toggle = new EventEmitter<string>();

  readonly copy = COPY;
  readonly mode = signal<EditorMode>('none');
  readonly draft = signal('');
  readonly saving = signal(false);
  readonly slow = signal(false);
  readonly failure = signal<(() => Promise<void>) | null>(null);
  readonly announcement = signal('');

  readonly statusOptions: readonly PopupOption[] = STATUS_ORDER.map((status) => ({
    value: status,
    label: STATUS_LABEL[status],
    icon: STATUS_ICON[status],
  }));

  @ViewChild('statusMenu') private statusMenu?: PopupSelectComponent;

  private inputRef?: ElementRef<HTMLInputElement>;
  private focusInput = false;
  private focusButton = false;
  private cancelling = false;
  private hadHint: boolean | null = null;
  private slowTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly store = inject(ClosedLoopStore);

  @ViewChild('valueButton') set valueButton(ref: ElementRef<HTMLButtonElement> | undefined) {
    if (ref && this.focusButton) {
      this.focusButton = false;
      ref.nativeElement.focus();
    }
  }

  @ViewChild('valueInput') set valueInput(ref: ElementRef<HTMLInputElement> | undefined) {
    this.inputRef = ref;
    if (ref && this.focusInput) {
      this.focusInput = false;
      ref.nativeElement.focus();
      ref.nativeElement.select();
    }
  }

  get errorId(): string {
    return `kr-${this.kr.id}-error`;
  }

  get reasonId(): string {
    return `kr-${this.kr.id}-reason`;
  }

  get doneHint(): boolean {
    return isDoneButNot100(this.kr.status, this.kr.progress);
  }

  get lastDisabled(): boolean {
    return this.blocked || !this.info?.canRevert;
  }

  validation(): ReturnType<typeof validateProgressInput> {
    return validateProgressInput(this.draft());
  }

  errorMessage(): string | null {
    if (this.mode() === 'none') return null;
    const result = this.validation();
    return result.ok ? null : result.message;
  }

  updateLine(): ReturnType<typeof describeLatestUpdate> {
    return this.info ? describeLatestUpdate(this.info, this.now) : null;
  }

  statusIcon(status: KrStatus): string {
    return STATUS_ICON[status];
  }

  statusLabel(status: KrStatus): string {
    return STATUS_LABEL[status];
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['kr']) {
      const hint = this.doneHint;
      // Announce once, only when the hint appears (not on first render, not while it stays).
      if (this.hadHint === false && hint) this.announcement.set(COPY.kr.doneNot100Spoken(this.n));
      this.hadHint = hint;
    }
  }

  ngOnDestroy(): void {
    this.stopSlowTimer();
  }

  onAddMetric(): void {
    if (this.blocked) return;
    this.addMetric.emit(this.kr.id);
  }

  startEdit(mode: 'set' | 'replace'): void {
    if (this.blocked || this.mode() !== 'none') return;
    this.failure.set(null);
    this.draft.set(this.kr.progress === null ? '' : String(this.kr.progress));
    this.focusInput = true;
    this.mode.set(mode);
  }

  onInput(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  onInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      void this.commit(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancelEdit();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const step = (event.shiftKey ? 10 : 1) * (event.key === 'ArrowUp' ? 1 : -1);
      this.draft.set(stepProgressText(this.draft(), step));
    }
  }

  onInputBlur(): void {
    if (this.cancelling || this.mode() === 'none' || this.saving()) return;
    // A valid value is committed when focus leaves; an invalid one stays open with its error.
    if (this.validation().ok) void this.commit(false);
  }

  private cancelEdit(): void {
    this.cancelling = true;
    this.focusButton = true;
    this.mode.set('none');
    this.draft.set('');
    queueMicrotask(() => (this.cancelling = false));
  }

  private async commit(refocus: boolean): Promise<void> {
    const parsed = this.validation();
    if (!parsed.ok || this.saving()) return;
    const mode = this.mode();
    const value = parsed.value;
    this.closeEditor(refocus);
    if (mode === 'replace') {
      await this.run(
        () => this.store.replaceProgress({ krId: this.kr.id, value }),
        COPY.kr.progressUpdated(this.n, value),
      );
    } else {
      await this.run(
        () => this.store.setProgress({ krId: this.kr.id, status: this.kr.status, value }),
        COPY.kr.progressUpdated(this.n, value),
      );
    }
  }

  private closeEditor(refocus: boolean): void {
    this.cancelling = true;
    this.focusButton = refocus;
    this.mode.set('none');
    queueMicrotask(() => (this.cancelling = false));
  }

  onStatusSelected(value: string | null): void {
    if (this.blocked || value === null || value === this.kr.status) return;
    const status = value as KrStatus;
    void this.run(
      () => this.store.setProgress({ krId: this.kr.id, status }),
      COPY.kr.statusUpdated(this.n, status),
    );
  }

  onSetTo100(): void {
    if (this.blocked) return;
    void this.run(
      () => this.store.setProgress({ krId: this.kr.id, status: this.kr.status, value: 100 }),
      COPY.kr.progressUpdated(this.n, 100),
    );
  }

  onEditLast(): void {
    if (this.lastDisabled) return;
    this.startEdit('replace');
  }

  onRevertLast(): void {
    if (this.lastDisabled) return;
    void this.run(
      () => this.store.revertProgress({ krId: this.kr.id }),
      null,
      (reply) => COPY.kr.reverted(this.n, reply.keyResult.progress, reply.keyResult.status),
    );
  }

  retry(action: () => Promise<void>): void {
    this.failure.set(null);
    void action();
  }

  /** Runs a write; on failure shows the retry row, on success announces the change. */
  private async run(
    write: () => Promise<WriteResult<ProgressChangeReply>>,
    message: string | null,
    describe?: (reply: ProgressChangeReply) => string,
  ): Promise<void> {
    this.failure.set(null);
    this.saving.set(true);
    this.startSlowTimer();
    try {
      const result = await write();
      if (result.ok) {
        if (result.data.changed) {
          this.announcement.set(describe ? describe(result.data) : (message ?? ''));
        }
      } else if (STALE_CODES.has(result.error.code)) {
        // The store reloads the OKR; a retry of the same request could never succeed.
        this.announcement.set(COPY.kr.stale);
      } else {
        this.failure.set(() => this.run(write, message, describe));
      }
    } finally {
      this.saving.set(false);
      this.stopSlowTimer();
    }
  }

  private startSlowTimer(): void {
    this.stopSlowTimer();
    this.slowTimer = setTimeout(() => this.slow.set(true), SLOW_SAVE_MS);
  }

  private stopSlowTimer(): void {
    if (this.slowTimer !== undefined) clearTimeout(this.slowTimer);
    this.slowTimer = undefined;
    this.slow.set(false);
  }

  /** Focus helper for tests / parents. */
  focusStatus(): void {
    this.statusMenu?.focus();
  }
}
