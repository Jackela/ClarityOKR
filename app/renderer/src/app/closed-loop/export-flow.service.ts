import { Injectable, inject, signal } from '@angular/core';
import type { ExportFailureCategory, ExportFormat } from '@clarityokr/contracts';

import { ToastService, type ToastAction } from '../shared/components/toast.service';
import { ClosedLoopApi } from './closed-loop-api.service';
import { ClosedLoopStore } from './closed-loop.store';
import { COPY } from './copy';
import { middleEllipsis } from './path-display';

/** The button turns into a spinner only when the export takes longer than this (spec §6.3). */
export const EXPORT_SLOW_MS = 300;

/**
 * 导出 / 复制为 Markdown (spec §6.3). It talks to the main process through the closed-loop API
 * only, and turns every outcome into a toast:
 * - saved: 成功 toast with the file name, the shortened path (the full path is the tooltip and
 *   the accessible name) and 「在文件夹中显示」「复制路径」;
 * - cancelled: neutral toast, no buttons;
 * - failed: error toast with a message per category (never the raw error), 「重新选择位置」
 *   (or 「重试」 for `other`) and 「关闭」.
 * The path only ever lives in the closure of the success toast; it is never logged and the
 * main process only reveals the path of the latest export.
 */
@Injectable({ providedIn: 'root' })
export class ExportFlow {
  private readonly api = inject(ClosedLoopApi);
  private readonly store = inject(ClosedLoopStore);
  private readonly toasts = inject(ToastService);

  /** A request is running. */
  readonly busy = signal(false);
  /** The request has been running for more than 300ms: loading button + 「正在导出…」. */
  readonly slow = signal(false);
  /** Spoken (`role=status`) while `slow`. */
  readonly statusText = signal('');

  private trigger: (() => void) | null = null;
  private slowTimer: ReturnType<typeof setTimeout> | undefined;
  /** Puts 「复制路径」 back after 2s; a new click (or a new toast) restarts / drops it. */
  private copyLabelTimer: ReturnType<typeof setTimeout> | undefined;

  /** The control that started the flow takes the focus back after a toast closes / a dialog ends. */
  registerTrigger(restoreFocus: (() => void) | null): void {
    this.trigger = restoreFocus;
  }

  /** Drops the trigger only when it is still the given one (another menu may have taken over). */
  releaseTrigger(restoreFocus: () => void): void {
    if (this.trigger === restoreFocus) this.trigger = null;
  }

  /** Why the entry is unavailable, or `null` when it can be used. */
  get disabledReason(): string | null {
    if (this.store.regenerating()) return COPY.export.disabledRegenerating;
    if (!this.store.currentId()) return COPY.export.disabledNoOkr;
    return null;
  }

  async export(format: ExportFormat): Promise<void> {
    const okrId = this.store.currentId();
    if (!okrId || this.busy()) return;
    // The title as shown when the export started (the success toast names it).
    const title = this.store.detail()?.objective.title;
    this.begin();
    try {
      const reply = await this.api.exportOkr({ okrId, format });
      if (!reply.ok) {
        this.showFailure(format, 'other');
        return;
      }
      const outcome = reply.data;
      if (outcome.outcome === 'saved') {
        this.showSaved(outcome.format, outcome.fileName, outcome.path, title);
      } else if (outcome.outcome === 'cancelled') {
        this.toasts.show({
          kind: 'neutral',
          message: COPY.export.cancelled,
          onClose: () => this.focusTrigger(),
        });
        this.restoreFocus();
      } else {
        this.showFailure(format, outcome.category);
      }
    } finally {
      this.end();
    }
  }

  /** Why 「全部备份…」 is unavailable (only while regenerating; an empty history still backs up). */
  get backupDisabledReason(): string | null {
    return this.store.regenerating() ? COPY.backup.disabled : null;
  }

  /** #50 「全部备份…」 (S1§9.3): same toasts as an export, backup wording. */
  async backup(): Promise<void> {
    if (this.busy() || this.backupDisabledReason) return;
    this.begin(COPY.backup.backingUp);
    try {
      const reply = await this.api.exportBackup();
      if (!reply.ok) {
        this.showBackupFailure('other');
        return;
      }
      const outcome = reply.data;
      if (outcome.outcome === 'saved') {
        this.showSavedToast(
          `${COPY.backup.saved(outcome.count, outcome.fileName)}。${COPY.backup.noSecrets}`,
          outcome.path,
        );
      } else if (outcome.outcome === 'cancelled') {
        this.toasts.show({
          kind: 'neutral',
          message: COPY.backup.cancelled,
          onClose: () => this.focusTrigger(),
        });
        this.restoreFocus();
      } else {
        this.showBackupFailure(outcome.category);
      }
    } finally {
      this.end();
    }
  }

