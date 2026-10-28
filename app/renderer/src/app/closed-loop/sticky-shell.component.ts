import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Input,
  ViewChild,
  Injector,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { IPC_CHANNELS, type DraftRow, type RestoreTarget } from '@clarityokr/contracts';

import { OkrStickyNoteComponent } from '../okr-sticky/components/okr-sticky-note.component';
import type { OkrStickyViewModel } from '../okr-sticky/services/okr-sticky.service';
import { EditModeStore } from '../okr-sticky/state/edit-mode.store';
import { DialogComponent } from '../shared/components/dialog.component';
import { ToastHostComponent } from '../shared/components/toast-host.component';
import { TabBarComponent, type TabItem } from '../shared/components/tab-bar.component';
import { ClosedLoopStore } from './closed-loop.store';
import { COPY } from './copy';
import { HistoryTabComponent } from './history-tab.component';
import { ClosedLoopApi } from './closed-loop-api.service';
import { ReminderNavigator, type GoReviewRequest } from './reminder-navigator.service';
import { ReviewStore } from './review.store';
import { ReviewTabComponent } from './review-tab.component';
import { StorageNoticesComponent } from './storage-notices.component';
import { TopBarComponent } from './top-bar.component';
import { UnsavedReporter } from './unsaved-reporter.service';
import { DraftRestoreBarComponent } from './draft-restore-bar.component';
import { DraftRestoreHosts, sameSections, type DraftApplyResult } from './draft-restore';
import { watchDraftRows } from './draft-reporter';

export type StickyTabId = 'note' | 'review' | 'history';

/**
 * Frame of the sticky window (spec §1.2): the tab bar and one panel per tab. The note panel
 * stays mounted while another tab is shown so an inline edit or a text draft is not lost.
 * Ctrl/⌘+1 / +2 / +3 select note / review / history. Leaving the review tab with unsaved text
 * asks first (spec §5.4).
 */
