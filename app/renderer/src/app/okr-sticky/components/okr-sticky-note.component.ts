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
 *   (addKr)="onAddKeyResult()">
 * </clarityokr-sticky-note>
 * ```
 *
 * @example
 * ```typescript
 * const viewModel: OkrStickyViewModel = {
 *   objective: 'Improve team productivity',
 *   keyResults: [
 *     { id: 'kr1', statement: 'Reduce deployment time by 50%', metricLabel: 'Time', ownerLabel: 'DevOps' }
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
  type ElementRef,
  EventEmitter,
  Inject,
  Input,
  type OnChanges,
  Output,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import type { KeyResultRecord } from '@clarityokr/contracts';

import { ClosedLoopStore } from '../../closed-loop/closed-loop.store';
import { COPY, formatMonthDay, formatRelativeTime, STATUS_LABEL } from '../../closed-loop/copy';
import { KrRowComponent } from '../../closed-loop/kr-row.component';
import { OverallProgressComponent } from '../../closed-loop/overall-progress.component';
import { PeriodPickerComponent } from '../../closed-loop/period-picker.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { OkrStickyService, type OkrStickyViewModel } from '../services/okr-sticky.service';
import { EditModeStore } from '../state/edit-mode.store';
import { OkrEditModeComponent } from './okr-edit-mode.component';

/**
 * Component that renders an OKR as a sticky note card.
 *
 * Shows the objective with its period and overall progress, the key results with status,
 * progress bar and inline progress editing (see {@link KrRowComponent}), the removed key
 * results and the existing text edit / regenerate / copy actions. The progress data comes
 * from {@link ClosedLoopStore}; the text of the OKR still comes from the view model.
 */
@Component({
  selector: 'clarityokr-sticky-note',
  standalone: true,
  imports: [
    CommonModule,
    TranslatePipe,
    OkrEditModeComponent,
    KrRowComponent,
    OverallProgressComponent,
    PeriodPickerComponent,
    SkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="sticky-note"
      *ngIf="okr as viewModel"
      role="region"
      aria-label="OKR 便利贴"
      [attr.aria-busy]="store.detailState() === 'loading' ? 'true' : null"
    >
      @if (editor.isEditing()) {
        <fieldset
          [disabled]="busy()"
          [attr.aria-busy]="busy()"
          [attr.aria-label]="'common.edit' | translate"
          class="sticky-note__edit-fields"
        >
          <clarityokr-okr-edit-mode
            [draftObjective]="editor.draftObjective()"
            [draftKeyResults]="editor.draftKeyResults()"
            [errors]="editor.errors()"
            [canSave]="editor.isValid() && editor.isDirty() && !busy()"
            (objectiveChange)="editor.updateObjective($event)"
            (keyResultChange)="editor.updateKeyResult($event.id, { statement: $event.statement })"
            (save)="save()"
            (cancel)="cancel()"
          />
        </fieldset>
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
            [disabled]="busy() || store.detail() === null"
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
            type="button"
            class="sticky-note__text-btn sticky-note__edit"
            data-testid="edit-button"
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

              <div class="sticky-note__section-head">
                <h2 class="sticky-note__section-title">
                  {{ t.kr.heading(activeKrs(d.objective.keyResults).length) }}
                </h2>
                <div class="sticky-note__section-actions">
                  <button
                    type="button"
                    class="sticky-note__text-btn"
                    data-testid="sticky-add-kr"
                    (click)="addKr.emit()"
                  >
                    ＋ {{ t.addShort }}
                  </button>
                  @if (!busy()) {
                    <button
                      type="button"
                      class="sticky-note__text-btn"
                      data-testid="regenerate-button"
                      [attr.aria-expanded]="showPolicies()"
                      (click)="showPolicies.set(!showPolicies())"
                    >
                      {{ 'okr.actions.regenerate' | translate }}
                    </button>
                  }
                </div>
              </div>
              @if (showPolicies()) {
                <div class="sticky-note__policies">
                  <button
                    type="button"
                    class="sticky-note__text-btn"
                    data-testid="policy-overwrite"
                    (click)="regenerate('overwrite')"
                  >
                    {{ 'okr.actions.overwrite' | translate }}
                  </button>
                  <button
                    type="button"
                    class="sticky-note__text-btn"
                    data-testid="policy-append"
                    (click)="regenerate('append')"
                  >
                    {{ 'okr.actions.append' | translate }}
                  </button>
                </div>
              }

              @if (activeKrs(d.objective.keyResults).length === 0) {
                <p class="panel" data-testid="kr-empty">{{ t.kr.empty }}</p>
              } @else {
                <ol class="sticky-note__list" data-testid="kr-list">
                  @for (kr of activeKrs(d.objective.keyResults); track kr.id; let i = $index) {
                    <li
                      clarityokr-kr-row
                      data-testid="sticky-key-result"
                      [kr]="kr"
                      [n]="i + 1"
                      [info]="d.progress[kr.id]"
                      [blocked]="busy()"
                      (addMetric)="beginEdit()"
                    ></li>
                  }
                </ol>
              }

              @if (removedKrs(d.objective.keyResults); as removed) {
                @if (removed.length > 0) {
                  <section class="removed" data-testid="removed-section">
                    <button
                      type="button"
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

        @if (!busy()) {
          <div class="sticky-note__footer">
            <button
              type="button"
              class="sticky-note__text-btn"
              data-testid="copy-button"
              (click)="copy()"
            >
              {{ 'common.copy' | translate }}
            </button>
          </div>
        }
        @if (copied()) {
          <span role="status" data-testid="copy-success">{{ 'common.copied' | translate }}</span>
        }
      }
      @if (error()) {
        <p role="alert" data-testid="sticky-error">{{ error() }}</p>
      }
    </section>
  `,
  styleUrls: ['./okr-sticky-note.component.scss'],
})
export class OkrStickyNoteComponent implements OnChanges {
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly copied = signal(false);
  readonly showPolicies = signal(false);
  readonly removedOpen = signal(false);
  readonly periodAnnouncement = signal('');
  readonly t = COPY;

  @ViewChild('title') private title?: ElementRef<HTMLElement>;

  constructor(
    @Inject(EditModeStore) readonly editor: EditModeStore,
    @Inject(OkrStickyService) private readonly gateway: OkrStickyService,
  ) {}

  readonly store = inject(ClosedLoopStore);

  ngOnChanges(): void {
    this.store.syncDocument(this.okr?.id ?? null);
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

  beginEdit(): void {
    if (!this.okr || this.busy()) return;
    this.editor.enterEditMode(
      this.okr.objective,
      this.okr.keyResults.map((kr) => ({
        id: kr.id,
        statement: kr.statement,
        successMetric: kr.metricLabel ?? undefined,
        owner: kr.ownerLabel ?? undefined,
      })),
    );
  }

  /** Cancel local edits only while no gateway operation is pending. */
  cancel(): void {
    if (!this.editor.isEditing() || this.busy()) return;
    this.editor.cancelEdits();
  }

  async save(): Promise<void> {
    if (!this.editor.isValid() || !this.editor.isDirty() || this.busy()) return;
    const state = this.editor.getState();
    await this.perform(async () => {
      await this.gateway.saveEdits({
        objective: state.draftObjective,
        keyResults: state.draftKeyResults.map((kr) => ({
          id: kr.id,
          statement: kr.statement,
          successMetric: kr.successMetric || undefined,
          owner: kr.owner || undefined,
        })),
      });
      this.editor.saveEdits();
    });
  }

  async regenerate(policy: 'overwrite' | 'append'): Promise<void> {
    this.showPolicies.set(false);
    await this.perform(() => this.gateway.regenerate(policy));
  }

  async copy(): Promise<void> {
    this.copied.set(false);
    await this.perform(async () => {
      await this.gateway.copy();
      this.copied.set(true);
    });
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
   * Event emitted when the user clicks the "Add Key Result" button.
   *
   * Parent components should listen to this event to handle adding
   * new key results to the OKR.
   */
  @Output() addKr = new EventEmitter<void>();

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
