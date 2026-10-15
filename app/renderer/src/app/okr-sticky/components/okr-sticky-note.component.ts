/**
 * OKR Sticky Note Component - Always-on-Top OKR Display
 *
 * This component displays a generated OKR (Objective and Key Results) in a
 * compact, sticky-note style format. It serves as the main visualization
 * for the OKR clarification workflow output.
 *
 * Key Responsibilities:
 * - Display OKR objective and key results in a readable format
 * - Show metadata including generation time and edit status
 * - Visual indicators for manual edits and metrics
 * - Emit events for user interactions (add key result)
 *
 * Features:
 * - Responsive layout using CSS Grid and Flexbox
 * - Change detection optimization with OnPush strategy
 * - Date pipe formatting for timestamps
 * - Conditional rendering for optional metadata
 *
 * Dependencies:
 * - Angular CommonModule: Common directives (NgIf, NgFor, DatePipe)
 * - OkrStickyViewModel: Type definition for component input data
 *
 * @usage
 * ```html
 * <clarityokr-sticky-note
 *   [okr]="okrViewModel"
 *   >
 * </clarityokr-sticky-note>
 * ```
 *
 * @example
 * ```typescript
 * const viewModel: OkrStickyViewModel = {
 *   objective: 'Improve team productivity',
 *   keyResults: [
 *     { id: 'kr1', statement: 'Reduce deployment time by 50%', metricLabel: 'Time' }
 *   ],
 *   generatedAt: new Date(),
 *   hasManualEdits: true
 * };
 * ```
 *
 * @module okr-sticky/components/okr-sticky-note
 */
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Inject,
  Input,
  type OnChanges,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import type { KeyResultRecord } from '@clarityokr/contracts';

import { announceAgain } from '../../closed-loop/announce';
import { ClosedLoopStore } from '../../closed-loop/closed-loop.store';
import { COPY, formatMonthDay, formatRelativeTime, STATUS_LABEL } from '../../closed-loop/copy';
import { KrProgressHistoryComponent } from '../../closed-loop/kr-progress-history.component';
import { KrRowComponent } from '../../closed-loop/kr-row.component';
import { OverallProgressComponent } from '../../closed-loop/overall-progress.component';
import { PeriodPickerComponent } from '../../closed-loop/period-picker.component';
import { DialogComponent } from '../../shared/components/dialog.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import {
  PopupSelectComponent,
  type PopupOption,
} from '../../shared/components/popup-select.component';
import { RegenerateFlow } from '../../closed-loop/regenerate-flow.service';
import { type RegenerateBanner } from '../../closed-loop/regenerate-logic';
import { TextEditComponent, type TextSaveFailure } from '../../closed-loop/text-edit.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { OkrStickyService, type OkrStickyViewModel } from '../services/okr-sticky.service';
import { EditModeStore } from '../state/edit-mode.store';

/**
 * Component that renders an OKR as a sticky note card.
 *
 * Shows the objective with its period and overall progress, the key results with status,
 * progress bar and inline progress editing (see {@link KrRowComponent}), the removed key
 * results and the existing text edit / regenerate / copy actions. The progress data comes
 * from {@link ClosedLoopStore}; the text of the OKR still comes from the view model.
 */
const MAX_KEY_RESULTS = 10;

function newKeyResultId(): string {
  const crypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return crypto?.randomUUID ? crypto.randomUUID() : `kr-${Math.random().toString(36).slice(2)}`;
}

