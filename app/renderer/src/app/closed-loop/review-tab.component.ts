import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Output,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { TEXT_LIMITS, type KrStatus } from '@clarityokr/contracts';

import { ButtonComponent } from '../shared/components/button.component';
import { SkeletonComponent } from '../shared/components/skeleton.component';
import { ToastHostComponent } from '../shared/components/toast-host.component';
import { ToastService } from '../shared/components/toast.service';
import { announceAgain } from './announce';
import { ClosedLoopStore } from './closed-loop.store';
import { COPY, STATUS_ICON, STATUS_LABEL, formatRelativeTime } from './copy';
import { REVIEW_KEYS, ReviewStore, type ReviewKey } from './review.store';
import { TextFieldComponent } from './text-field.component';
import { evaluateText } from './text-limit';

interface SnapshotRow {
  id: string;
  statement: string;
  metric: string | null;
  progress: number | null;
  status: KrStatus;
  removed: boolean;
}

/**
 * Review tab (spec §5): the progress of every key result as a read-only snapshot, three text
 * areas and one save button. The snapshot is frozen by the first save; later saves only
 * change the text. Leaving with unsaved text is guarded by the shell (it asks first).
 */
@Component({
  selector: 'clarityokr-review-tab',
  standalone: true,
  imports: [ButtonComponent, SkeletonComponent, TextFieldComponent, ToastHostComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.currentId() === null) {
      <div class="review__empty" data-testid="review-no-okr">
        <p class="review__empty-title">{{ copy.note.emptyTitle }}</p>
        <p>{{ copy.note.emptyBody }}</p>
      </div>
    } @else {
      @switch (review.loadState()) {
        @case ('error') {
          <div class="review__center" data-testid="review-load-error">
            <p role="alert">{{ t.loadFailed }}</p>
            <button
              type="button"
              class="review__link"
              data-testid="review-load-retry"
              (click)="retryLoad()"
            >
              {{ t.retry }}
            </button>
          </div>
        }
        @case ('ready') {
          <div class="review__body">
            <div class="review__context">
              <h1
                class="review__objective"
                [title]="objectiveTitle()"
                data-testid="review-objective"
              >
                {{ objectiveTitle() }}
              </h1>
              <span class="review__period" data-testid="review-period">{{
                period() ?? t.contextNoPeriod
              }}</span>
            </div>
            <p class="review__state" role="status" data-testid="review-state">
              @if (review.dirty()) {
                <span class="review__dot" aria-hidden="true"></span>{{ t.stateDirty }}
              } @else if (review.review(); as saved) {
                {{ t.stateSaved(time(saved.savedAt), memory()) }}
              } @else {
                {{ t.stateNever }}
              }
            </p>

            <div class="review__snap-head">
              <h2 class="review__heading">{{ t.snapshotHeading }}</h2>
              <span class="review__snap-tag" data-testid="review-snapshot-tag">
                @if (review.review(); as saved) {
                  {{ t.snapshotSaved(time(saved.snapshotAt)) }}
                } @else {
                  {{ t.snapshotPending }}
                }
              </span>
            </div>
            @if (review.review()) {
              <p class="review__note" data-testid="review-snapshot-note">{{ t.snapshotNote }}</p>
            }
            @if (drifted()) {
              <div class="review__info" data-testid="review-drift">
                <span>{{ t.drift }}</span>
                <button
                  type="button"
                  class="review__link"
                  data-testid="review-go-note"
                  (click)="goNote.emit()"
                >
                  {{ t.driftGo }}
                </button>
              </div>
            }
            @if (rows().length === 0) {
              <p class="review__empty-kr" data-testid="review-no-kr">{{ t.emptyKrs }}</p>
            } @else {
              @if (allUnfilled()) {
                <p class="review__info" data-testid="review-unfilled">
                  {{ t.unfilled(rows().length) }}
                </p>
              }
              <table class="snap" [attr.aria-label]="t.tableLabel" data-testid="review-snapshot">
                <thead class="sr-only">
                  <tr>
                    <th scope="col">{{ t.colIndex }}</th>
                    <th scope="col">{{ t.colKr }}</th>
                    <th scope="col">{{ t.colProgress }}</th>
                    <th scope="col">{{ t.colStatus }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of rows(); track row.id; let i = $index) {
                    <tr
                      class="snap__row"
                      [class.snap__row--removed]="row.removed"
                      data-testid="review-row"
                    >
                      <td class="snap__index">
                        <span>{{ i + 1 }}</span>
                      </td>
                      <td class="snap__text">
                        <div class="snap__statement" [title]="row.statement">
                          {{ row.statement }}
                        </div>
                        <div class="snap__metric" [title]="row.metric ?? ''">
                          {{ row.metric ? t.metricPrefix + row.metric : t.noMetric }}
                        </div>
                      </td>
                      <td class="snap__progress">
                        {{ row.progress === null ? '—' : row.progress + '%' }}
                      </td>
                      <td class="snap__status">
                        @if (row.removed) {
                          <span class="tag tag--removed"
                            ><span aria-hidden="true">⊘ </span>{{ t.removedTag }}</span
                          >
                        }
                        <span [class]="'tag tag--' + row.status">
                          <span aria-hidden="true">{{ icon[row.status] }} </span
                          >{{ label[row.status] }}
                        </span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            }
            <p class="review__overall" data-testid="review-overall">{{ t.overall(overall()) }}</p>

            <p class="review__explain">{{ copy.edit.explain }}</p>
            @for (section of sections; track section.key; let i = $index) {
              <clarityokr-text-field
                class="review__field"
                [id]="'review-' + section.key"
                [label]="section.label"
                [value]="review.draft()[section.key]"
                [maxLength]="limit"
                [rows]="4"
                [minHeight]="96"
                [placeholder]="section.placeholder"
                [readonly]="review.saving()"
                [describedByExtra]="'review-hint-' + (i + 1)"
                [testId]="'review-' + section.key"
                (valueChange)="onInput(section.key, $event)"
              />
              <span class="sr-only" [id]="'review-hint-' + (i + 1)">{{
                t.sectionHint(i + 1)
              }}</span>
            }

            @if (review.saving()) {
              <span class="sr-only" role="status">{{ t.savingStatus }}</span>
            }
            <span class="sr-only" role="status" data-testid="review-saved-live">{{
              savedLive()
            }}</span>
          </div>

          @if (review.saveFailure() !== 'none') {
            <div class="review__fail" role="alert" data-testid="review-save-failed">
              <span>{{
                review.saveFailure() === 'over_limit' ? t.saveOverLimit : t.saveFailed
              }}</span>
              @if (review.saveFailure() === 'failed') {
                <button
                  type="button"
                  class="review__link"
                  data-testid="review-save-retry"
                  (click)="save()"
                >
                  {{ t.retry }}
                </button>
              }
            </div>
          }
          <clarityokr-toast-host [docked]="true" />
          <div class="review__bar" data-testid="review-bar">
            <span class="review__bar-text">
              @if (review.dirty()) {
                {{ t.stateDirty }}
              }
              @if (review.blockedReason() === 'empty') {
                <span id="review-need-one" data-testid="review-need-one">{{ t.needOne }}</span>
              }
            </span>
            <clarityokr-button
              variant="primary"
              size="md"
              testId="review-save"
              [disabled]="!review.canSave()"
              [loading]="review.saving()"
              [ariaDescribedBy]="saveDescribedBy()"
              (onClick)="save()"
            >
              {{ t.save }}
            </clarityokr-button>
          </div>
        }
        @default {
          <div class="review__body" aria-busy="true" data-testid="review-loading">
            <clarityokr-skeleton type="text" [lines]="6" [ariaLabel]="t.loading" />
          </div>
        }
      }
    }
  `,
  styleUrls: ['./review-tab.component.scss'],
})
export class ReviewTabComponent {
  /** "去便签查看": the shell switches to the note tab (and asks first when text is unsaved). */
  @Output() goNote = new EventEmitter<void>();

  readonly copy = COPY;
  readonly t = COPY.review;
  readonly sections = COPY.review.sections;
  readonly limit = TEXT_LIMITS.reviewSection;
  readonly icon = STATUS_ICON;
  readonly label = STATUS_LABEL;

  readonly store = inject(ClosedLoopStore);
  readonly review = inject(ReviewStore);
  private readonly toasts = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly savedLive = signal('');
  readonly memory = computed(() => this.store.storageMode() === 'memory');

  readonly objectiveTitle = computed(() => this.store.detail()?.objective.title ?? '');
  readonly period = computed(() => this.store.detail()?.objective.period ?? null);

  readonly rows = computed<SnapshotRow[]>(() => {
    const saved = this.review.review();
    if (saved) {
      return saved.snapshot.map((kr) => ({
        id: kr.krId,
        statement: kr.statement,
        metric: kr.successMetric,
        progress: kr.progress,
        status: kr.status,
        removed: kr.removed,
      }));
    }
    return this.activeRows();
  });

  readonly overall = computed<number | null>(() => {
    if (!this.review.review()) return this.store.detail()?.objective.overallProgress ?? null;
    const values = this.rows()
      .filter((row) => !row.removed && row.progress !== null)
      .map((row) => row.progress as number);
    return values.length === 0
      ? null
      : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  });

  readonly allUnfilled = computed(() => {
    const live = this.rows().filter((row) => !row.removed);
    return live.length > 0 && live.every((row) => row.progress === null);
  });

  /** The note changed after the snapshot was frozen. */
  readonly drifted = computed(() => {
    if (!this.review.review()) return false;
    const snapshot = this.rows().filter((row) => !row.removed);
    const current = this.activeRows();
    return (
      snapshot.length !== current.length ||
      snapshot.some((row, i) => {
        const now = current[i];
        return (
          !now ||
          now.id !== row.id ||
          now.statement !== row.statement ||
          (now.metric ?? null) !== (row.metric ?? null) ||
          now.progress !== row.progress ||
          now.status !== row.status
        );
      })
    );
  });

  private readonly doc = inject(DOCUMENT);
  private gone = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.gone = true));
    void this.store.ensureStorageMode();
    effect(() => {
      const id = this.store.currentId();
      untracked(() => void this.review.load(id));
    });
  }

  private activeRows(): SnapshotRow[] {
    const detail = this.store.detail();
    if (!detail || detail.objective.id !== this.store.currentId()) return [];
    return detail.objective.keyResults
      .filter((kr) => kr.removedAt === null)
      .sort((a, b) => a.position - b.position)
      .map((kr) => ({
        id: kr.id,
        statement: kr.statement,
        metric: kr.successMetric,
        progress: kr.progress,
        status: kr.status,
        removed: false,
      }));
  }

  time(iso: string): string {
    return formatRelativeTime(iso);
  }

  /** The first reason the save button cannot be used, as an element id. */
  saveDescribedBy(): string | undefined {
    const reason = this.review.blockedReason();
    if (reason === 'empty') return 'review-need-one';
    if (reason === 'over_limit') {
      const draft = this.review.draft();
      const first = REVIEW_KEYS.find((key) => evaluateText(draft[key], this.limit).invalid);
      return first ? `review-${first}-error` : undefined;
    }
    return undefined;
  }

  onInput(key: ReviewKey, text: string): void {
    this.review.setSection(key, text);
  }

  retryLoad(): void {
    void this.review.load(this.store.currentId());
  }

  /** Ctrl/⌘+S saves (not while a field is over its limit: `canSave` says no). */
  @HostListener('document:keydown', ['$event'])
  onShortcut(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    if (event.key.toLowerCase() !== 's') return;
    // an IME is still composing (`isComposing`, or keyCode 229 on engines that only set that)
    if (event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    void this.save();
  }

  async save(): Promise<void> {
    const saved = await this.review.save();
    // No reply, or a reply for text that was thrown away / a tab that is gone: say nothing.
    if (!saved || this.gone) return;
    this.toasts.show({
      kind: 'success',
      message: this.memory() ? this.t.savedToastMemory : this.t.savedToast,
    });
    announceAgain(this.savedLive, this.t.savedLive(this.time(saved.snapshotAt)));
    // The docked toast takes room from the scroll area: keep the focused box in sight.
    setTimeout(() => {
      const active = this.doc.activeElement;
      if (active instanceof HTMLElement && this.host.nativeElement.contains(active)) {
        active.scrollIntoView?.({ block: 'nearest' });
      }
    }, 0);
  }
}
