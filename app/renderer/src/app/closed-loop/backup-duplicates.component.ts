import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  inject,
  signal,
} from '@angular/core';

import { COPY } from './copy';
import { type BackupRow, type ConflictChoice, ImportFlow } from './import-flow.service';

/**
 * The duplicate list of the backup preview (#50, S1§9.4 step 3): 「全部跳过」「全部作为副本」, then a
 * `role=list` with one `radiogroup` per duplicate (「跳过 / 作为副本」, default 跳过, Q9-2).
 * The list is ONE tab stop: ↑↓ move between rows, ←→ switch the answer of the row.
 */
@Component({
  selector: 'clarityokr-backup-duplicates',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bulk">
      <button
        type="button"
        class="ghost"
        data-testid="backup-skip-all"
        (click)="importer.chooseAll('skip')"
      >
        {{ c.skipAll }}
      </button>
      <button
        type="button"
        class="ghost"
        data-testid="backup-copy-all"
        (click)="importer.chooseAll('copy')"
      >
        {{ c.copyAll }}
      </button>
    </div>
    <div
      class="list"
      role="list"
      [attr.aria-label]="c.duplicatesLabel"
      data-testid="backup-duplicates"
    >
      @for (row of rows; track row.index; let i = $index) {
        <div class="row" role="listitem">
          <div class="row__text">
            <span class="row__title">{{ row.title }}</span>
            <span class="row__meta"
              >{{ c.createdAt(row.createdAt) }}
              @if (row.inFile) {
                <span class="row__tag">{{ c.inFileTag }}</span>
              }
            </span>
          </div>
          <div
            class="seg"
            role="radiogroup"
            [attr.aria-label]="row.title + '，' + c.createdAt(row.createdAt)"
            [attr.data-testid]="'backup-row-' + row.index"
          >
            @for (option of options; track option.value) {
              <button
                type="button"
                role="radio"
                class="seg__opt"
                [attr.aria-checked]="choice(row) === option.value"
                [attr.tabindex]="i === active() && choice(row) === option.value ? 0 : -1"
                [attr.data-row]="i"
                [attr.data-value]="option.value"
                (click)="pick(i, option.value)"
                (keydown)="onKey($event, i)"
              >
                {{ option.label }}
              </button>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        margin-top: 8px;
      }
      .bulk {
        display: flex;
        gap: 8px;
        margin-bottom: 8px;
      }
      .ghost {
        height: 28px;
        padding: 0 8px;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--color-accent, #2563eb);
        font: inherit;
        font-size: var(--font-size-sm);
        cursor: pointer;
      }
      .ghost:hover {
        background: var(--color-bg-secondary);
      }
      .list {
        max-height: 200px;
        overflow-y: auto;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
      }
      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px;
      }
      .row + .row {
        border-top: 1px solid var(--color-border);
      }
      .row__text {
        display: flex;
        min-width: 0;
        flex-direction: column;
      }
      .row__title {
        overflow: hidden;
        font-size: var(--font-size-sm);
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .row__meta {
        font-size: 12px;
        line-height: 16px;
        color: var(--color-text-secondary);
      }
      .row__tag {
        display: inline-block;
        margin-left: 6px;
        white-space: nowrap;
        padding: 0 4px;
        border: 1px solid var(--color-border-control, #8e8e93);
        border-radius: 4px;
      }
      .seg {
        display: inline-flex;
        flex: none;
        padding: 2px;
        border-radius: var(--radius-md);
        background: var(--color-bg-secondary);
      }
      .seg__opt {
        height: 28px;
        padding: 0 8px;
        border: 1px solid transparent;
        border-radius: 6px;
        background: transparent;
        color: var(--color-text-secondary);
        font: inherit;
        font-size: 12px;
        cursor: pointer;
      }
      .seg__opt[aria-checked='true'] {
        border-color: var(--color-border-control, #8e8e93);
        background: var(--color-bg-primary);
        color: var(--color-text-primary);
        font-weight: 600;
      }
      @media (prefers-reduced-motion: reduce) {
        .list {
          scroll-behavior: auto;
        }
      }
    `,
  ],
})
export class BackupDuplicatesComponent {
  @Input({ required: true }) rows: BackupRow[] = [];

  readonly importer = inject(ImportFlow);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly c = COPY.import;
  readonly options: Array<{ value: ConflictChoice; label: string }> = [
    { value: 'skip', label: COPY.import.optionSkip },
    { value: 'copy', label: COPY.import.optionCopy },
  ];
  /** The row that holds the list's tab stop. */
  readonly active = signal(0);

  choice(row: BackupRow): ConflictChoice {
    return this.importer.choices()[row.index] ?? 'skip';
  }

  pick(i: number, value: ConflictChoice): void {
    const row = this.rows[i];
    if (!row) return;
    this.active.set(i);
    this.importer.choose(row.index, value);
    this.focus(i, value);
  }

  onKey(event: KeyboardEvent, i: number): void {
    const row = this.rows[i];
    if (!row) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      this.pick(i, this.choice(row) === 'skip' ? 'copy' : 'skip');
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = Math.min(
        this.rows.length - 1,
        Math.max(0, i + (event.key === 'ArrowDown' ? 1 : -1)),
      );
      this.active.set(next);
      this.focus(next, this.choice(this.rows[next] as BackupRow));
    }
  }

  private focus(i: number, value: ConflictChoice): void {
    queueMicrotask(() =>
      this.host.nativeElement
        .querySelector<HTMLElement>(`[data-row="${i}"][data-value="${value}"]`)
        ?.focus(),
    );
  }
}
