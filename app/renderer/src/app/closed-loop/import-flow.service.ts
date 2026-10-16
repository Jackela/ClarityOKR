import { Injectable, computed, inject, signal } from '@angular/core';
import { IMPORT_ISSUE_UI, issueLines } from '@clarityokr/contracts';
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
  /** #50 backup preview (S1§9.4 step 3); per-row answers live in `choices`. */
  | {
      kind: 'backup';
      title: string;
      body: string;
      hint: string;
      /** OKRs in the file. */
      count: number;
      rows: BackupRow[];
    }
  | {
      kind: 'error';
      title: string;
      body: string;
      detail: string[];
      hint: string;
      /** The second button: pick another file, or re-read the same one (Q8-3). */
      action: 'reselect' | 'retry' | null;
    };

export interface BackupRow {
  /** Index in the file (the key of `choices`). */
  index: number;
  title: string;
  createdAt: string;
  /** Q9-5: the same OKR appears earlier in the file. */
  inFile: boolean;
}

export type ConflictChoice = 'skip' | 'copy';

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

  /** Backup preview: the answer per duplicate row (Q9-2: 「跳过」 by default). */
  readonly choices = signal<Readonly<Record<number, ConflictChoice>>>({});
  /** 「将导入 a 个，跳过 s 个。」 for the backup preview. */
  readonly backupCounts = computed(() => {
    const dialog = this.dialog();
    if (dialog?.kind !== 'backup') return { imported: 0, skipped: 0 };
    const skipped = Object.values(this.choices()).filter((c) => c === 'skip').length;
    return { imported: dialog.count - skipped, skipped };
  });

  private token: string | null = null;
  private isBackup = false;
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
  async commit(
    onConflict: ConflictChoice,
    choices?: Record<string, ConflictChoice>,
  ): Promise<void> {
    const token = this.token;
    if (!token || this.committing()) return;
    this.committing.set(true);
    this.statusText.set(C.importing);
    try {
      const reply = await this.api.importCommit(
        choices ? { token, onConflict, choices } : { token, onConflict },
      );
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

  /** Backup preview: one row's answer. */
  choose(index: number, choice: ConflictChoice): void {
    this.choices.update((all) => ({ ...all, [index]: choice }));
  }

  /** Backup preview: 「全部跳过」 / 「全部作为副本」. */
  chooseAll(choice: ConflictChoice): void {
    this.choices.update((all) => Object.fromEntries(Object.keys(all).map((key) => [key, choice])));
  }

  /** Backup preview 「开始导入」 / 「导入 n 个」. */
  async commitBackup(): Promise<void> {
    if (this.backupCounts().imported === 0) return;
    const choices = Object.fromEntries(
      Object.entries(this.choices()).map(([key, value]) => [key, value]),
    );
    await this.commit('skip', choices);
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
        this.isBackup = reply.backup !== undefined;
        if (reply.backup) {
          const n = reply.items.length;
          const d = reply.conflicts.length;
          this.choices.set(Object.fromEntries(reply.conflicts.map((c) => [c.index, 'skip'])));
          this.openDialog({
            kind: 'backup',
            title: C.backupTitle,
            body: C.backupBody(n, formatDateTime(reply.backup.exportedAt), reply.backup.appVersion),
            hint: `${d === 0 ? C.backupAllNew(n) : C.backupDuplicates(d)}${memory}`,
            count: n,
            rows: reply.conflicts.map((c) => ({
              index: c.index,
              title: c.title,
              createdAt: formatDateTime(c.createdAt),
              inFile: c.source === 'in_file',
            })),
          });
          return;
        }
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
    if (reply.imported.length === 0 && this.isBackup) {
      this.isBackup = false;
      this.toasts.show({
        kind: 'neutral',
        message: C.backupImported(0, reply.skipped.length, false),
      });
      return;
    }
    if (reply.imported.length === 0) {
      const title = reply.skipped[0]?.title ?? '';
      this.toasts.show({ kind: 'neutral', message: C.skipped(truncateTitle(title)) });
      return;
    }
    const ids = reply.imported.map((item) => item.okrId);
    await this.store.refreshList();
    this.fresh.set(new Set(ids));
    const first = ids[0] as string;
    if (this.isBackup) {
      // S1§9.4 step 4: the summary, and the focus goes to the first new OKR right away.
      this.isBackup = false;
      this.toasts.show({
        kind: 'success',
        message: C.backupImported(ids.length, reply.skipped.length, reply.memory),
      });
      this.reveal.set({ okrId: first, seq: ++this.revealSeq });
      return;
    }
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
          body: problem.backup
            ? C.tooLargeBackupBody(
                Math.round(problem.limitBytes / (1024 * 1024)),
                (problem.sizeBytes / (1024 * 1024)).toFixed(1),
              )
            : C.tooLargeBody((problem.sizeBytes / (1024 * 1024)).toFixed(1)),
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
      case 'empty_backup':
        this.openDialog({
          ...base,
          hint: '',
          title: C.emptyBackupTitle,
          body: C.emptyBackupBody,
          action: null,
        });
        return;
      case 'invalid':
        this.openDialog({
          ...base,
          title: C.invalidTitle,
          // #69: the first sentence is plain language (read first, N49)
          body:
            problem.okrIndex === undefined
              ? IMPORT_ISSUE_UI.singleBody
              : C.backupInvalidBody(problem.okrIndex + 1),
          // #69: located plain sentences, at most 5 lines, the rest as 「另有 n 处」
          detail: problem.issues
            ? issueLines(problem.issues, problem.total ?? problem.issues.length)
            : [
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
    this.isBackup = false;
    const token = this.token;
    this.token = null;
    if (token) void this.api.importDiscard({ token });
  }
}
