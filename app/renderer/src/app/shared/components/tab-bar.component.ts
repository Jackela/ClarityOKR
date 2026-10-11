import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

export interface TabItem {
  id: string;
  label: string;
}

/**
 * Segmented tab control following the ARIA tabs pattern (spec §2.5, T3): only the selected
 * tab is in the Tab order, ← → move (wrapping) and activate, Home / End jump to the ends.
 * The consumer renders the `role="tabpanel"` with `aria-labelledby="tab-{id}"`.
 */
@Component({
  selector: 'clarityokr-tab-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tabs" role="tablist" [attr.aria-label]="label">
      @for (tab of tabs; track tab.id) {
        <button
          type="button"
          role="tab"
          class="tabs__tab"
          [id]="'tab-' + tab.id"
          [attr.aria-selected]="tab.id === selected"
          [attr.aria-controls]="'panel-' + tab.id"
          [attr.tabindex]="tab.id === selected ? 0 : -1"
          [attr.data-testid]="'tab-' + tab.id"
          (click)="select(tab.id)"
          (keydown)="onKeydown($event, $index)"
        >
          {{ tab.label }}
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        padding: 4px 16px;
      }
      .tabs {
        display: flex;
        height: 36px;
        padding: 2px;
        gap: 2px;
        border-radius: 10px;
        background: var(--color-bg-secondary);
      }
      .tabs__tab {
        flex: 1;
        min-width: 96px;
        height: 32px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: var(--color-text-secondary);
        font: inherit;
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        cursor: pointer;
      }
      .tabs__tab[aria-selected='true'] {
        background: var(--color-bg-primary);
        color: var(--color-text-primary);
        box-shadow: var(--shadow-sm);
        font-weight: var(--font-weight-semibold);
      }
    `,
  ],
})
export class TabBarComponent {
  @Input() tabs: readonly TabItem[] = [];
  @Input() selected = '';
  @Input() label = '';
  @Output() selectedChange = new EventEmitter<string>();

  select(id: string): void {
    if (id !== this.selected) this.selectedChange.emit(id);
  }

  onKeydown(event: KeyboardEvent, index: number): void {
    const last = this.tabs.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    const target = this.tabs[next];
    if (!target) return;
    this.selectedChange.emit(target.id);
    // tabindex -1 elements can still take programmatic focus; the selected tab gets
    // tabindex 0 on the next change detection.
    document.getElementById(`tab-${target.id}`)?.focus();
  }
}
