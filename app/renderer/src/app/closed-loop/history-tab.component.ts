import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  EventEmitter,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import type { OkrListItem } from '@clarityokr/contracts';

import { DialogComponent } from '../shared/components/dialog.component';
import { SkeletonComponent } from '../shared/components/skeleton.component';
import { ImportFlow } from './import-flow.service';
import { BackupDuplicatesComponent } from './backup-duplicates.component';
import { COPY, formatRelativeTime } from './copy';
import { ClosedLoopApi } from './closed-loop-api.service';
import { ClosedLoopStore } from './closed-loop.store';

/** Search box appears only above this many OKRs (spec §4.3). */
/** One piece of the meta line: visible text plus optional screen-reader wording. */
export interface MetaPart {
  text: string;
  /** Read before the text, not shown. */
  label?: string;
  /** Read instead of the text (which is then hidden from readers). */
  spoken?: string;
}

export const SEARCH_THRESHOLD = 8;
const PAGE_STEP = 5;

/**
 * History tab (spec §4): all OKRs by update time, a listbox with roving tabindex. Opening one
 * makes it the OKR the note tab shows; the parent shell then switches tab and moves focus.
 * 「新建 OKR」 calls `window:open-wizard` (no payload, no result drawn here): the main window
 * shows and resets its wizard, or asks first when the wizard holds input (spec §4.5 / §4.5a).
 */
