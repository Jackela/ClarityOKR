import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  type OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';

import { ClosedLoopApi } from './closed-loop-api.service';
import { COPY } from './copy';
import { ExportFlow } from './export-flow.service';
import { ExportMenuComponent } from './export-menu.component';

/**
 * Top bar of the sticky window (spec §1.2 / §1.2a / §2.5): 40px, the whole bar is a drag area
 * (`-webkit-app-region: drag`) and every control in it is `no-drag`. Tab order: 导出 → 更多 → 隐藏.
 * - 「⋯」 (更多): 「全部备份…」 (#50, S1§9.2) above a separator, then the switch 「窗口始终在最前」
 *   (`menuitemcheckbox`); the button shows loading while a backup takes > 300ms;
 * - 「隐藏」: 32×32, a line icon (not ×), hides the window without asking; the app keeps
 *   running (tray, single instance, menu and 「重开便签」 bring it back). Its tooltip shows on
 *   hover and on keyboard focus.
 */
@Component({
  selector: 'clarityokr-top-bar',
  standalone: true,
  imports: [ExportMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar" data-testid="top-bar">
      <span class="bar__title">{{ t.topBarTitle }}</span>
      <div class="bar__actions">
        <clarityokr-export-menu />
        <div class="more">
          <button
            #moreButton
            type="button"
            class="bar__btn"
            data-testid="more-button"
            [attr.aria-busy]="backingUp() ? 'true' : null"
            aria-haspopup="menu"
            [attr.aria-expanded]="moreOpen()"
            [attr.aria-controls]="moreOpen() ? 'more-menu' : null"
            [attr.aria-label]="w.more"
            (click)="toggleMore()"
            (keydown)="onMoreButtonKey($event)"
          >
            @if (backingUp()) {
              <span class="bar__spinner" aria-hidden="true" data-testid="more-spinner"></span>
            } @else {
              <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
                <circle cx="4.5" cy="10" r="1.6" fill="currentColor" />
                <circle cx="10" cy="10" r="1.6" fill="currentColor" />
                <circle cx="15.5" cy="10" r="1.6" fill="currentColor" />
              </svg>
            }
          </button>
          @if (moreOpen()) {
            <div
              id="more-menu"
              class="menu"
              role="menu"
              [attr.aria-label]="w.more"
              data-testid="more-menu"
              (keydown)="onMenuKey($event)"
            >
              <button
                #backupItem
                type="button"
                class="menu__item menu__item--two"
                role="menuitem"
                data-testid="backup-item"
                [attr.aria-disabled]="backupReason ? 'true' : null"
                [attr.title]="backupReason"
                [attr.aria-description]="backupReason ?? t2.menuHint"
                (click)="backup()"
              >
                <span class="menu__check" aria-hidden="true"></span>
                <span class="menu__text">
                  <span>{{ t2.menu }}</span>
                  <span class="menu__hint" aria-hidden="true">{{ t2.menuHint }}</span>
                </span>
              </button>
              <div class="menu__sep" role="separator"></div>
              <button
                #onTopItem
                type="button"
                class="menu__item"
                role="menuitemcheckbox"
                data-testid="always-on-top"
                [attr.aria-checked]="alwaysOnTop()"
                (click)="toggleAlwaysOnTop()"
              >
                <span class="menu__check" aria-hidden="true">{{ alwaysOnTop() ? '✓' : '' }}</span>
                {{ w.alwaysOnTop }}
              </button>
            </div>
          }
        </div>
        <span class="hide" (mouseenter)="refreshHideState()" (focusin)="refreshHideState()">
          <button
            type="button"
            class="bar__btn"
            data-testid="hide-button"
            [attr.aria-label]="hideQuits() ? w.hideQuitsTooltip : w.hide"
            [attr.aria-describedby]="hideQuits() ? null : 'hide-tooltip'"
            (click)="hide()"
          >
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
              <path d="M5 10h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </button>
          <span id="hide-tooltip" class="tooltip" role="tooltip" data-testid="hide-tooltip">{{
            hideQuits() ? w.hideQuitsTooltip : w.hideTooltip
          }}</span>
        </span>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        flex: none;
      }
      .bar {
        -webkit-app-region: drag;
        display: flex;
        align-items: center;
        justify-content: space-between;
        box-sizing: border-box;
        height: 40px;
        padding: 0 8px 0 16px;
        border-bottom: 1px solid var(--color-border);
        background: var(--color-bg-primary);
      }
      .bar__title {
        font-size: 13px;
        font-weight: 600;
        color: var(--color-text-secondary);
        user-select: none;
      }
      .bar__actions {
        display: flex;
        align-items: center;
        gap: 2px;
      }
      .bar__actions > * {
        -webkit-app-region: no-drag;
      }
      .bar__btn {
        -webkit-app-region: no-drag;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--color-text-primary);
        cursor: pointer;
      }
      .bar__btn:hover {
        background: var(--color-bg-secondary);
      }
      .bar__btn:active {
        background: var(--color-bg-tertiary);
      }
      .more,
      .hide {
        position: relative;
        display: inline-flex;
      }
      .menu {
        position: absolute;
        top: calc(100% + 4px);
        right: 0;
        z-index: var(--z-dropdown);
        box-sizing: border-box;
        width: 280px;
        padding: 4px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        background: var(--color-bg-primary);
        box-shadow: var(--shadow-lg);
      }
      .menu__item {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        min-height: 40px;
        padding: 0 12px 0 8px;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--color-text-primary);
        font: inherit;
        font-size: var(--font-size-sm);
        text-align: left;
        cursor: pointer;
      }
      .menu__item:hover,
      .menu__item:focus {
        background: var(--color-bg-secondary);
      }
      .menu__item--two {
        min-height: 48px;
        padding-top: 6px;
        padding-bottom: 6px;
        text-align: left;
      }
      .menu__item[aria-disabled='true'] {
        color: var(--color-text-tertiary, var(--color-text-secondary));
        cursor: not-allowed;
      }
      .menu__text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .menu__hint {
        font-size: 12px;
        line-height: 16px;
        color: var(--color-text-secondary);
      }
      .menu__sep {
        height: 1px;
        margin: 4px 0;
        background: var(--color-border);
      }
      .bar__spinner {
        width: 14px;
        height: 14px;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 50%;
        animation: bar-spin 0.8s linear infinite;
      }
      @keyframes bar-spin {
        to {
          transform: rotate(360deg);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .bar__spinner {
          animation: none;
        }
      }
      .menu__check {
        display: inline-block;
        width: 16px;
        text-align: center;
      }
      .tooltip {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        z-index: var(--z-dropdown);
        box-sizing: border-box;
        width: max-content;
        max-width: 240px;
        padding: 6px 8px;
        border-radius: var(--radius-md);
        background: var(--color-text-primary);
        color: var(--color-bg-primary);
        font-size: var(--font-size-xs);
        line-height: 16px;
        pointer-events: none;
        visibility: hidden;
        opacity: 0;
        transition: opacity 0.12s ease;
      }
      .hide:hover .tooltip,
      .hide:focus-within .tooltip {
        visibility: visible;
        opacity: 1;
      }
    `,
  ],
})
export class TopBarComponent implements OnDestroy {
  readonly t = COPY.export;
  readonly w = COPY.window;
  readonly t2 = COPY.backup;
  private readonly exportFlow = inject(ExportFlow);
  /** A backup has run for more than 300ms (the status is spoken by the export menu's live region). */
  readonly backingUp = computed(() => this.exportFlow.backingUp() && this.exportFlow.slow());
  private readonly api = inject(ClosedLoopApi);
  private readonly document = inject(DOCUMENT);

  readonly moreOpen = signal(false);
  readonly alwaysOnTop = signal(true);
  /** N15: no tray icon and this is the last visible window, so 「隐藏」 quits (Win / Linux). */
  readonly hideQuits = signal(false);

  @ViewChild('moreButton') private moreButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('onTopItem') private onTopItem?: ElementRef<HTMLButtonElement>;
  @ViewChild('backupItem') private backupItem?: ElementRef<HTMLButtonElement>;

  get backupReason(): string | null {
    return this.exportFlow.backupDisabledReason;
  }

  backup(): void {
    if (this.backupReason) return;
    this.closeMore(false);
    const restore = (): void => this.moreButton?.nativeElement.focus();
    this.exportFlow.registerTrigger(restore);
    void this.exportFlow.backup();
  }

  private readonly onDocumentPointer = (event: Event): void => {
    const target = event.target as Node | null;
    const host = this.moreButton?.nativeElement.parentElement;
    if (host && target && !host.contains(target)) this.closeMore(false);
  };

  ngOnDestroy(): void {
    this.document.removeEventListener('mousedown', this.onDocumentPointer, true);
  }

  async toggleMore(): Promise<void> {
    if (this.moreOpen()) {
      this.closeMore(true);
      return;
    }
    const state = await this.api.getWindowState();
    if (state.ok) this.alwaysOnTop.set(state.data.alwaysOnTop);
    this.moreOpen.set(true);
    this.document.addEventListener('mousedown', this.onDocumentPointer, true);
    setTimeout(() => this.backupItem?.nativeElement.focus());
  }

  onMoreButtonKey(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.moreOpen()) {
      event.preventDefault();
      this.closeMore(true);
    } else if (event.key === 'ArrowDown' && !this.moreOpen()) {
      event.preventDefault();
      void this.toggleMore();
    }
  }

  onMenuKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.closeMore(true);
    } else if (event.key === 'Tab') {
      this.closeMore(false);
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const items = [this.backupItem, this.onTopItem].map((i) => i?.nativeElement);
      const current = items.indexOf(this.document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : (current + 1) % 2; // two items
      items[next]?.focus();
    }
  }

  /** Asked again on hover / focus: other windows may have been shown or hidden meanwhile. */
  async refreshHideState(): Promise<void> {
    const state = await this.api.getWindowState();
    if (state.ok) this.hideQuits.set(state.data.hideQuits === true);
  }

  async toggleAlwaysOnTop(): Promise<void> {
    const reply = await this.api.setAlwaysOnTop(!this.alwaysOnTop());
    if (reply.ok) this.alwaysOnTop.set(reply.data.alwaysOnTop);
  }

  async hide(): Promise<void> {
    this.closeMore(false);
    await this.api.hideWindow();
  }

  private closeMore(returnFocus: boolean): void {
    if (!this.moreOpen()) return;
    this.moreOpen.set(false);
    this.document.removeEventListener('mousedown', this.onDocumentPointer, true);
    if (returnFocus) this.moreButton?.nativeElement.focus();
  }
}
