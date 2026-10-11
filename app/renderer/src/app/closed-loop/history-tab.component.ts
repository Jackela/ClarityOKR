import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import type { OkrListItem } from '@clarityokr/contracts';

import { SkeletonComponent } from '../shared/components/skeleton.component';
import { COPY, formatRelativeTime } from './copy';
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
 * "New OKR" belongs to a later slice (needs the open-wizard channel).
 */
@Component({
  selector: 'clarityokr-history-tab',
  standalone: true,
  imports: [SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="history" (keydown)="onPanelKeydown($event)">
      <div class="history__head">
        <h2 class="history__title" data-testid="history-heading">
          {{ copy.history.heading(store.list().length) }}
        </h2>
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
                    <div class="item__title">{{ item.title }}</div>
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
                        <span><span aria-hidden="true">📌 </span>{{ copy.history.pinned }}</span
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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

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