@Component({
  selector: 'clarityokr-history-tab',
  standalone: true,
  imports: [SkeletonComponent, DialogComponent, BackupDuplicatesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="history" (keydown)="onPanelKeydown($event)">
      <div class="history__head">
        <h2 class="history__title" data-testid="history-heading">
          {{ copy.history.heading(store.list().length) }}
        </h2>
        <button
          #importButton
          type="button"
          class="history__btn history__import"
          data-testid="history-import"
          [attr.aria-disabled]="blockedReason ? 'true' : null"
          [attr.aria-busy]="importer.slow() ? 'true' : null"
          [attr.title]="blockedReason ? copy.import.locked : null"
          (click)="startImport()"
        >
          @if (importer.slow()) {
            <span class="history__spinner" aria-hidden="true" data-testid="import-spinner"></span>
          } @else {
            <svg
              class="history__import-icon"
              viewBox="0 0 16 16"
              width="16"
              height="16"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M8 2v8M4.5 6.5 8 10l3.5-3.5M3 13h10"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          }
          <span class="history__import-text">{{ copy.import.button }}</span>
        </button>
        <button
          type="button"
          class="history__btn history__new"
          data-testid="history-new-okr"
          (click)="newOkr()"
        >
          {{ copy.newOkr.button }}
        </button>
      </div>

      @if (blockedReason) {
        <p class="history__muted history__blocked" role="status" data-testid="history-blocked">
          {{ blockedReason }}
        </p>
      }

      @switch (store.listState()) {
        @case ('error') {
          <div class="history__state" data-testid="history-error">
            <p role="alert">{{ copy.history.loadFailed }}</p>
            <button
              type="button"
              class="history__btn"
              data-testid="history-retry"
              (click)="store.refreshList()"
            >
              {{ copy.history.retry }}
            </button>
          </div>
        }
        @case ('ready') {
          @if (store.list().length === 0) {
            <div class="history__state" data-testid="history-empty">
              <p class="history__empty-title">{{ copy.history.emptyTitle }}</p>
              <p class="history__muted">{{ copy.history.emptyBody }}</p>
              <button
                type="button"
                class="history__btn"
                data-testid="history-import-empty"
                [attr.aria-disabled]="blockedReason ? 'true' : null"
                [attr.title]="blockedReason ? copy.import.locked : null"
                (click)="startImport()"
              >
                {{ copy.import.emptyButton }}
              </button>
            </div>
          } @else {
            @if (store.list().length > threshold) {
              <div class="history__search">
                <input
                  #search
                  type="search"
                  class="history__input"
                  role="searchbox"
                  data-testid="history-search"
                  autocomplete="off"
                  [placeholder]="copy.history.searchPlaceholder"
                  [attr.aria-label]="copy.history.searchLabel"
                  [value]="query()"
                  (input)="onSearch($event)"
                  (keydown)="onSearchKeydown($event)"
                />
                @if (query() !== '') {
                  <button
                    type="button"
                    class="history__clear"
                    data-testid="history-clear"
                    [attr.aria-label]="copy.history.clearSearch"
                    (click)="clearSearch(true)"
                  >
                    ×
                  </button>
                }
              </div>
              <span class="sr-only" role="status">{{ searchStatus() }}</span>
            }
            @if (visible().length === 0) {
              <div class="history__state" data-testid="history-no-match">
                <p>{{ copy.history.noMatch(query()) }}</p>
                <button type="button" class="history__btn" (click)="clearSearch(true)">
                  {{ copy.history.clearSearch }}
                </button>
              </div>
            } @else {
              <div
                class="history__list"
                role="listbox"
                data-testid="history-list"
                [attr.aria-label]="copy.history.listLabel"
                [attr.aria-disabled]="blockedReason ? 'true' : null"
              >
                @for (item of visible(); track item.id; let i = $index) {
                  <div
                    role="option"
                    class="item"
                    data-testid="history-item"
                    [class.item--current]="item.id === store.currentId()"
                    [class.item--disabled]="blockedReason !== null"
                    [attr.data-okr-id]="item.id"
                    [attr.aria-selected]="item.id === store.currentId()"
                    [attr.aria-disabled]="blockedReason ? 'true' : null"
                    [attr.tabindex]="i === stop() ? 0 : -1"
                    (click)="open(item)"
                    (keydown)="onItemKeydown($event, i, item)"
                    (focus)="focusIndex.set(i)"
                  >
                    <!-- prettier-ignore -->
                    <div class="item__title">{{ item.title }}@if (importer.fresh().has(item.id)) {<span class="item__new" data-testid="history-new-tag"><span class="sr-only">，</span>{{ copy.import.newTag }}</span>}</div>
                    <div class="item__meta">
                      @for (part of metaParts(item); track $index) {
                        <span>
                          @if (part.spoken) {
                            <span aria-hidden="true">{{ part.text }}</span
                            ><span class="sr-only">{{ part.spoken }}</span>
                          } @else {
                            @if (part.label) {
                              <span class="sr-only">{{ part.label }}</span>
                            }
                            {{ part.text }}
                          }
                        </span>
                        <span class="sr-only">，</span>
                      }
                      @if (item.overallProgress !== null) {
                        <span class="item__mini"
                          ><span
                            class="item__mini-fill"
                            [style.width.%]="item.overallProgress"
                          ></span
                        ></span>
                      }
                    </div>
                    <div class="item__meta">
                      @if (item.id === store.currentId()) {
                        <span class="item__current">{{ copy.history.openNow }}</span
                        ><span class="sr-only">，</span>
                      }
                      @if (item.pinned) {
                        <span class="item__pinned" data-testid="history-pinned"
                          ><svg
                            class="item__pin-icon"
                            viewBox="0 0 16 16"
                            width="14"
                            height="14"
                            aria-hidden="true"
                            focusable="false"
                          >
                            <path
                              d="M9.5 1.5 14.5 6.5 12.6 7.2 10.4 9.4 10.9 12.1 9.9 13.1 6.8 10 3 13.8 2.2 13 6 9.2 2.9 6.1 3.9 5.1 6.6 5.6 8.8 3.4Z"
                              fill="currentColor"
                            />
                          </svg>
                          {{ copy.history.pinned }}</span
                        ><span class="sr-only">，</span>
                      }
                      <span>{{ copy.history.updatedAt(time(item.updatedAt)) }}</span>
                    </div>
                  </div>
                }
              </div>
            }
            @if (store.openError()) {
              <p class="history__error" role="alert" data-testid="history-open-error">
                {{ copy.history.openFailed }}
              </p>
            }
          }
        }
        @default {
          <div class="history__skeletons" aria-busy="true" data-testid="history-loading">
            @for (n of skeletonRows; track n) {
              <clarityokr-skeleton type="card" [lines]="2" [ariaLabel]="copy.note.loadingLabel" />
            }
          </div>
        }
      }
      <span class="sr-only" role="status" data-testid="import-status">{{
        importer.statusText()
      }}</span>
      @if (importer.dialog(); as d) {
        <clarityokr-dialog
          [title]="d.kind === 'error' ? '⚠ ' + d.title : d.title"
          [body]="d.body"
          [detail]="d.kind === 'error' ? d.detail : []"
          [hint]="d.hint"
          [danger]="false"
          [alert]="true"
          [testId]="'import-dialog-' + d.kind"
          [busy]="importer.committing()"
          [confirmNote]="dialogNote(d)"
          [noteAbove]="d.kind === 'backup'"
          [confirmDisabled]="d.kind === 'backup' && importer.backupCounts().imported === 0"
          [primaryCancel]="d.kind === 'error'"
          [cancelLabel]="d.kind === 'error' ? copy.import.ok : copy.import.cancel"
          [middleLabel]="d.kind === 'conflict' ? copy.import.skip : ''"
          [confirmLabel]="confirmLabel(d)"
          (cancelled)="importer.close()"
          (middle)="importer.commit('skip')"
          (confirmed)="onDialogConfirm(d)"
        >
          @if (d.kind === 'backup' && d.rows.length > 0) {
            <clarityokr-backup-duplicates [rows]="d.rows" />
          }
        </clarityokr-dialog>
      }
    </div>
  `,
  styleUrls: ['./history-tab.component.scss'],
})
export class HistoryTabComponent {
  /** Why opening another OKR is blocked right now (regeneration, text edit), or null. */
  @Input() blockedReason: string | null = null;
  @Output() opened = new EventEmitter<string>();

  readonly copy = COPY;
  readonly threshold = SEARCH_THRESHOLD;
  readonly skeletonRows = [0, 1, 2, 3];
  readonly query = signal('');
  /** Explicit roving position; -1 until the user moves (then the open OKR or first item). */
  readonly focusIndex = signal(-1);

  readonly store = inject(ClosedLoopStore);
  readonly importer = inject(ImportFlow);
  private readonly api = inject(ClosedLoopApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // The success toast's 「查看」: move the focus to the imported OKR (v3.1 Q8-1).
    effect(() => {
      const target = this.importer.reveal();
      if (!target) return;
      this.query.set('');
      const index = this.visible().findIndex((item) => item.id === target.okrId);
      if (index < 0) return;
      this.focusIndex.set(index);
      queueMicrotask(() => {
        const option = this.optionAt(index);
        option?.scrollIntoView({ block: 'nearest' });
        option?.focus();
      });
    });
  }

  startImport(): void {
    if (this.blockedReason) return;
    void this.importer.start();
  }

  confirmLabel(dialog: {
    kind: string;
    action?: string | null;
    rows?: unknown[];
    count?: number;
  }): string {
    if (dialog.kind === 'conflict') return COPY.import.asCopy;
    if (dialog.kind === 'confirm') return COPY.import.confirm;
    if (dialog.kind === 'backup') {
      return !dialog.rows?.length
        ? COPY.import.backupImportN(dialog.count ?? 0)
        : COPY.import.backupStart;
    }
    if (dialog.action === 'reselect') return COPY.import.reselect;
    if (dialog.action === 'retry') return COPY.import.retry;
    return '';
  }

  onDialogConfirm(dialog: { kind: string }): void {
    if (dialog.kind === 'conflict') void this.importer.commit('copy');
    else if (dialog.kind === 'confirm') void this.importer.commit('skip');
    else if (dialog.kind === 'backup') void this.importer.commitBackup();
    else void this.importer.secondary();
  }

  /** Beside the buttons: 「正在导入…」, or the live backup summary (S1§9.4, `aria-describedby`). */
  dialogNote(dialog: { kind: string; rows?: unknown[] }): string {
    if (this.importer.committing()) return COPY.import.importing;
    if (dialog.kind !== 'backup' || !dialog.rows?.length) return '';
    const { imported, skipped } = this.importer.backupCounts();
    return imported === 0
      ? COPY.import.backupAllSkipped
      : COPY.import.backupSummary(imported, skipped);
  }

  /** The call has no result to draw here; the sticky window stays as it is (spec §4.5). */
  newOkr(): void {
    void this.api.openWizard();
  }

  visible(): OkrListItem[] {
    const keyword = this.query().trim().toLocaleLowerCase();
    const items = this.store.list();
    return keyword === ''
      ? items
      : items.filter((item) => item.title.toLocaleLowerCase().includes(keyword));
  }

  searchStatus(): string {
    return this.query().trim() === '' ? '' : COPY.history.searchFound(this.visible().length);
  }

  time(iso: string): string {
    return formatRelativeTime(iso);
  }

  /**
   * The second line of an item. The accessible name of the option is its content, so the
   * visible text comes first and the screen-reader-only label words ("周期 2026-Q4，整体进度
   * 62%，…") sit right in front of the value they describe.
   */
  metaParts(item: OkrListItem): MetaPart[] {
    const parts: MetaPart[] = [];
    if (item.period) parts.push({ text: item.period, label: COPY.history.periodLabel });
    parts.push(
      item.overallProgress === null
        ? { text: '—', spoken: COPY.history.overallNotFilled }
        : { text: `${item.overallProgress}%`, label: COPY.history.overallLabel },
    );
    parts.push({ text: COPY.history.krCount(item.keyResultCount) });
    if (item.reviewed) parts.push({ text: `✓ ${COPY.history.reviewed}` });
    if (item.allDone) parts.push({ text: `✓ ${COPY.history.allDone}` });
    return parts;
  }

  /** The one item that is in the Tab order (roving tabindex). */
  stop(): number {
    if (this.focusIndex() >= 0) return this.focusIndex();
    const index = this.visible().findIndex((item) => item.id === this.store.currentId());
    return index < 0 ? 0 : index;
  }

  async open(item: OkrListItem): Promise<void> {
    this.importer.clearFresh();
    if (this.blockedReason) return;
    if (await this.store.openFromHistory(item.id)) this.opened.emit(item.id);
  }

  onSearch(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.focusIndex.set(-1);
  }

  clearSearch(focusSearch: boolean): void {
    this.query.set('');
    this.focusIndex.set(-1);
    if (focusSearch) this.searchInput()?.focus();
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    if (this.query() !== '') {
      this.clearSearch(false);
    } else {
      this.optionAt(this.stop())?.focus();
    }
  }

  onPanelKeydown(event: KeyboardEvent): void {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const input = this.searchInput();
    if (!input || event.target === input) return;
    event.preventDefault();
    input.focus();
  }

  onItemKeydown(event: KeyboardEvent, index: number, item: OkrListItem): void {
    if (event.key !== 'Tab') this.importer.clearFresh();
    const last = this.visible().length - 1;
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowDown':
        next = Math.min(last, index + 1);
        break;
      case 'ArrowUp':
        next = Math.max(0, index - 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      case 'PageDown':
        next = Math.min(last, index + PAGE_STEP);
        break;
      case 'PageUp':
        next = Math.max(0, index - PAGE_STEP);
        break;
      case 'Enter':
        event.preventDefault();
        void this.open(item);
        return;
      default:
        return;
    }
    event.preventDefault();
    this.focusIndex.set(next);
    this.optionAt(next)?.focus();
  }

  private optionAt(index: number): HTMLElement | undefined {
    return this.host.nativeElement.querySelectorAll<HTMLElement>('[role="option"]')[index];
  }

  private searchInput(): HTMLInputElement | null {
    return this.host.nativeElement.querySelector<HTMLInputElement>(
      '[data-testid="history-search"]',
    );
  }
}
