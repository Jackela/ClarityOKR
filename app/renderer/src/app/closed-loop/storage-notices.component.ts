import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  Input,
  type OnDestroy,
  type OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { ClosedLoopApi } from './closed-loop-api.service';
import { ClosedLoopStore } from './closed-loop.store';
import { COPY } from './copy';
import { ExportMenuComponent } from './export-menu.component';
import { RestartFlow } from './restart-flow.service';

/**
 * The bars right under the top bar (spec §7 / §7a), top to bottom:
 * 1. memory-mode bar (both windows): persistent, cannot be closed, red with white text,
 *    「导出当前 OKR」 (the same export menu) and 「重启应用」 (the restart dialog opens in the main
 *    window; a failure adds one inline `role=alert` line under the buttons, and after a failure
 *    or a cancel the focus is on the button);
 * 2. fresh-file notice (main window): `role=status`, 「知道了」 hides it for this run only, no Esc;
 * 3. legacy-database notice (main window): only 「知道了」 (or Esc when no other popup is open)
 *    closes it, through `legacy-notice:ack`; a failed ack keeps it with an error line.
 * None of them takes the focus except the legacy notice, once, the first time it shows.
 */
@Component({
  selector: 'clarityokr-storage-notices',
  standalone: true,
  imports: [ExportMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (memory()) {
      <div class="memory" role="alert" data-testid="memory-bar">
        <div class="memory__main">
          <svg class="memory__icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <path d="M10 2 19 18H1z" fill="#ffffff" />
            <path
              d="M10 8v5"
              stroke="var(--memory-bar-bg)"
              stroke-width="2"
              stroke-linecap="round"
            />
            <circle cx="10" cy="15.5" r="1.1" fill="var(--memory-bar-bg)" />
          </svg>
          <div class="memory__text">
            <p class="memory__title">{{ t.memoryTitle }}</p>
            <p class="memory__body">{{ t.memoryBody }}</p>
          </div>
          <div class="memory__actions">
            <clarityokr-export-menu
              variant="memory"
              [label]="t.memoryExport"
              testId="memory-export"
            />
            <button
              #restartButton
              type="button"
              class="memory__restart"
              data-testid="memory-restart"
              [attr.aria-disabled]="restart.busy() ? 'true' : null"
              [attr.aria-busy]="restart.busy() ? 'true' : null"
              (click)="onRestart()"
            >
              {{ t.memoryRestart }}
            </button>
          </div>
        </div>
        @if (restart.failed()) {
          <p class="memory__error" role="alert" data-testid="relaunch-failed">
            {{ t.relaunchFailed }}
          </p>
        }
      </div>
    }

    @if (isMain && fresh() && !freshDismissed()) {
      <div
        class="notice notice--warn"
        role="status"
        aria-labelledby="fresh-notice-title"
        data-testid="fresh-notice"
      >
        <div class="notice__text">
          <p class="notice__title" id="fresh-notice-title">{{ t.freshTitle }}</p>
          <p class="notice__body">{{ t.freshBody }}<br />{{ t.freshBody2 }}</p>
        </div>
        <button
          type="button"
          class="notice__btn notice__btn--secondary"
          data-testid="fresh-ack"
          (click)="freshDismissed.set(true)"
        >
          {{ t.freshAck }}
        </button>
      </div>
    }

    @if (isMain && legacy()) {
      <div
        class="notice notice--info"
        role="region"
        aria-labelledby="legacy-notice-title"
        aria-describedby="legacy-notice-lead"
        data-testid="legacy-notice"
      >
        <svg class="notice__icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="1.6" />
          <path d="M10 9v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          <circle cx="10" cy="6.2" r="1.1" fill="currentColor" />
        </svg>
        <div class="notice__text">
          <p class="notice__title" id="legacy-notice-title">{{ t.legacyTitle }}</p>
          <p class="notice__lead" id="legacy-notice-lead">{{ t.legacyLead }}</p>
          <p class="notice__body">{{ t.legacyBody }}</p>
          @if (ackFailed()) {
            <p class="notice__error" role="alert" data-testid="legacy-ack-failed">
              <span aria-hidden="true">⚠ </span>{{ t.legacyAckFailed }}
            </p>
          }
        </div>
        <button
          #legacyAck
          type="button"
          class="notice__btn notice__btn--primary"
          data-testid="legacy-ack"
          [attr.aria-busy]="acking() ? 'true' : null"
          [attr.aria-label]="acking() ? t.legacyAckBusy : null"
          (click)="ackLegacy()"
        >
          @if (acking()) {
            <span class="notice__spinner" aria-hidden="true"></span>
          }
          <span [class.notice__btn-label--hidden]="acking()">{{ t.legacyAck }}</span>
        </button>
      </div>
    }
    <!-- Polite announcements: the legacy notice when it shows, 「已确认。」 after the ack. -->
    <span class="sr-only" aria-live="polite" data-testid="notice-live">{{ live() }}</span>
  `,
  styles: [
    `
      :host {
        display: block;
        flex: none;
      }
      p {
        margin: 0;
      }
      .memory {
        box-sizing: border-box;
        min-height: 72px;
        padding: 12px 16px;
        border-bottom: 2px solid var(--memory-bar-edge);
        background: var(--memory-bar-bg);
        color: #ffffff;
        font-size: 14px;
        line-height: 21px;
      }
      .memory__main {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        column-gap: 12px;
        row-gap: 8px;
      }
      .memory__icon {
        flex: none;
        margin-top: 1px;
      }
      .memory__text {
        flex: 1 1 0;
        min-width: 0;
      }
      .memory__title {
        font-weight: 600;
      }
      /* Narrow (< 640px, the sticky window too): the buttons go under the text, left aligned
         with it; 「重启应用」 wraps to its own line when they do not fit. */
      .memory__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        flex: 1 1 100%;
        padding-left: 32px;
      }
      @media (min-width: 640px) {
        .memory__main {
          flex-wrap: nowrap;
          align-items: center;
        }
        .memory__actions {
          flex: none;
          padding-left: 0;
        }
      }
      .memory__restart {
        min-width: 96px;
        height: 36px;
        padding: 0 16px;
        border: 1px solid #ffffff;
        border-radius: var(--radius-md);
        background: transparent;
        color: #ffffff;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .memory__restart:hover {
        background: rgba(255, 255, 255, 0.16);
      }
      .memory__restart:active {
        background: rgba(255, 255, 255, 0.28);
      }
      .memory__restart[aria-disabled='true'] {
        cursor: progress;
        opacity: 0.8;
      }
      .memory__restart:focus-visible {
        outline: 2px solid #ffffff;
        outline-offset: 2px;
      }
      .memory__error {
        margin-top: 8px;
        padding-left: 32px;
      }
      .notice {
        position: relative;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
        box-sizing: border-box;
        border-bottom: 1px solid var(--color-border);
        border-left: 4px solid transparent;
        font-size: 14px;
        line-height: 21px;
      }
      .notice__text {
        flex: 1 1 240px;
        min-width: 0;
      }
      .notice--info {
        padding: 16px 20px;
        border-left-color: var(--notice-info-bar);
        background: var(--notice-info-bg);
        color: var(--color-text-primary);
      }
      .notice--info .notice__icon {
        flex: none;
        align-self: flex-start;
        color: var(--notice-info-fg);
      }
      .notice--info .notice__title {
        color: var(--notice-info-fg);
        font-size: 16px;
        line-height: 24px;
        font-weight: 600;
      }
      .notice__lead {
        font-weight: 600;
      }
      .notice__error {
        margin-top: 4px;
        color: var(--notice-legacy-error);
        font-weight: 600;
      }
      .notice--warn {
        padding: 12px 16px;
        border-left-color: var(--notice-warn-bar);
        background: var(--notice-warn-bg);
        color: var(--notice-warn-fg);
      }
      .notice--warn .notice__title {
        font-weight: 600;
      }
      .notice__btn {
        position: relative;
        flex: none;
        min-width: 96px;
        height: 36px;
        padding: 0 16px;
        border-radius: var(--radius-md);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      /* Narrow main window (< 560px): the button goes under the text, right aligned. */
      @media (max-width: 559px) {
        .notice__btn {
          margin-left: auto;
        }
      }
      .notice__btn--primary {
        border: 0;
        background: var(--color-brand-primary);
        color: #ffffff;
      }
      /* Dark theme: the brand blue is light (#60a5fa), white text on it would be 2.5:1. */
      :host-context([data-theme='dark']) .notice__btn--primary {
        color: #111827;
      }
      .notice__btn--secondary {
        border: 1px solid currentColor;
        background: transparent;
        color: inherit;
      }
      .notice__btn:focus-visible {
        outline: 2px solid var(--color-brand-primary);
        outline-offset: 2px;
      }
      .notice__btn-label--hidden {
        visibility: hidden;
      }
      .notice__spinner {
        position: absolute;
        top: calc(50% - 6px);
        left: calc(50% - 6px);
        box-sizing: border-box;
        width: 12px;
        height: 12px;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 50%;
        animation: notice-spin 0.8s linear infinite;
      }
      @keyframes notice-spin {
        to {
          transform: rotate(360deg);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .notice__spinner {
          animation: none;
        }
      }
    `,
  ],
})
export class StorageNoticesComponent implements OnInit, OnDestroy {
  /** `main`: all three bars; `sticky`: only the memory-mode bar. */
  @Input() set window(value: 'main' | 'sticky') {
    this.isMain = value === 'main';
  }
  isMain = true;

  readonly t = COPY.storage;
  readonly store = inject(ClosedLoopStore);
  readonly restart = inject(RestartFlow);
  private readonly api = inject(ClosedLoopApi);
  private readonly doc = inject(DOCUMENT);

  readonly memory = computed(() => this.store.storageMode() === 'memory');
  readonly fresh = computed(() => this.store.storageMode() === 'fresh-file');
  /** Dismissed for this run only (no persistent flag, spec §7a.2). */
  readonly freshDismissed = signal(false);
  readonly legacy = signal(false);
  readonly acking = signal(false);
  readonly ackFailed = signal(false);
  readonly live = signal('');

  @ViewChild('legacyAck') private legacyAckButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('restartButton') private restartButton?: ElementRef<HTMLButtonElement>;

  private legacyFocused = false;
  private lastFocusRequest = 0;

  constructor() {
    // The restart was cancelled or failed: the focus comes back to 「重启应用」 (§7a.4).
    effect(() => {
      const request = this.restart.focusRequest();
      if (request === this.lastFocusRequest) return;
      this.lastFocusRequest = request;
      setTimeout(() => this.restartButton?.nativeElement.focus());
    });
  }
  private readonly onKeydown = (event: KeyboardEvent): void => this.onDocumentKeydown(event);
  private readonly onShown = (): void => {
    if (this.doc.visibilityState !== 'hidden') void this.checkLegacy();
  };

  ngOnInit(): void {
    this.restart.listen();
    void this.store.ensureStorageMode();
    if (!this.isMain) return;
    void this.checkLegacy();
    // Asked again each time the main window shows (spec §7.2): closing / hiding is no ack.
    this.doc.addEventListener('visibilitychange', this.onShown);
    this.doc.defaultView?.addEventListener('focus', this.onShown);
    this.doc.addEventListener('keydown', this.onKeydown, true);
  }

  ngOnDestroy(): void {
    this.doc.removeEventListener('visibilitychange', this.onShown);
    this.doc.defaultView?.removeEventListener('focus', this.onShown);
    this.doc.removeEventListener('keydown', this.onKeydown, true);
  }

  async onRestart(): Promise<void> {
    // A failure or a cancel puts the focus on 「重启应用」 (never on the error line).
    await this.restart.request();
  }

  async ackLegacy(): Promise<void> {
    if (this.acking()) return;
    this.acking.set(true);
    const ok = await this.api.ackLegacyNotice();
    this.acking.set(false);
    if (!ok) {
      // Removed and added again, so the alert is spoken on every failure (never two lines).
      this.ackFailed.set(false);
      setTimeout(() => this.ackFailed.set(true), 0);
      return;
    }
    this.ackFailed.set(false);
    this.legacy.set(false);
    this.live.set(this.t.legacyAcked);
    setTimeout(() => this.doc.getElementById('main-heading')?.focus(), 0);
  }

  private async checkLegacy(): Promise<void> {
    if (this.legacy()) return;
    const show = await this.api.getLegacyNotice();
    if (!show || this.legacy()) return;
    this.legacy.set(true);
    this.live.set(`${this.t.legacyTitle}。${this.t.legacyLead}`);
    if (!this.legacyFocused) {
      this.legacyFocused = true;
      setTimeout(() => this.legacyAckButton?.nativeElement.focus(), 0);
    }
  }

  /** Esc = 「知道了」 while the legacy notice shows and no menu / dialog / popup is open. */
  private onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.legacy() || event.defaultPrevented) return;
    if (this.doc.querySelector('[aria-modal="true"], [role="menu"], [role="listbox"][data-popup]'))
      return;
    event.preventDefault();
    event.stopPropagation();
    void this.ackLegacy();
  }
}
