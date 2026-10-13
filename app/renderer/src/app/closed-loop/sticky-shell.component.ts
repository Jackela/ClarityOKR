import {
  ChangeDetectionStrategy,
  Component,
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

import { OkrStickyNoteComponent } from '../okr-sticky/components/okr-sticky-note.component';
import type { OkrStickyViewModel } from '../okr-sticky/services/okr-sticky.service';
import { EditModeStore } from '../okr-sticky/state/edit-mode.store';
import { DialogComponent } from '../shared/components/dialog.component';
import { ToastHostComponent } from '../shared/components/toast-host.component';
import { TabBarComponent, type TabItem } from '../shared/components/tab-bar.component';
import { ClosedLoopStore } from './closed-loop.store';
import { COPY } from './copy';
import { HistoryTabComponent } from './history-tab.component';
import { ReviewStore } from './review.store';
import { ReviewTabComponent } from './review-tab.component';
import { StorageNoticesComponent } from './storage-notices.component';
import { TopBarComponent } from './top-bar.component';
import { UnsavedReporter } from './unsaved-reporter.service';

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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <clarityokr-top-bar />
      <clarityokr-storage-notices window="sticky" />
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
          (cancelled)="leaveTarget.set(null)"
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
      .shell__panel {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
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

  constructor() {
    // Unsaved input of this window, for the restart / quit confirmation (spec §1.2c).
    inject(UnsavedReporter).watch(
      computed(() => ({
        wizard: false,
        textEdit: this.editor.isEditing() && this.editor.isDirty(),
        reviewDraft: this.review.dirty(),
      })),
      inject(Injector),
    );
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

  private go(id: StickyTabId): void {
    this.tab.set(id);
    if (id === 'history') void this.store.refreshList();
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
