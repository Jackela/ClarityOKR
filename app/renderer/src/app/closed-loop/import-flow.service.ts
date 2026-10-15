import { Injectable, inject, signal } from '@angular/core';
import type { ImportProblem, ImportReply } from '@clarityokr/contracts';

import { ToastService } from '../shared/components/toast.service';
import { ClosedLoopApi } from './closed-loop-api.service';
import { ClosedLoopStore } from './closed-loop.store';
import { COPY, formatDateTime, truncateTitle } from './copy';

/** The button shows loading only when reading takes longer than this (S1§8.3 step 3). */
export const IMPORT_SLOW_MS = 300;

/** What the import dialog shows; `null` = no dialog. */
export type ImportDialog =
  | {
      kind: 'conflict';
      title: string;
      body: string;
      hint: string;
    }
  | { kind: 'confirm'; title: string; body: string; hint: string }
  | {
      kind: 'error';
      title: string;
      body: string;
      detail: string[];
      hint: string;
      /** The second button: pick another file, or re-read the same one (Q8-3). */
      action: 'reselect' | 'retry' | null;
    };

const C = COPY.import;

/**
 * 导入 (#49, spec S1§8 + v3.1). The main process opens the file dialog, reads and validates; it
 * keeps the file behind a one-time token. This flow turns every reply into a dialog or a toast
 * and gives the token back (`commit` / `retry` / `discard`) — it never sees a path.
 */
@Injectable({ providedIn: 'root' })
export class ImportFlow {
  private readonly api = inject(ClosedLoopApi);
  private readonly store = inject(ClosedLoopStore);
  private readonly toasts = inject(ToastService);

  readonly busy = signal(false);
  /** Reading has taken more than 300ms: loading button + 「正在读取文件…」. */
  readonly slow = signal(false);
  readonly statusText = signal('');
  readonly dialog = signal<ImportDialog | null>(null);
  /** A commit is running: the dialog's buttons wait (`aria-disabled`, Esc does nothing). */
  readonly committing = signal(false);
  /** Ids of the OKRs this import added: they carry 「新导入」 until the next list action. */
  readonly fresh = signal<ReadonlySet<string>>(new Set());
  /** Asks the history list to move the focus to an OKR (the toast's 「查看」). */
  readonly reveal = signal<{ okrId: string; seq: number } | null>(null);

  private token: string | null = null;
  private slowTimer: ReturnType<typeof setTimeout> | undefined;
  private revealSeq = 0;

  async start(): Promise<void> {
    if (this.busy()) return;
    // N26: a new import starts clean, without the toast of the previous one.
    this.toasts.dismiss();
    this.dropToken();
    this.dialog.set(null);
    await this.run(() => this.api.importPick(), C.reading);
  }

  /** Conflict dialog 「跳过」 / 「作为副本导入」, or the confirmation's 「导入」 (nothing to skip). */
  async commit(onConflict: 'skip' | 'copy'): Promise<void> {
    const token = this.token;
    if (!token || this.committing()) return;
    this.committing.set(true);
    this.statusText.set(C.importing);
    try {
      const reply = await this.api.importCommit({ token, onConflict });
      this.dialog.set(null);
      if (!reply.ok) {
        // The token expired or the request failed: nothing was written.
        this.token = null;
        this.showError({ kind: 'read_failed', category: 'other' });
        return;
      }
      await this.handle(reply.data);
    } finally {
      this.committing.set(false);
      this.statusText.set('');
    }
  }

  /** The dialog's second button. */
  async secondary(): Promise<void> {
    const dialog = this.dialog();
    if (dialog?.kind !== 'error') return;
    if (dialog.action === 'reselect') {
      await this.start();
    } else if (dialog.action === 'retry' && this.token) {
      const token = this.token;
      this.token = null;
      this.dialog.set(null);
      await this.run(() => this.api.importRetry({ token }), C.reading);
    }
  }

  /** 「取消」 / 「知道了」 / Esc. A conflict or confirmation cancelled is a cancel. */
  close(): void {
    const dialog = this.dialog();
    if (!dialog || this.committing()) return;
    this.dialog.set(null);
    this.dropToken();
    if (dialog.kind !== 'error') {
      this.toasts.show({ kind: 'neutral', message: C.cancelled });
    }
  }

  /** The user did something in the list: the 「新导入」 tags go away. */
  clearFresh(): void {
    if (this.fresh().size > 0) this.fresh.set(new Set());
  }

