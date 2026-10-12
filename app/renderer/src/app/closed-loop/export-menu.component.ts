import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Input,
  type OnDestroy,
  type OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import type { ExportFormat } from '@clarityokr/contracts';

import { COPY } from './copy';
import { ExportFlow } from './export-flow.service';

type MenuAction = { kind: 'export'; format: ExportFormat } | { kind: 'copy' };

/**
 * 「导出 ▾」 (spec §6.2): a button that opens a menu with 导出为 Markdown… / 导出为 JSON… /
 * 复制为 Markdown. Menu pattern of §2.6: `aria-haspopup="menu"` + `aria-expanded`; Enter / Space /
 * ↓ open and focus the first item; ↑ ↓ Home End move; Enter chooses; Esc closes and the focus
 * goes back to the button; Tab closes. The button stays focusable and is `aria-disabled` (with a
 * tooltip saying why) when there is nothing to export or a regeneration is running.
 */
@Component({
  selector: 'clarityokr-export-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="export">
      <button
        #trigger
        type="button"
        class="export__btn"
        aria-haspopup="menu"
        [attr.aria-expanded]="open()"
        [attr.aria-disabled]="reason ? 'true' : null"
        [attr.aria-busy]="flow.slow() ? 'true' : null"
        [attr.title]="reason"
        [class.export__btn--disabled]="reason"
        [attr.data-testid]="testId"
        (click)="onTriggerClick()"
        (keydown)="onTriggerKeydown($event)"
      >
        @if (flow.slow()) {
          <span class="export__spinner" aria-hidden="true" data-testid="export-spinner"></span>
        }
        <svg class="export__icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <path
            d="M8 2v7m0 0L5 6m3 3l3-3M3 12.5h10"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="export__label">{{ label }}</span>
        <span class="export__caret" aria-hidden="true">▾</span>
      </button>
      <span class="sr-only" role="status" data-testid="export-status">{{ flow.statusText() }}</span>
      @if (open()) {
        <div
          class="export__menu"
          role="menu"
          [attr.aria-label]="t.menuLabel"
          data-testid="export-menu"
          (keydown)="onMenuKeydown($event)"
        >
          @for (item of items; track item.testId) {
            @if (item.separatorBefore) {
              <div class="export__sep" role="separator"></div>
            }
            <button
              #entry
              type="button"
              role="menuitem"
              tabindex="-1"
              class="export__item"
              [attr.data-testid]="item.testId"
              (click)="choose(item.action)"
            >
              <span class="export__item-title">{{ item.title }}</span
              >&ngsp;
              <span class="export__item-hint">{{ item.hint }}</span>
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-block;
        -webkit-app-region: no-drag;
      }
      .export {
        position: relative;
      }
      .export__btn {
        -webkit-app-region: no-drag;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        box-sizing: border-box;
        min-width: 36px;
        height: 36px;
        padding: 0 12px;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--color-text-primary);
        font: inherit;
        font-size: var(--font-size-sm);
        cursor: pointer;
      }
      .export__btn:hover {
        background: var(--color-bg-secondary);
      }
      .export__btn:active {
        background: var(--color-bg-tertiary);
      }
      .export__btn--disabled {
        color: var(--color-text-secondary);
        cursor: not-allowed;
      }
      .export__btn--disabled:hover,
      .export__btn--disabled:active {
        background: transparent;
      }
      .export__btn:focus-visible,
      .export__item:focus-visible {
        outline: 2px solid var(--color-brand-primary);
        outline-offset: 2px;
      }
      .export__icon {
        display: none;
      }
      .export__spinner {
        width: 14px;
        height: 14px;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 50%;
        animation: export-spin 0.8s linear infinite;
      }
      .export__menu {
        position: absolute;
        top: calc(100% + 4px);
        right: 0;
        z-index: var(--z-dropdown);
        box-sizing: border-box;
        width: 280px;
        max-width: calc(100vw - 16px);
        padding: 4px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        background: var(--color-bg-primary);
        box-shadow: var(--shadow-lg);
      }
      .export__item {
        display: flex;
        flex-direction: column;
        justify-content: center;
        width: 100%;
        min-height: 48px;
        padding: 6px 12px;
        border: 0;
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--color-text-primary);
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .export__item:hover,
      .export__item:focus {
        background: var(--color-bg-secondary);
      }
      .export__item-title {
        font-size: var(--font-size-sm);
      }
      .export__item-hint {
        font-size: var(--font-size-xs);
        line-height: 16px;
        color: var(--color-text-secondary);
      }
      .export__sep {
        height: 1px;
        margin: 4px 8px;
        background: var(--color-border);
      }
      /* Narrow window (< 360px): only the icon; the name stays for assistive technology. */
      @media (max-width: 359px) {
        .export__icon {
          display: block;
        }
        .export__caret {
          display: none;
        }
        .export__label {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          white-space: nowrap;
        }
      }
      @keyframes export-spin {
        to {
          transform: rotate(360deg);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .export__spinner {
          animation: none;
        }
      }
    `,
  ],
})
export class ExportMenuComponent implements OnInit, OnDestroy {
  @Input() label: string = COPY.export.button;
  @Input() testId = 'export-button';

  readonly flow = inject(ExportFlow);
  readonly t = COPY.export;
  readonly open = signal(false);

  readonly items: ReadonlyArray<{
    testId: string;
    title: string;
    hint: string;
    action: MenuAction;
    separatorBefore?: boolean;
  }> = [
    {
      testId: 'export-md',
      title: this.t.markdown,
      hint: this.t.markdownHint,
      action: { kind: 'export', format: 'md' },
    },
    {
      testId: 'export-json',
      title: this.t.json,
      hint: this.t.jsonHint,
      action: { kind: 'export', format: 'json' },
    },
    {
      testId: 'export-copy-md',
      title: this.t.copyMarkdown,
      hint: this.t.copyMarkdownHint,
      action: { kind: 'copy' },
      separatorBefore: true,
    },
  ];

  @ViewChild('trigger', { static: true }) private trigger!: ElementRef<HTMLButtonElement>;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly doc = inject(DOCUMENT);

  get reason(): string | null {
    return this.flow.disabledReason;
  }

  ngOnInit(): void {
    this.flow.registerTrigger(() => this.trigger.nativeElement.focus());
  }

  ngOnDestroy(): void {
    this.flow.registerTrigger(null);
  }

  /** A press outside closes the menu (without moving the focus: the target takes it). */
  @HostListener('document:mousedown', ['$event'])
  onOutside(event: MouseEvent): void {
    if (!this.open()) return;
    if (event.target instanceof Node && this.host.nativeElement.contains(event.target)) return;
    this.open.set(false);
  }

  onTriggerClick(): void {
    if (this.reason || this.flow.busy()) return;
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.openMenu();
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!this.reason && !this.flow.busy()) this.openMenu();
    }
  }

  onMenuKeydown(event: KeyboardEvent): void {
    const entries = this.entries();
    const index = entries.indexOf(this.doc.activeElement as HTMLElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        entries[(index + 1) % entries.length]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        entries[(index - 1 + entries.length) % entries.length]?.focus();
        break;
      case 'Home':
        event.preventDefault();
        entries[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        entries[entries.length - 1]?.focus();
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.closeAndFocusTrigger();
        break;
      case 'Tab':
        // The menu closes and the focus moves on naturally.
        this.open.set(false);
        break;
      default:
    }
  }

  choose(action: MenuAction): void {
    this.closeAndFocusTrigger();
    if (action.kind === 'copy') void this.flow.copyMarkdown();
    else void this.flow.export(action.format);
  }

  private openMenu(): void {
    this.open.set(true);
    // Rendered after the next change detection.
    setTimeout(() => this.entries()[0]?.focus(), 0);
  }

  private closeAndFocusTrigger(): void {
    this.open.set(false);
    this.trigger.nativeElement.focus();
  }

  private entries(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  }
}