@Component({
  selector: 'clarityokr-sticky-note',
  standalone: true,
  imports: [
    KrProgressHistoryComponent,
    CommonModule,
    TranslatePipe,
    TextEditComponent,
    DialogComponent,
    KrRowComponent,
    OverallProgressComponent,
    PeriodPickerComponent,
    SkeletonComponent,
    PopupSelectComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="sticky-note"
      *ngIf="okr as viewModel"
      role="region"
      aria-label="OKR 便利贴"
      [attr.aria-busy]="store.detailState() === 'loading' || regen.isRunning() ? 'true' : null"
    >
      @if (regen.isRunning()) {
        <div class="regen-progress" data-testid="regen-progress" aria-hidden="true"></div>
      }
      @if (editor.isEditing()) {
        <clarityokr-text-edit
          [objective]="editor.draftObjective()"
          [keyResults]="editor.draftKeyResults()"
          [canUndo]="editor.canUndo()"
          [canRedo]="editor.canRedo()"
          [canSave]="editor.isValid() && editor.isDirty() && !busy()"
          [saving]="busy()"
          [saveError]="editError()"
          [focusTarget]="focusTarget()"
          (objectiveChange)="editor.updateObjective($event)"
          (statementChange)="editor.updateKeyResult($event.id, { statement: $event.value })"
          (metricChange)="editor.updateKeyResult($event.id, { successMetric: $event.value })"
          (undo)="editor.undo()"
          (redo)="editor.redo()"
          (boundary)="editor.breakCoalescing()"
          (save)="save()"
          (cancel)="cancel()"
        />
      } @else {
        @if (showPinBanner()) {
          @switch (store.pinNotice()) {
            @case ('pinned') {
              <div class="banner" role="status" data-testid="pin-banner-done">
                {{ t.pin.done }}
              </div>
            }
            @case ('failed') {
              <div class="banner banner--error" role="alert" data-testid="pin-banner-failed">
                <span>{{ t.pin.failed }}</span>
                <button type="button" class="banner__btn" data-testid="pin-retry" (click)="pin()">
                  {{ t.pin.retry }}
                </button>
              </div>
            }
            @default {
              <div class="banner" data-testid="pin-banner">
                <span>{{ t.pin.notPinned }}</span>
                <button
                  type="button"
                  class="banner__btn"
                  data-testid="pin-button"
                  [attr.aria-disabled]="store.pinNotice() === 'pinning' ? 'true' : null"
                  [attr.aria-busy]="store.pinNotice() === 'pinning' ? 'true' : null"
                  (click)="pin()"
                >
                  {{ t.pin.action }}
                </button>
              </div>
            }
          }
        }

        <div class="sticky-note__toprow">
          <clarityokr-period-picker
            [value]="store.detail()?.objective?.period ?? null"
            [disabled]="busy() || regen.isRunning() || store.detail() === null"
            [disabledTitle]="regen.isRunning() ? t.regen.lockedTooltip : null"
            (periodChange)="onPeriod($event)"
          />
          @if (viewModel.lastEditedAt) {
            <span class="sticky-note__edited" data-testid="sticky-last-edited">
              最近编辑 {{ formatTime(viewModel.lastEditedAt) }}
            </span>
          }
          @if (viewModel.hasManualEdits) {
            <span class="sticky-note__tag" data-testid="sticky-manual-edits">
              {{ 'okr.header.manualEdits' | translate }}
            </span>
          }
          <button
            #editBtn
            type="button"
            class="sticky-note__text-btn sticky-note__edit"
            data-testid="edit-button"
            [attr.aria-disabled]="editBlocked() ? 'true' : null"
            [attr.title]="regen.isRunning() ? t.regen.lockedTooltip : null"
            (click)="beginEdit()"
          >
            {{ t.edit.action }}
          </button>
        </div>
        <span class="sr-only" role="status" data-testid="period-live">{{
          periodAnnouncement()
        }}</span>

        <h1
          #title
          tabindex="-1"
          class="sticky-note__title"
          data-testid="sticky-objective"
          [textContent]="viewModel.objective"
        ></h1>

        @switch (store.detailState()) {
          @case ('error') {
            <div class="panel" data-testid="detail-error">
              <p role="alert">{{ t.note.loadFailed }}</p>
              <button
                type="button"
                class="banner__btn"
                data-testid="detail-retry"
                (click)="store.reload()"
              >
                {{ t.note.retry }}
              </button>
            </div>
          }
          @case ('ready') {
            @if (detail(); as d) {
              <clarityokr-overall-progress
                [value]="d.objective.overallProgress"
                [total]="activeKrs(d.objective.keyResults).length"
                [filled]="filledCount(d.objective.keyResults)"
              />

              @switch (regen.result()?.kind) {
                @case ('done') {
                  @if (doneBanner(); as b) {
                    <div
                      class="regen-banner"
                      [class.regen-banner--warn]="b.tone === 'warn'"
                      role="status"
                      data-testid="regen-banner"
                    >
                      <div class="regen-banner__text">
                        <p class="regen-banner__main">{{ b.main }}</p>
                        @if (b.sub) {
                          <p class="regen-banner__sub">{{ b.sub }}</p>
                        }
                      </div>
                      <div class="regen-banner__actions">
                        @if (b.viewRemoved) {
                          <button
                            type="button"
                            class="regen-banner__btn"
                            data-testid="regen-view-removed"
                            (click)="viewRemoved()"
                          >
                            {{ t.regen.viewRemoved }}
                          </button>
                        }
                        <button
                          type="button"
                          class="regen-banner__btn"
                          data-testid="regen-dismiss"
                          (click)="dismissRegen()"
                        >
                          {{ t.regen.gotIt }}
                        </button>
                      </div>
                    </div>
                  }
                }
                @case ('failed') {
                  <div
                    class="regen-banner regen-banner--error"
                    role="alert"
                    data-testid="regen-failed"
                  >
                    <div class="regen-banner__text">
                      <p class="regen-banner__main">
                        <span aria-hidden="true">⚠ </span>{{ t.regen.failed }}
                      </p>
                      <details class="regen-banner__details">
                        <summary data-testid="regen-details">{{ t.regen.details }}</summary>
                        <p>{{ t.regen.failedDetail(failedCode()) }}</p>
                      </details>
                    </div>
                    <div class="regen-banner__actions">
                      <button
                        type="button"
                        class="regen-banner__btn"
                        data-testid="regen-retry"
                        (click)="retryRegen()"
                      >
                        {{ t.regen.retry }}
                      </button>
                      <button
                        type="button"
                        class="regen-banner__btn"
                        data-testid="regen-dismiss"
                        (click)="dismissRegen()"
                      >
                        {{ t.regen.gotIt }}
                      </button>
                    </div>
                  </div>
                }
              }

              <div class="sticky-note__section-head">
                <h2 class="sticky-note__section-title">
                  {{ t.kr.heading(activeKrs(d.objective.keyResults).length) }}
                </h2>
                <div class="sticky-note__section-actions">
                  <button
                    type="button"
                    class="sticky-note__text-btn"
                    data-testid="sticky-add-kr"
                    [attr.aria-disabled]="atKrLimit() || editBlocked() ? 'true' : null"
                    [attr.title]="
                      regen.isRunning() ? t.regen.lockedTooltip : atKrLimit() ? t.edit.maxKrs : null
                    "
                    (click)="addKr()"
                  >
                    ＋ {{ t.addShort }}
                  </button>
                  <clarityokr-popup-select
                    class="regen-menu"
                    mode="menu"
                    testId="regenerate-button"
                    [ariaLabel]="t.regen.menuLabel"
                    [options]="regenOptions"
                    [disabled]="regenDisabled()"
                    [attr.aria-busy]="regen.isRunning() ? 'true' : null"
                    (selected)="onRegenMenu($event)"
                  >
                    @if (regen.isRunning()) {
                      <span
                        class="regen-menu__spinner"
                        data-testid="regen-spinner"
                        aria-hidden="true"
                      ></span>
                    } @else {
                      <span aria-hidden="true" data-testid="regen-icon">↻</span>
                    }
                    {{ t.regen.button }} <span aria-hidden="true">▾</span>
                  </clarityokr-popup-select>
                </div>
              </div>

              @if (activeKrs(d.objective.keyResults).length === 0) {
                <div class="panel" data-testid="kr-empty">
                  <p>{{ t.kr.empty }}</p>
                  <button
                    type="button"
                    class="sticky-note__text-btn"
                    data-testid="kr-empty-regenerate"
                    (click)="regen.askAll()"
                  >
                    {{ t.regen.all }}
                  </button>
                </div>
              } @else {
                <ol class="sticky-note__list" data-testid="kr-list">
                  @for (kr of activeKrs(d.objective.keyResults); track kr.id; let i = $index) {
                    @if (isRegenerating(kr.id)) {
                      <!-- #40: the real row keeps its own height and single divider; a shimmer covers it -->
                      <li
                        clarityokr-kr-row
                        class="regen-skeleton"
                        data-testid="kr-skeleton"
                        [kr]="kr"
                        [n]="i + 1"
                        [info]="d.progress[kr.id]"
                        [blocked]="true"
                        [history]="false"
                      ></li>
                    } @else {
                      <li
                        clarityokr-kr-row
                        data-testid="sticky-key-result"
                        [kr]="kr"
                        [n]="i + 1"
                        [info]="d.progress[kr.id]"
                        [blocked]="busy() || regen.selecting() || regen.isRunning()"
                        [selecting]="regen.selecting()"
                        [selected]="regen.selected().has(kr.id)"
                        [isNew]="regen.newIds().has(kr.id)"
                        (toggle)="regen.toggle($event)"
                        (addMetric)="beginEdit(false, $event)"
                      ></li>
                    }
                  }
                </ol>
              }

              @if (removedKrs(d.objective.keyResults); as removed) {
                @if (removed.length > 0) {
                  <section class="removed" data-testid="removed-section">
                    <button
                      type="button"
                      #removedToggle
                      class="removed__head"
                      data-testid="removed-toggle"
                      aria-controls="removed-list"
                      [attr.aria-expanded]="removedOpen()"
                      (click)="removedOpen.set(!removedOpen())"
                    >
                      <span aria-hidden="true">{{ removedOpen() ? '▾' : '▸' }}</span>
                      {{ t.kr.removedHeading(removed.length) }}
                    </button>
                    @if (removedOpen()) {
                      <div id="removed-list">
                        <p class="removed__note">{{ t.kr.removedNote }}</p>
                        <ul class="removed__list">
                          @for (kr of removed; track kr.id) {
                            <li class="removed__item" data-testid="removed-key-result">
                              <div class="removed__text">{{ kr.statement }}</div>
                              @if (kr.successMetric) {
                                <div class="removed__meta">
                                  {{ t.kr.metricPrefix }}{{ kr.successMetric }}
                                </div>
                              }
                              <div class="removed__meta">
                                <span class="removed__tag">
                                  ⊘ {{ t.kr.removedTag(monthDay(kr.removedAt)) }}
                                </span>
                                {{ lastProgress(kr) }}
                              </div>
                              <!-- #53: removed KRs keep a read-only history (N34: only with records) -->
                              @if (d.progress[kr.id]?.latest) {
                                <div class="removed__history">
                                  <button
                                    type="button"
                                    class="sticky-note__text-btn"
                                    [id]="'kr-history-btn-' + kr.id"
                                    data-testid="removed-history-toggle"
                                    [attr.aria-expanded]="removedHistory().has(kr.id)"
                                    [attr.aria-controls]="
                                      removedHistory().has(kr.id) ? 'kr-history-' + kr.id : null
                                    "
                                    [attr.aria-label]="
                                      t.progressHistory.buttonLabel(kr.statement) +
                                      t.progressHistory.removedSuffix
                                    "
                                    (click)="toggleRemovedHistory(kr.id)"
                                  >
                                    {{ t.progressHistory.button }}
                                    <span aria-hidden="true">{{
                                      removedHistory().has(kr.id) ? '▾' : '▸'
                                    }}</span>
                                  </button>
                                </div>
                                @if (removedHistory().has(kr.id)) {
                                  <clarityokr-kr-progress-history
                                    [id]="'kr-history-' + kr.id"
                                    [krId]="kr.id"
                                    [statement]="kr.statement + t.progressHistory.removedSuffix"
                                    [status]="kr.status"
                                    [labelledBy]="'kr-history-btn-' + kr.id"
                                  />
                                }
                              }
                            </li>
                          }
                        </ul>
                      </div>
                    }
                  </section>
                }
              }
            }
          }
          @case ('idle') {
            <ol class="sticky-note__list">
              @for (kr of viewModel.keyResults; track kr.id) {
                <li class="sticky-note__plain" data-testid="sticky-key-result">
                  {{ kr.statement }}
                </li>
              }
            </ol>
          }
          @default {
            <div aria-busy="true" data-testid="detail-loading">
              <clarityokr-skeleton type="text" [lines]="3" [ariaLabel]="t.note.loadingLabel" />
            </div>
          }
        }
      }
      @if (regen.selecting()) {
        <div class="regen-bar" data-testid="regen-select-bar">
          <span class="regen-bar__count" data-testid="regen-selected-count">{{
            t.regen.selectedCount(regen.selected().size)
          }}</span>
          <span class="regen-bar__actions">
            @if (regen.selected().size === 0) {
              <span class="regen-bar__hint" id="regen-hint">{{ t.regen.selectAtLeastOne }}</span>
            }
            <button
              type="button"
              class="regen-bar__btn"
              data-testid="regen-select-cancel"
              (click)="stopSelecting()"
            >
              {{ t.regen.cancel }}
            </button>
            <button
              type="button"
              class="regen-bar__btn regen-bar__btn--primary"
              data-testid="regen-select-confirm"
              [attr.aria-disabled]="regen.selected().size === 0 ? 'true' : null"
              [attr.aria-describedby]="regen.selected().size === 0 ? 'regen-hint' : null"
              (click)="askSelected()"
            >
              {{ t.regen.regenerateSelected }}
            </button>
          </span>
        </div>
      }
      <!-- no data-testid: a layout check in the e2e suite counts every test id -->
      <span class="sr-only regen-live" role="status">{{ regenLive() }}</span>
      <span class="sr-only sr-only--flow" role="status" data-testid="text-saved-live">{{
        textSavedLive()
      }}</span>
      @if (error()) {
        <p role="alert" data-testid="sticky-error">{{ error() }}</p>
      }
    </section>
    <!-- Outside the section: its backdrop-filter would make the fixed dialog relative to it. -->
    @if (regen.confirm(); as c) {
      <clarityokr-dialog
        [title]="
          c.scope === 'all' ? t.regen.confirmTitleAll : t.regen.confirmTitleSome(c.ids.length)
        "
        [body]="c.scope === 'all' ? t.regen.confirmBodyAll : t.regen.confirmBodySome(c.ids.length)"
        [cancelLabel]="t.regen.cancel"
        [confirmLabel]="t.regen.confirm"
        [danger]="c.scope === 'all'"
        testId="regen-dialog"
        (cancelled)="regen.cancelConfirm()"
        (confirmed)="confirmRegen()"
      />
    }
    @if (editor.isEditing() && discardOpen()) {
      <clarityokr-dialog
        [title]="t.edit.discardTitle"
        [body]="t.edit.discardBody"
        [cancelLabel]="t.edit.keepEditing"
        [confirmLabel]="t.edit.discard"
        [danger]="true"
        testId="discard-dialog"
        (cancelled)="discardOpen.set(false)"
        (confirmed)="discard()"
      />
    }
  `,
  styleUrls: ['./okr-sticky-note.component.scss'],
})
export class OkrStickyNoteComponent implements OnChanges {
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly removedOpen = signal(false);
  /** #53: removed KRs whose 「进度记录」 is open. */
  readonly removedHistory = signal<ReadonlySet<string>>(new Set());

  toggleRemovedHistory(krId: string): void {
    const next = new Set(this.removedHistory());
    if (next.has(krId)) next.delete(krId);
    else next.add(krId);
    this.removedHistory.set(next);
  }
  readonly periodAnnouncement = signal('');
  readonly t = COPY;
  readonly editError = signal<TextSaveFailure>('none');
  readonly discardOpen = signal(false);
  readonly focusTarget = signal<{ id: string; field: 'statement' | 'metric' } | null>(null);
  readonly textSavedLive = signal('');

  @ViewChild('title') private title?: ElementRef<HTMLElement>;
  @ViewChild('editBtn') private editBtn?: ElementRef<HTMLElement>;
  @ViewChild('removedToggle') private removedToggle?: ElementRef<HTMLElement>;
  @ViewChild(PopupSelectComponent, { read: ElementRef })
  private regenMenu?: ElementRef<HTMLElement>;

  readonly regen = inject(RegenerateFlow);
  readonly regenOptions: readonly PopupOption[] = [
    { value: 'some', label: COPY.regen.selectSome },
    { value: 'all', label: COPY.regen.all },
  ];
  readonly regenLive = signal('');

  constructor(
    @Inject(EditModeStore) readonly editor: EditModeStore,
    @Inject(OkrStickyService) private readonly gateway: OkrStickyService,
  ) {}

  readonly store = inject(ClosedLoopStore);

  private lastOkrId: string | null = null;

  ngOnChanges(): void {
    const id = this.okr?.id ?? null;
    // Undo only reaches back inside one OKR (spec §3.9).
    if (id !== this.lastOkrId) {
      this.editor.clearHistory();
      this.lastOkrId = id;
    }
    this.store.syncDocument(id);
  }

  detail() {
    const detail = this.store.detail();
    return detail && detail.objective.id === this.okr?.id ? detail : null;
  }

  activeKrs(all: KeyResultRecord[]): KeyResultRecord[] {
    return all.filter((kr) => kr.removedAt === null).sort((a, b) => a.position - b.position);
  }

  removedKrs(all: KeyResultRecord[]): KeyResultRecord[] {
    return all.filter((kr) => kr.removedAt !== null).sort((a, b) => a.position - b.position);
  }

  filledCount(all: KeyResultRecord[]): number {
    return this.activeKrs(all).filter((kr) => kr.progress !== null).length;
  }

  lastProgress(kr: KeyResultRecord): string {
    return COPY.kr.lastProgress(kr.progress, STATUS_LABEL[kr.status]);
  }

  monthDay(iso: string | null): string {
    return iso ? formatMonthDay(iso) : '';
  }

  formatTime(iso: string): string {
    return formatRelativeTime(iso);
  }

  showPinBanner(): boolean {
    if (!this.store.openedFromHistory()) return false;
    const notice = this.store.pinNotice();
    return notice !== 'none' || this.store.detail()?.objective.pinned === false;
  }

  pin(): void {
    if (this.store.pinNotice() === 'pinning') return;
    void this.store.pin();
  }

  async onPeriod(value: string | null): Promise<void> {
    if (this.busy() || this.regen.isRunning()) return;
    const period = value as Parameters<ClosedLoopStore['setPeriod']>[0];
    const result = await this.store.setPeriod(period);
    this.periodAnnouncement.set(
      result.ok
        ? period === null
          ? COPY.period.cleared
          : COPY.period.set(period)
        : COPY.period.failed,
    );
  }

  /** Moves focus to the objective heading (after opening an OKR from the history). */
  focusTitle(): void {
    this.title?.nativeElement.focus();
  }

  /** Active key results at the 10-item limit of an OKR: no more can be added. */
  /** Text edit / add entries are blocked while busy, selecting or regenerating (§3.7). */
  editBlocked(): boolean {
    return this.busy() || this.regen.isRunning() || this.regen.selecting();
  }

  atKrLimit(): boolean {
    return (this.okr?.keyResults.length ?? 0) >= MAX_KEY_RESULTS;
  }

  /** 「＋ 添加」: opens the text form with an empty key result at the end, focused (§3.10). */
  addKr(): void {
    if (this.atKrLimit() || this.editBlocked()) return;
    this.beginEdit(true);
  }

  /**
   * Opens the text edit form. `addKeyResult` appends an empty key result; `metricOf` puts the
   * focus into that key result's metric (the 「添加度量」 entry).
   */
  beginEdit(addKeyResult = false, metricOf?: string): void {
    if (!this.okr || this.busy() || this.regen.isRunning() || this.regen.selecting()) return;
    // Acting on the list again ends the regeneration banner and the 「新增」 tags (§3.7).
    this.regen.dismiss();
    this.editError.set('none');
    this.discardOpen.set(false);
    const newId = addKeyResult ? newKeyResultId() : undefined;
    this.focusTarget.set(
      newId
        ? { id: newId, field: 'statement' }
        : metricOf
          ? { id: metricOf, field: 'metric' }
          : null,
    );
    this.editor.enterEditMode(
      this.okr.objective,
      this.okr.keyResults.map((kr) => ({
        id: kr.id,
        statement: kr.statement,
        successMetric: kr.metricLabel ?? undefined,
      })),
      this.okr.id,
      newId,
    );
  }

  /** Esc / 取消: with unsaved changes ask first (spec §3.9). */
  cancel(): void {
    if (!this.editor.isEditing() || this.busy()) return;
    if (this.editor.isDirty()) {
      this.discardOpen.set(true);
      return;
    }
    this.discard();
  }

  discard(): void {
    this.discardOpen.set(false);
    if (!this.editor.isEditing()) return;
    this.editor.cancelEdits();
    this.focusEditButton();
  }

  async save(): Promise<void> {
    if (!this.editor.isValid() || !this.editor.isDirty() || this.busy()) return;
    const state = this.editor.getState();
    this.editError.set('none');
    this.busy.set(true);
    this.store.operationBusy.set(true);
    try {
      await this.gateway.saveEdits({
        objective: state.draftObjective,
        keyResults: state.draftKeyResults.map((kr) => ({
          id: kr.id,
          statement: kr.statement,
          successMetric: kr.successMetric || undefined,
        })),
      });
      this.editor.saveEdits();
      announceAgain(this.textSavedLive, COPY.edit.saved);
      this.focusEditButton();
    } catch (error) {
      // The text stays in the form; never show the raw error.
      const message = error instanceof Error ? error.message : String(error);
      this.editError.set(/too_long|cluster_too_long/.test(message) ? 'over_limit' : 'failed');
    } finally {
      this.busy.set(false);
      this.store.operationBusy.set(false);
    }
  }

  private focusEditButton(): void {
    setTimeout(() => this.editBtn?.nativeElement.focus(), 0);
  }

  regenDisabled(): boolean {
    return this.busy() || this.regen.isRunning() || this.regen.selecting();
  }

  isRegenerating(krId: string): boolean {
    const running = this.regen.running();
    return running === 'all' || (running !== null && running.has(krId));
  }

  doneBanner(): RegenerateBanner | null {
    const result = this.regen.result();
    return result?.kind === 'done' ? result.banner : null;
  }

  failedCode(): string {
    const result = this.regen.result();
    return result?.kind === 'failed' ? result.code : '';
  }

  private activeIds(): string[] {
    const d = this.detail();
    return d ? this.activeKrs(d.objective.keyResults).map((kr) => kr.id) : [];
  }

  onRegenMenu(value: string | null): void {
    if (this.regenDisabled()) return;
    if (value === 'all') {
      this.regen.askAll();
    } else if (value === 'some') {
      this.regen.startSelecting();
      setTimeout(() =>
        this.document?.querySelector<HTMLElement>('[data-testid="kr-select"]')?.focus(),
      );
    }
  }

  askSelected(): void {
    this.regen.askSelected(this.activeIds());
  }

  stopSelecting(): void {
    this.regen.stopSelecting();
    this.focusRegenButton();
  }

  async confirmRegen(): Promise<void> {
    const okrId = this.okr?.id;
    if (!okrId) return;
    this.regenLive.set(COPY.regen.running);
    await this.regen.confirmed(okrId);
    this.announceResult();
  }

  async retryRegen(): Promise<void> {
    this.regenLive.set(COPY.regen.running);
    await this.regen.retry();
    this.announceResult();
  }

  dismissRegen(): void {
    this.regen.dismiss();
    this.focusRegenButton();
  }

  /** 「查看已移除」: open the removed section and move the focus to its heading. */
  viewRemoved(): void {
    this.removedOpen.set(true);
    setTimeout(() => this.removedToggle?.nativeElement.focus(), 0);
  }

  private announceResult(): void {
    // The banner itself is role=status (role=alert on failure) and says the result.
    this.regenLive.set('');
  }

  private focusRegenButton(): void {
    setTimeout(() => this.regenMenu?.nativeElement.querySelector<HTMLElement>('button')?.focus());
  }

  private get document(): Document | undefined {
    return typeof document === 'undefined' ? undefined : document;
  }

  /** Selection mode keys (spec §3.7): Ctrl/⌘+A selects all, Esc leaves. */
  @HostListener('document:keydown', ['$event'])
  onSelectionKey(event: KeyboardEvent): void {
    if (!this.regen.selecting() || this.regen.confirm()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.stopSelecting();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.regen.selectAll(this.activeIds());
    }
  }

  private async perform(operation: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.store.operationBusy.set(true);
    this.error.set(null);
    try {
      await operation();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.busy.set(false);
      this.store.operationBusy.set(false);
    }
  }

  /**
   * The OKR view model to display.
   *
   * Contains the objective, key results array, and metadata about generation
   * and editing. When null, the component renders nothing.
   */
  @Input() okr: OkrStickyViewModel | null = null;

  /**
   * TrackBy function for key results to optimize rendering performance.
   *
   * Angular uses this to identify which items have changed in the list,
   * minimizing DOM manipulations when the key results array updates.
   *
   * @param _index - The index of the item in the array (unused)
   * @param item - The key result item
   * @returns The unique identifier for the key result
   */
  readonly trackByKeyResultId = (_: number, item: { id: string }) => item.id;
}