  private async run(call: () => Promise<{ ok: boolean; data?: ImportReply }>, status: string) {
    this.busy.set(true);
    this.slowTimer = setTimeout(() => {
      this.slow.set(true);
      this.statusText.set(status);
    }, IMPORT_SLOW_MS);
    try {
      const reply = await call();
      this.endSlow();
      if (!reply.ok || !reply.data) {
        this.showError({ kind: 'read_failed', category: 'other' });
        return;
      }
      await this.handle(reply.data);
    } finally {
      this.endSlow();
      this.busy.set(false);
    }
  }

  private endSlow(): void {
    clearTimeout(this.slowTimer);
    this.slow.set(false);
    if (!this.committing()) this.statusText.set('');
  }

  private async handle(reply: ImportReply): Promise<void> {
    switch (reply.outcome) {
      case 'cancelled':
        this.toasts.show({ kind: 'neutral', message: C.cancelled });
        return;
      case 'rejected':
        this.showError(reply.problem);
        return;
      case 'original_missing':
        this.token = null;
        this.openDialog({
          kind: 'error',
          title: C.readTitle,
          body: C.missingBody,
          detail: [],
          hint: C.unchanged,
          action: 'reselect',
        });
        return;
      case 'write_failed':
        this.token = reply.token;
        this.openDialog({
          kind: 'error',
          title: C.writeTitle,
          body: C.write[reply.category],
          detail: [],
          hint: `${C.rolledBack}\n${C.unchanged}`,
          action: 'retry',
        });
        return;
      case 'confirm': {
        this.token = reply.token;
        const memory = reply.memory ? `\n${C.memoryWarning}` : '';
        const conflict = reply.conflicts[0];
        if (conflict) {
          this.openDialog({
            kind: 'conflict',
            title: C.conflictTitle,
            body: C.conflictBody(conflict.title, formatDateTime(conflict.createdAt)),
            hint: `${C.conflictHint}${memory}`,
          });
        } else {
          this.openDialog({
            kind: 'confirm',
            title: C.confirmTitle(reply.items.length),
            body: C.confirmBody(reply.items[0]?.title ?? ''),
            hint: memory.trim(),
          });
        }
        return;
      }
      case 'imported':
        this.token = null;
        await this.imported(reply);
        return;
    }
  }

  private async imported(reply: Extract<ImportReply, { outcome: 'imported' }>): Promise<void> {
    if (reply.imported.length === 0) {
      const title = reply.skipped[0]?.title ?? '';
      this.toasts.show({ kind: 'neutral', message: C.skipped(truncateTitle(title)) });
      return;
    }
    const ids = reply.imported.map((item) => item.okrId);
    await this.store.refreshList();
    this.fresh.set(new Set(ids));
    const first = ids[0] as string;
    this.toasts.show({
      kind: 'success',
      message: C.imported(ids.length, reply.memory),
      actions: [
        {
          label: C.view,
          testId: 'import-view',
          run: () => this.reveal.set({ okrId: first, seq: ++this.revealSeq }),
        },
      ],
    });
  }

  private showError(problem: ImportProblem): void {
    const base = { kind: 'error' as const, detail: [] as string[], hint: C.unchanged };
    switch (problem.kind) {
      case 'too_large':
        this.openDialog({
          ...base,
          title: C.tooLargeTitle,
          body: C.tooLargeBody((problem.sizeBytes / (1024 * 1024)).toFixed(1)),
          action: 'reselect',
        });
        return;
      case 'not_json':
        this.openDialog({
          ...base,
          title: C.notJsonTitle,
          body: C.notJsonBody,
          action: 'reselect',
        });
        return;
      case 'unsupported_version':
        this.openDialog({
          ...base,
          title: C.versionTitle,
          body: C.versionBody(problem.version),
          action: null,
        });
        return;
      case 'invalid':
        this.openDialog({
          ...base,
          title: C.invalidTitle,
          body: C.invalidBody,
          detail: [
            // a plain-language reason has no field (B4)
            problem.field ? `${problem.field} ${problem.reason}` : problem.reason,
            ...(problem.more > 0 ? [C.invalidMore(problem.more)] : []),
          ],
          action: null,
        });
        return;
      case 'read_failed':
        this.openDialog({
          ...base,
          title: C.readTitle,
          body: C.read[problem.category],
          action: 'reselect',
        });
        return;
    }
  }

  /** Opening a dialog closes the toast of an earlier step: it must not linger behind it (#68). */
  private openDialog(dialog: ImportDialog): void {
    this.toasts.dismiss();
    this.dialog.set(dialog);
  }

  private dropToken(): void {
    const token = this.token;
    this.token = null;
    if (token) void this.api.importDiscard({ token });
  }
}
