/**
 * Component that renders an OKR as a sticky note card.
 *
 * Shows the objective with its period and overall progress, the key results with status,
 * progress bar and inline progress editing (see {@link KrRowComponent}), the removed key
 * results and the existing text edit / regenerate / copy actions. The progress data comes
 * from {@link ClosedLoopStore}; the text of the OKR still comes from the view model.
 *
 * @module okr-sticky/components/okr-sticky-note
 */
import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
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
import { COPY, formatRelativeTime } from '../../closed-loop/copy';
import { KrRowComponent } from '../../closed-loop/kr-row.component';
import { OverallProgressComponent } from '../../closed-loop/overall-progress.component';
import { PeriodPickerComponent } from '../../closed-loop/period-picker.component';
import { ReminderStore } from '../../closed-loop/reminder.store';
import { ReviewReminderBannerComponent } from '../../closed-loop/review-reminder-banner.component';
import { DialogComponent } from '../../shared/components/dialog.component';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { TextEditComponent, type TextSaveFailure } from '../../closed-loop/text-edit.component';
import { RegenerateFlow } from '../../closed-loop/regenerate-flow.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { OkrStickyService, type OkrStickyViewModel } from '../services/okr-sticky.service';
import { EditModeStore } from '../state/edit-mode.store';
import { OkrStickyRegenBannerComponent } from './okr-sticky-regen-banner.component';
import { OkrStickyRegenBarComponent } from './okr-sticky-regen-bar.component';
import { OkrStickyRegenMenuComponent } from './okr-sticky-regen-menu.component';
import { StickyRegenLive } from './okr-sticky-regen-live';
import { focusRegenButton } from './okr-sticky-regen-focus';
import {
  OkrStickyRemovedComponent,
  removedKrs as removedKeyResults,
} from './okr-sticky-removed.component';

const MAX_KEY_RESULTS = 10;

function newKeyResultId(): string {
  const crypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  return crypto?.randomUUID ? crypto.randomUUID() : `kr-${Math.random().toString(36).slice(2)}`;
}