  private showBackupFailure(category: ExportFailureCategory): void {
    this.toasts.show({
      kind: 'error',
      message: COPY.backup.failed[category],
      closeLabel: COPY.export.close,
      onClose: () => this.focusTrigger(),
      actions: [
        {
          label: category === 'other' ? COPY.export.retry : COPY.export.pickAgain,
          testId: 'toast-retry',
          run: () => {
            this.toasts.dismiss();
            void this.backup();
          },
        },
      ],
    });
    this.restoreFocus();
  }

  async copyMarkdown(): Promise<void> {
    const okrId = this.store.currentId();
    if (!okrId || this.busy()) return;
    this.begin();
    try {
      const reply = await this.api.copyMarkdown({ okrId });
      if (reply.ok) {
        this.toasts.show({
          kind: 'success',
          message: COPY.export.copied,
          onClose: () => this.focusTrigger(),
        });
        this.restoreFocus();
      } else {
        this.toasts.show({
          kind: 'error',
          message: COPY.export.copyFailed,
          closeLabel: COPY.export.close,
          onClose: () => this.focusTrigger(),
          actions: [
            { label: COPY.export.retry, testId: 'toast-retry', run: () => this.retryCopy() },
          ],
        });
      }
    } finally {
      this.end();
    }
  }

  private retryCopy(): void {
    this.toasts.dismiss();
    void this.copyMarkdown();
  }

  private showSaved(format: ExportFormat, fileName: string, path: string, title?: string): void {
    this.showSavedToast(COPY.export.saved(format, fileName, title), path);
  }

  private showSavedToast(message: string, path: string): void {
    this.clearCopyLabelTimer();
    let id = 0;
    const setCopyLabel = (label: string): void => {
      this.toasts.update(id, { actions: actions(label) });
    };
    const actions = (copyLabel: string): ToastAction[] => [
      {
        label: COPY.export.reveal,
        testId: 'toast-reveal',
        run: () => void this.reveal(path),
      },
      {
        label: copyLabel,
        testId: 'toast-copy-path',
        run: () => void this.copyPath(path, setCopyLabel),
      },
    ];
    id = this.toasts.show({
      kind: 'success',
      message,
      detail: middleEllipsis(path),
      detailFull: path,
      onClose: () => this.focusTrigger(),
      actions: actions(COPY.export.copyPath),
    });
    // Nothing takes the focus: it goes back to the control that started the export.
    this.restoreFocus();
  }

  private showFailure(format: ExportFormat, category: ExportFailureCategory): void {
    const again = category === 'other' ? COPY.export.retry : COPY.export.pickAgain;
    this.toasts.show({
      kind: 'error',
      message: COPY.export.failed[category],
      closeLabel: COPY.export.close,
      onClose: () => this.focusTrigger(),
      actions: [
        {
          label: again,
          testId: 'toast-retry',
          run: () => {
            this.toasts.dismiss();
            void this.export(format);
          },
        },
      ],
    });
    this.restoreFocus();
  }

  private async reveal(path: string): Promise<void> {
    const reply = await this.api.reveal({ path });
    if (!reply.ok) {
      this.toasts.show({
        kind: 'error',
        message: COPY.export.revealFailed,
        closeLabel: COPY.export.close,
        onClose: () => this.focusTrigger(),
      });
    }
  }

  private async copyPath(path: string, setLabel: (label: string) => void): Promise<void> {
    const ok = await writeClipboardText(path);
    setLabel(ok ? COPY.export.pathCopied : COPY.export.pathCopyFailed);
    this.clearCopyLabelTimer();
    this.copyLabelTimer = setTimeout(() => {
      this.copyLabelTimer = undefined;
      setLabel(COPY.export.copyPath);
    }, 2000);
  }

  private clearCopyLabelTimer(): void {
    if (this.copyLabelTimer !== undefined) clearTimeout(this.copyLabelTimer);
    this.copyLabelTimer = undefined;
  }

  /** Which flow is running: the 「⋯」 button shows loading for a backup, 「导出」 for the rest. */
  readonly backingUp = signal(false);

  private begin(status: string = COPY.export.exporting): void {
    this.busy.set(true);
    this.backingUp.set(status === COPY.backup.backingUp);
    this.slow.set(false);
    this.statusText.set('');
    this.slowTimer = setTimeout(() => {
      this.slow.set(true);
      this.statusText.set(status);
    }, EXPORT_SLOW_MS);
  }

  private end(): void {
    if (this.slowTimer !== undefined) clearTimeout(this.slowTimer);
    this.slowTimer = undefined;
    this.busy.set(false);
    this.backingUp.set(false);
    this.slow.set(false);
    this.statusText.set('');
  }

  private restoreFocus(): void {
    // After the dialog / menu is gone the browser may leave the focus on <body>.
    setTimeout(() => this.focusTrigger(), 0);
  }

  private focusTrigger(): void {
    this.trigger?.();
  }
}

async function writeClipboardText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