@Component({
  selector: 'clarityokr-sticky-shell',
  standalone: true,
  imports: [
    TabBarComponent,
    OkrStickyNoteComponent,
    HistoryTabComponent,
    ReviewTabComponent,
    DialogComponent,
    ToastHostComponent,
    TopBarComponent,
    StorageNoticesComponent,
    DraftRestoreBarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <clarityokr-top-bar />
      <clarityokr-storage-notices window="sticky" />
      <!-- #110: what a session end left unsaved in the text edit / review (S3§12). -->
      <clarityokr-draft-restore-bar />
      <!-- right after the top bar in the DOM, so its buttons follow the control that made it -->
      @if (tab() !== 'review') {
        <clarityokr-toast-host />
      }
      <clarityokr-tab-bar
        [tabs]="tabs"
        [selected]="tab()"
        [label]="copy.tabs.tablistLabel"
        (selectedChange)="select($event)"
      />
      <div
        class="shell__panel"
        role="tabpanel"
        id="panel-note"
        aria-labelledby="tab-note"
        [hidden]="tab() !== 'note'"
      >
        @if (okr) {
          <clarityokr-sticky-note [okr]="okr" />
        } @else {
          <div class="shell__empty" data-testid="note-empty">
            <p class="shell__empty-title">{{ copy.note.emptyTitle }}</p>
            <p>{{ copy.note.emptyBody }}</p>
          </div>
        }
      </div>
      <div
        class="shell__panel"
        role="tabpanel"
        id="panel-review"
        aria-labelledby="tab-review"
        [hidden]="tab() !== 'review'"
      >
        @if (tab() === 'review') {
          <clarityokr-review-tab (goNote)="select('note')" />
        }
      </div>
      <div
        class="shell__panel"
        role="tabpanel"
        id="panel-history"
        aria-labelledby="tab-history"
        [hidden]="tab() !== 'history'"
      >
        @if (tab() === 'history') {
          <clarityokr-history-tab [blockedReason]="blockedReason()" (opened)="onOpened()" />
        }
      </div>
      @if (leaveTarget(); as target) {
        <clarityokr-dialog
          [title]="copy.review.leaveTitle"
          [body]="copy.review.leaveBody"
          [cancelLabel]="copy.review.keepEditing"
          [confirmLabel]="copy.review.leave"
          [danger]="true"
          testId="review-leave-dialog"
          [confirmDisabled]="review.saving()"
          [confirmNote]="review.saving() ? copy.review.leaveSaving : ''"
          (cancelled)="keepEditingReview()"
          (confirmed)="leave(target)"
        />
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
        background: var(--glass-bg);
      }
      /* The window does not scroll: the tab bar stays, the panel scrolls, and the review keeps
         its bottom bar (with a toast above it) outside the scrolling part. */
      .shell {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      /* #41: a control scrolled into view at the top edge keeps room for the 2px sticky
         regenerate progress bar plus its 2px focus ring with 2px offset, so the ring is not
         clipped by the panel's overflow. */
      .shell__panel {
        --shell-panel-scroll-pad: calc(var(--regen-progress-height, 2px) + 6px);
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        scroll-padding-top: var(--shell-panel-scroll-pad);
      }
      #panel-review {
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      #panel-review > clarityokr-review-tab {
        flex: 1 1 auto;
        min-height: 0;
      }
      [hidden] {
        display: none !important;
      }
      .shell__empty {
        padding: 48px 24px;
        text-align: center;
        color: var(--color-text-secondary);
        font-size: var(--font-size-sm);
      }
      .shell__empty-title {
        margin: 0 0 4px;
        color: var(--color-text-primary);
        font-size: var(--font-size-base);
        font-weight: var(--font-weight-semibold);
      }
    `,
  ],
})
export class StickyShellComponent {
  @Input() okr: OkrStickyViewModel | null = null;

  readonly copy = COPY;
  readonly tabs: readonly TabItem[] = [
    { id: 'note', label: COPY.tabs.note },
    { id: 'review', label: COPY.tabs.review },
    { id: 'history', label: COPY.tabs.history },
  ];
  readonly tab = signal<StickyTabId>('note');
  /** The tab the user wanted while the review still has unsaved text (dialog is open). */
  readonly leaveTarget = signal<StickyTabId | null>(null);

  @ViewChild(OkrStickyNoteComponent) private note?: OkrStickyNoteComponent;

  private readonly store = inject(ClosedLoopStore);
  private readonly editor = inject(EditModeStore);
  readonly review = inject(ReviewStore);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // 「去复盘」 is answered here (this window has the review page), including requests handed
    // over from the main window (#84 review).
    const unregister = inject(ReminderNavigator).register((request) => this.onGoReview(request));
    const api = inject(ClosedLoopApi);
    const takeHandedOver = async (): Promise<void> => {
      const okrId = await api.takeReviewRequest?.();
      if (okrId) await this.onGoReview({ okrId });
    };
    const unsubscribe = api.onEvent?.(IPC_CHANNELS.REMINDERS_OPEN_REVIEW, () => {
      void takeHandedOver();
    });
    // #88: once this window's own first OKR is shown, tell main it is ready. Main then sends
    // REMINDERS_OPEN_REVIEW for a waiting request — always after the document it sent this
    // window on creation (main → renderer messages keep their order), so that document can no
    // longer supersede Q's OKR (the N55 (1) race).
    let saidReady = false;
    effect(() => {
      if (saidReady || this.store.detail() === null) return;
      saidReady = true;
      untracked(() => void api.reviewReady?.());
    });
    inject(DestroyRef).onDestroy(() => {
      unregister();
      unsubscribe?.();
    });
    // Unsaved input of this window, for the restart / quit confirmation (spec §1.2c).
    inject(UnsavedReporter).watch(
      computed(() => ({
        wizard: false,
        textEdit: this.editor.isEditing() && this.editor.isDirty(),
        reviewDraft: this.review.dirty(),
      })),
      inject(Injector),
    );
    // #110: the content of that input, for a draft if the session ends (S3§12.1).
    watchDraftRows(
      computed(() => this.draftRows()),
      inject(Injector),
    );
    const unregisterDraftHost = inject(DraftRestoreHosts).register({
      targetOf: (row) => this.draftTarget(row),
      apply: (rows) => this.applyDraft(rows),
      focusHeading: () => this.focusHeading(),
    });
    inject(DestroyRef).onDestroy(unregisterDraftHost);
    // The leave dialog is open and a save was started: when it succeeds the text is no longer
    // unsaved, the dialog closes by itself and the leave goes on. On failure the text is still
    // there (dirty) and 「放弃修改」 is clickable again.
    effect(() => {
      const target = this.leaveTarget();
      const saving = this.review.saving();
      const dirty = this.review.dirty();
      if (target === null || saving || dirty) return;
      untracked(() => {
        this.leaveTarget.set(null);
        this.go(target);
      });
    });
  }

  /** #110: one row per key result changed in the text edit, one for the review text. */
  private draftRows(): DraftRow[] {
    const rows: DraftRow[] = [];
    const okrId = this.store.detail()?.objective.id;
    if (!okrId) return rows;
    if (this.editor.isEditing() && this.editor.isDirty()) {
      const originals = new Map(this.editor.originalKeyResults().map((kr) => [kr.id, kr]));
      for (const kr of this.editor.draftKeyResults()) {
        const base = originals.get(kr.id);
        // A key result added in this edit has no saved spot to go back to (not drafted).
        if (!base) continue;
        const before = { statement: base.statement, successMetric: base.successMetric ?? '' };
        const now = { statement: kr.statement, successMetric: kr.successMetric ?? '' };
        if (before.statement === now.statement && before.successMetric === now.successMetric)
          continue;
        rows.push({ kind: 'textEdit', okrId, krId: kr.id, base: before, draft: now });
      }
    }
    if (this.review.dirty()) {
      rows.push({
        kind: 'review',
        okrId,
        base: this.savedReview(),
        draft: { ...this.review.draft() },
      });
    }
    return rows;
  }

  private savedReview(): { wentWell: string; fellShort: string; nextSteps: string } {
    const saved = this.review.review() ?? this.store.detail()?.review ?? null;
    return saved
      ? { wentWell: saved.wentWell, fellShort: saved.fellShort, nextSteps: saved.nextSteps }
      : { wentWell: '', fellShort: '', nextSteps: '' };
  }

  /** S3§12.3: saved since the draft → void; new unsaved edits → confirm; else restore. */
  private draftTarget(row: DraftRow): RestoreTarget {
    const detail = this.store.detail();
    const sameOkr = detail && row.kind !== 'wizard' && detail.objective.id === row.okrId;
    if (row.kind === 'textEdit') {
      if (sameOkr) {
        const kr = detail.objective.keyResults.find((k) => k.id === row.krId);
        if (
          kr &&
          (kr.statement !== row.base.statement ||
            (kr.successMetric ?? '') !== row.base.successMetric)
        ) {
          return 'saved';
        }
      }
      return this.editor.isEditing() && this.editor.isDirty() ? 'dirty' : 'untouched';
    }
    if (row.kind === 'review') {
      if (sameOkr && !sameSections(this.savedReview(), row.base)) return 'saved';
      return this.review.dirty() ? 'dirty' : 'untouched';
    }
    return 'untouched';
  }

  /**
   * #110 「恢复」: open the draft's OKR when another one is shown, put the key result texts back
   * into the text edit and the review text into the review store (all still unsaved). Focus
   * follows S3§12.3: the first kind in the order text edit, review. The review text survives
   * on the note tab (the review store keeps unsaved text of the same OKR).
   */
  private async applyDraft(rows: readonly DraftRow[]): Promise<DraftApplyResult> {
    const first = rows.find((r): r is Exclude<DraftRow, { kind: 'wizard' }> => r.kind !== 'wizard');
    if (!first) return { ok: false };
    const okrId = first.okrId;
    if (this.store.detail()?.objective.id !== okrId) {
      if (this.editor.isEditing()) this.editor.cancelEdits();
      if (this.review.dirty()) this.review.discard();
      const opened = await this.store.openFromHistory(okrId);
      if (!opened) return { ok: false };
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const krs = rows.flatMap((r) =>
      r.kind === 'textEdit' && r.okrId === okrId
        ? [{ krId: r.krId, statement: r.draft.statement, successMetric: r.draft.successMetric }]
        : [],
    );
    const review = rows.find(
      (r): r is Extract<DraftRow, { kind: 'review' }> => r.kind === 'review' && r.okrId === okrId,
    );
    // What to put back if the draft file cannot be updated afterwards (S3-05).
    const wasEditing = this.editor.isEditing();
    const editBefore = this.editor.draftKeyResults().map((kr) => ({ ...kr }));
    const reviewBefore = { ...this.review.draft() };
    const rollback = (): void => {
      if (krs.length > 0) {
        if (!wasEditing) this.editor.cancelEdits();
        else for (const kr of editBefore) this.editor.updateKeyResult(kr.id, kr);
      }
      if (review) this.review.draft.set(reviewBefore);
    };
    if (review) {
      if (this.review.currentOkrId() !== okrId || this.review.loadState() !== 'ready') {
        await this.review.load(okrId);
      }
      if (this.review.loadState() !== 'ready') return { ok: false };
      this.review.draft.set({ ...review.draft });
    }
    if (krs.length > 0) {
      if (this.tab() !== 'note') this.tab.set('note');
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!this.note?.restoreDraft(krs)) {
        if (review) this.review.draft.set(reviewBefore);
        return { ok: false };
      }
      const firstKr = krs[0].krId;
      setTimeout(() => {
        this.host.nativeElement
          .querySelector<HTMLElement>(`[id="edit-kr-${firstKr}"]`)
          ?.focus({ focusVisible: true } as FocusOptions);
      }, 50);
      return { ok: true, rollback };
    }
    if (this.tab() !== 'review') this.tab.set('review');
    setTimeout(() => {
      this.host.nativeElement
        .querySelector<HTMLElement>('[data-testid="review-wentWell"]')
        ?.focus({ focusVisible: true } as FocusOptions);
    }, 50);
    return { ok: true, rollback };
  }

  private focusHeading(): void {
    const title = this.host.nativeElement.querySelector<HTMLElement>(
      '[data-testid="sticky-objective"], [data-testid="review-objective"]',
    );
    title?.focus();
  }

  blockedReason(): string | null {
    if (this.store.operationBusy()) return COPY.history.blockedBusy;
    if (this.editor.isEditing()) return COPY.history.blockedEditing;
    return null;
  }

  select(id: string): void {
    if (id !== 'note' && id !== 'review' && id !== 'history') return;
    if (id === this.tab()) return;
    // Unsaved review text is never dropped silently (spec §5.4).
    if (this.tab() === 'review' && this.review.dirty()) {
      this.leaveTarget.set(id);
      return;
    }
    this.go(id);
  }

  /** The user confirmed 「放弃修改」. */
  leave(id: StickyTabId): void {
    // Never throw away text that a save is still sending (the dialog button is disabled then).
    if (this.review.saving()) return;
    this.leaveTarget.set(null);
    this.review.discard();
    this.go(id);
  }

  /** 「继续编辑」 in the leave dialog: stay, and forget a waiting 「去复盘」 (N55). */
  keepEditingReview(): void {
    this.leaveTarget.set(null);
    this.pendingReview = null;
  }

  /** A 「去复盘」 waiting for the review leave dialog (N55). */
  private pendingReview: Pick<GoReviewRequest, 'okrId'> | null = null;

  private go(id: StickyTabId): void {
    const pending = this.pendingReview;
    if (pending) {
      this.pendingReview = null;
      void this.onGoReview(pending);
      return;
    }
    this.tab.set(id);
    if (id === 'history') void this.store.refreshList();
  }

  /**
   * #54 「去复盘」: switch to the banner's quarter (open its unreviewed OKR when another one is
   * shown), then the review tab with focus on its title.
   */
  async onGoReview(request: Pick<GoReviewRequest, 'okrId'>): Promise<void> {
    // N55: never drop unsaved input silently — reuse the existing confirmations.
    // Unsaved review text: the review leave dialog; the request goes on after 「放弃修改」 (or
    // after a save in flight succeeds), and is dropped on 「继续编辑」.
    if (this.tab() === 'review' && this.review.dirty()) {
      this.pendingReview = request;
      this.leaveTarget.set('note');
      return;
    }
    // Text being edited on the note: unchanged edits just close; changed ones ask with the note's
    // own 「放弃未保存的修改？」 dialog; 「继续编辑」 keeps the edits and stays.
    if (this.editor.isEditing()) {
      if (this.tab() !== 'note') this.go('note');
      const leave = this.editor.isDirty() ? await this.note?.confirmDiscard() : true;
      if (!leave) return;
      this.editor.cancelEdits();
    }
    if (this.store.detail()?.objective.id !== request.okrId) {
      const opened = await this.store.openFromHistory(request.okrId);
      if (!opened) return;
    }
    this.select('review');
    for (let tries = 0; tries < 60; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const title = this.host.nativeElement.querySelector<HTMLElement>(
        '[data-testid="review-objective"]',
      );
      if (title) {
        // N56: a visible focus ring after 「去复盘」 (also when handed over from the main window)
        title.focus({ focusVisible: true } as FocusOptions);
        return;
      }
    }
  }

  onOpened(): void {
    this.tab.set('note');
    // The note panel is shown again on the next change detection; then focus the title.
    setTimeout(() => this.note?.focusTitle(), 0);
  }

  /** Ctrl/⌘ + 1 → note, Ctrl/⌘ + 3 → history (the spec's 1 / 2 / 3 positions). */
  @HostListener('document:keydown', ['$event'])
  onShortcut(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    if (event.key === '1') {
      event.preventDefault();
      this.select('note');
    } else if (event.key === '2') {
      event.preventDefault();
      this.select('review');
    } else if (event.key === '3') {
      event.preventDefault();
      this.select('history');
    }
  }
}