@Component({
  selector: 'clarityokr-sticky-note',
  standalone: true,
  imports: [
    TranslatePipe,
    TextEditComponent,
    DialogComponent,
    KrRowComponent,
    OverallProgressComponent,
    PeriodPickerComponent,
    ReviewReminderBannerComponent,
    SkeletonComponent,
    OkrStickyRegenBannerComponent,
    OkrStickyRegenMenuComponent,
    OkrStickyRegenBarComponent,
    OkrStickyRemovedComponent,
  ],
  providers: [StickyRegenLive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './okr-sticky-note.component.html',
  styleUrls: ['./okr-sticky-note.component.scss'],
})
export class OkrStickyNoteComponent implements OnChanges {
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly periodAnnouncement = signal('');
  readonly t = COPY;
  readonly editError = signal<TextSaveFailure>('none');
  readonly discardOpen = signal(false);
  readonly focusTarget = signal<{ id: string; field: 'statement' | 'metric' } | null>(null);
  readonly textSavedLive = signal('');

  @ViewChild('title') private title?: ElementRef<HTMLElement>;
  @ViewChild('toprow') private toprow?: ElementRef<HTMLElement>;
  @ViewChild('editBtn') private editBtn?: ElementRef<HTMLElement>;
  @ViewChild(OkrStickyRemovedComponent) private removedSection?: OkrStickyRemovedComponent;
  readonly reminders = inject(ReminderStore);
  readonly regen = inject(RegenerateFlow);
  readonly regenLive = inject(StickyRegenLive);

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
    return removedKeyResults(all);
  }

  filledCount(all: KeyResultRecord[]): number {
    return this.activeKrs(all).filter((kr) => kr.progress !== null).length;
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

  /** #54: ✕ on the reminder banner moves focus to the quarter picker. */
  focusPeriodPicker(): void {
    setTimeout(() => {
      this.toprow?.nativeElement
        .querySelector<HTMLElement>('[data-testid="period-picker"]')
        // N56: the moved focus shows its ring (pointer click on ✕ would otherwise hide it)
        ?.focus({ focusVisible: true } as FocusOptions);
    }, 0);
  }

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

  /**
   * #110 / #117 「恢复」: opens the text edit form and puts the drafted objective, key result
   * texts and added key results back (still unsaved). The focus target is the first restored
   * key result (the objective field is focused by the caller). false = the form cannot open or a
   * drafted key result is not in it; nothing is changed then.
   */
  restoreDraft(draft: {
    objective?: string;
    krs: readonly { krId: string; statement: string; successMetric: string }[];
    added?: readonly { id: string; statement: string; successMetric: string }[];
  }): boolean {
    const added = draft.added ?? [];
    if (draft.objective === undefined && draft.krs.length === 0 && added.length === 0) return false;
    if (!this.editor.isEditing()) this.beginEdit();
    if (!this.editor.isEditing()) return false;
    const ids = new Set(this.editor.draftKeyResults().map((kr) => kr.id));
    if (!draft.krs.every((kr) => ids.has(kr.krId))) return false;
    if (draft.objective !== undefined) this.editor.updateObjective(draft.objective);
    for (const kr of draft.krs) {
      this.editor.updateKeyResult(kr.krId, {
        statement: kr.statement,
        successMetric: kr.successMetric,
      });
    }
    for (const kr of added) {
      if (!ids.has(kr.id)) this.editor.addKeyResult(kr.id);
      this.editor.updateKeyResult(kr.id, {
        statement: kr.statement,
        successMetric: kr.successMetric,
      });
    }
    const firstKr = draft.krs[0]?.krId ?? added[0]?.id;
    this.focusTarget.set(
      draft.objective === undefined && firstKr ? { id: firstKr, field: 'statement' } : null,
    );
    return true;
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

  /** Answer to a pending {@link confirmDiscard}: true = 放弃修改, false = 继续编辑. */
  private discardAnswer: ((leave: boolean) => void) | null = null;

  /**
   * N55: asks with the same 「放弃未保存的修改？」 dialog before something else (「去复盘」 from the
   * main window) replaces the note. Resolves true on 「放弃修改」, false on 「继续编辑」. The caller
   * drops the edits itself.
   */
  confirmDiscard(): Promise<boolean> {
    this.discardAnswer?.(false);
    this.discardOpen.set(true);
    return new Promise<boolean>((resolve) => (this.discardAnswer = resolve));
  }

  keepEditing(): void {
    this.discardOpen.set(false);
    const answer = this.discardAnswer;
    this.discardAnswer = null;
    answer?.(false);
  }

  discard(): void {
    const answer = this.discardAnswer;
    if (answer) {
      this.discardAnswer = null;
      this.discardOpen.set(false);
      answer(true);
      return;
    }
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

  isRegenerating(krId: string): boolean {
    const running = this.regen.running();
    return running === 'all' || (running !== null && running.has(krId));
  }

  activeIds(): string[] {
    const d = this.detail();
    return d ? this.activeKrs(d.objective.keyResults).map((kr) => kr.id) : [];
  }

  async confirmRegen(): Promise<void> {
    const okrId = this.okr?.id;
    if (!okrId) return;
    this.regenLive.setRunning();
    await this.regen.confirmed(okrId);
    this.regenLive.clear();
  }

  /** 「查看已移除」: open the removed section and move the focus to its heading. */
  viewRemoved(): void {
    this.removedSection?.viewRemoved();
  }

  /** Selection mode keys (spec §3.7): Ctrl/⌘+A selects all, Esc leaves. */
  @HostListener('document:keydown', ['$event'])
  onSelectionKey(event: KeyboardEvent): void {
    if (!this.regen.selecting() || this.regen.confirm()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.regen.stopSelecting();
      focusRegenButton();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.regen.selectAll(this.activeIds());
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
