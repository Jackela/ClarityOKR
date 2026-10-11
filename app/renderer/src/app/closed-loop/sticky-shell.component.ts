import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
  ViewChild,
  inject,
  signal,
} from '@angular/core';

import { OkrStickyNoteComponent } from '../okr-sticky/components/okr-sticky-note.component';
import type { OkrStickyViewModel } from '../okr-sticky/services/okr-sticky.service';
import { EditModeStore } from '../okr-sticky/state/edit-mode.store';
import { TabBarComponent, type TabItem } from '../shared/components/tab-bar.component';
import { ClosedLoopStore } from './closed-loop.store';
import { COPY } from './copy';
import { HistoryTabComponent } from './history-tab.component';

export type StickyTabId = 'note' | 'history';

/**
 * Frame of the sticky window (spec §1.2): the tab bar and one panel per tab. The note panel
 * stays mounted while another tab is shown so an inline edit or a text draft is not lost.
 * The review tab is added in a later slice; Ctrl/⌘+1 and +3 are already the spec's keys for
 * "note" and "history".
 */
@Component({
  selector: 'clarityokr-sticky-shell',
  standalone: true,
  imports: [TabBarComponent, OkrStickyNoteComponent, HistoryTabComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
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
          <clarityokr-sticky-note [okr]="okr" (addKr)="addKr.emit()" />
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
        id="panel-history"
        aria-labelledby="tab-history"
        [hidden]="tab() !== 'history'"
      >
        @if (tab() === 'history') {
          <clarityokr-history-tab [blockedReason]="blockedReason()" (opened)="onOpened()" />
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--glass-bg);
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
        font-size: var(--font-size-md);
        font-weight: var(--font-weight-semibold);
      }
    `,
  ],
})
export class StickyShellComponent {
  @Input() okr: OkrStickyViewModel | null = null;
  @Output() addKr = new EventEmitter<void>();

  readonly copy = COPY;
  readonly tabs: readonly TabItem[] = [
    { id: 'note', label: COPY.tabs.note },
    { id: 'history', label: COPY.tabs.history },
  ];
  readonly tab = signal<StickyTabId>('note');

  @ViewChild(OkrStickyNoteComponent) private note?: OkrStickyNoteComponent;

  private readonly store = inject(ClosedLoopStore);
  private readonly editor = inject(EditModeStore);

  blockedReason(): string | null {
    if (this.store.operationBusy()) return COPY.history.blockedBusy;
    if (this.editor.isEditing()) return COPY.history.blockedEditing;
    return null;
  }

  select(id: string): void {
    if (id !== 'note' && id !== 'history') return;
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
    } else if (event.key === '3') {
      event.preventDefault();
      this.select('history');
    }
  }
}
