import { Injectable, type OnDestroy, inject, signal } from '@angular/core';
import type {
  ClosedLoopError,
  KrIdRequest,
  OkrDetail,
  OkrListItem,
  Period,
  StorageModeName,
  ProgressChangeReply,
  ReplaceProgressRequest,
  SetProgressRequest,
} from '@clarityokr/contracts';

import { Logger } from '../core/services/logger.service';
import { OkrStickyService } from '../okr-sticky/services/okr-sticky.service';
import { ClosedLoopApi } from './closed-loop-api.service';

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';
export type PinNotice = 'none' | 'pinning' | 'pinned' | 'failed';

export type WriteResult<T> = { ok: true; data: T } | { ok: false; error: ClosedLoopError };

const PIN_NOTICE_MS = 6000;

interface WriteToken {
  id: string | null;
  epoch: number;
  kind: string;
  seq: number;
}

/** Errors that mean "what you saw is out of date": reload instead of retrying. */
export const STALE_CODES: ReadonlySet<string> = new Set([
  'NOT_FOUND',
  'KEY_RESULT_REMOVED',
  'NOTHING_TO_REVERT',
  'LATEST_IS_REVERT',
]);

/**
 * Renderer state for the closed-loop views: the OKR that is currently open (a full
 * {@link OkrDetail}), the history list and the pin hint. All persistence goes through
 * {@link ClosedLoopApi}; this store only mirrors what the main process replied.
 */
@Injectable({ providedIn: 'root' })
export class ClosedLoopStore implements OnDestroy {
  readonly currentId = signal<string | null>(null);
  readonly detail = signal<OkrDetail | null>(null);
  readonly detailState = signal<LoadState>('idle');
  /** The open OKR was picked in the history (so "not the pinned note" may apply). */
  readonly openedFromHistory = signal(false);
  readonly pinNotice = signal<PinNotice>('none');
  /** A regeneration / text save is running: other OKRs cannot be opened meanwhile. */
  readonly operationBusy = signal(false);

  /**
   * Where this run keeps its data (asked once). Only the wording of "saved" messages depends
   * on it (spec §7a.3); until the answer is in, nothing says "仅本次运行".
   */
  readonly storageMode = signal<StorageModeName>('normal');

  private storageModeAsked = false;

  readonly list = signal<OkrListItem[]>([]);
  readonly listState = signal<LoadState>('idle');
  readonly openError = signal(false);

  /**
   * Which "visit" of an OKR is open. It grows every time the open OKR changes, so A → B → A
   * is a different visit than the first A and a reply addressed to the first one is dropped
   * even though the id matches again (review: stale responses).
   */
  private epoch = 0;
  /** Read requests (open / reload): only the latest one may apply. */
  private readSeq = 0;
  /** Latest sequence number per kind of OKR-targeted write ("pin", "period", "progress:kr"). */
  private readonly writeSeqs = new Map<string, number>();

  private pinTimer: ReturnType<typeof setTimeout> | undefined;
  private lastDocumentId: string | null = null;
  private skipNextDocumentSync = false;

  private readonly api = inject(ClosedLoopApi);
  private readonly sticky = inject(OkrStickyService);
  private readonly logger = inject(Logger);

  constructor() {
    // Another window may have changed progress while this one was in the background.
    if (typeof window !== 'undefined') window.addEventListener('focus', this.onWindowFocus);
  }

  /** Asks the main process once where this run keeps its data. */
  async ensureStorageMode(): Promise<void> {
    if (this.storageModeAsked) return;
    this.storageModeAsked = true;
    this.storageMode.set(await this.api.getStorageMode());
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') window.removeEventListener('focus', this.onWindowFocus);
    this.clearPinTimer();
  }

  private readonly onWindowFocus = (): void => {
    if (this.currentId() && this.detailState() === 'ready') void this.reload(true);
  };

  /**
   * Called when the document of the sticky service changes (startup hydrate, generation,
   * text edit, regeneration). A document with a new id becomes the open OKR.
   */
  syncDocument(documentId: string | null): void {
    if (this.skipNextDocumentSync) {
      this.skipNextDocumentSync = false;
      this.lastDocumentId = documentId;
      return;
    }
    if (documentId === null) {
      this.lastDocumentId = null;
      return;
    }
    const isNewDocument = documentId !== this.lastDocumentId;
    this.lastDocumentId = documentId;
    if (isNewDocument || documentId !== this.currentId()) {
      this.epoch += 1;
      this.currentId.set(documentId);
      this.openedFromHistory.set(false);
      this.pinNotice.set('none');
    }
    void this.reload(this.detail()?.objective.id === documentId);
  }

  /** Re-reads the open OKR. `silent` keeps showing the current content while it loads. */
  async reload(silent = false): Promise<void> {
    const id = this.currentId();
    if (!id) return;
    if (!silent || this.detail() === null) this.detailState.set('loading');
    const seq = ++this.readSeq;
    const result = await this.api.open({ okrId: id });
    // A newer read (or another OKR) superseded this one: only the latest may apply.
    if (seq !== this.readSeq || this.currentId() !== id) return;
    if (result.ok) {
      this.detail.set(result.data);
      this.detailState.set('ready');
    } else {
      this.logger.warn('[closed-loop] reading the OKR failed', result.error.code);
      if (!silent || this.detail() === null) this.detailState.set('error');
    }
  }

  async refreshList(): Promise<void> {
    this.listState.set('loading');
    const result = await this.api.list();
    if (result.ok) {
      this.list.set(result.data.items);
      this.listState.set('ready');
    } else {
      this.listState.set('error');
    }
  }

  /** Opens an OKR from the history; it becomes the one edit / regenerate act on. */
  async openFromHistory(okrId: string): Promise<boolean> {
    this.openError.set(false);
    const seq = ++this.readSeq;
    const result = await this.api.open({ okrId });
    // Superseded by a newer open / reload: nothing to show or report for this one.
    if (seq !== this.readSeq) return false;
    if (!result.ok) {
      this.openError.set(true);
      return false;
    }
    // Hand the OKR to the sticky service first: it projects it. If that throws, nothing of
    // the store has been touched yet (no half-opened OKR).
    try {
      this.sticky.openFromDetail(result.data);
    } catch {
      this.logger.warn('[closed-loop] the OKR could not be shown');
      this.openError.set(true);
      return false;
    }
    this.skipNextDocumentSync = true;
    this.epoch += 1;
    this.detail.set(result.data);
    this.detailState.set('ready');
    this.currentId.set(okrId);
    this.openedFromHistory.set(true);
    this.pinNotice.set('none');
    return true;
  }

  async pin(): Promise<boolean> {
    const id = this.currentId();
    if (!id) return false;
    this.clearPinTimer();
    this.pinNotice.set('pinning');
    const token = this.begin('pin');
    const result = await this.api.pin({ okrId: id });
    // The user may have opened another OKR meanwhile: that one's state is not ours to touch.
    if (!this.accepts(token)) {
      this.dropped(token);
      return result.ok;
    }
    if (!result.ok) {
      this.pinNotice.set('failed');
      return false;
    }
    this.patchDetail(id, (detail) => ({
      ...detail,
      objective: { ...detail.objective, pinned: true },
    }));
    this.pinNotice.set('pinned');
    this.pinTimer = setTimeout(() => {
      this.pinNotice.set('none');
      this.openedFromHistory.set(false);
    }, PIN_NOTICE_MS);
    return true;
  }

  async setPeriod(period: Period | null): Promise<WriteResult<void>> {
    const id = this.currentId();
    if (!id) return { ok: false, error: { code: 'NOT_FOUND', message: 'No open OKR' } };
    const token = this.begin('period');
    const result = await this.api.setPeriod({ okrId: id, period });
    if (!this.accepts(token)) {
      this.dropped(token);
      return result.ok ? { ok: true, data: undefined } : result;
    }
    if (!result.ok) return result;
    this.patchDetail(id, (detail) => ({
      ...detail,
      objective: {
        ...detail.objective,
        period: result.data.period,
        updatedAt: result.data.updatedAt,
      },
    }));
    return { ok: true, data: undefined };
  }

  async setProgress(request: SetProgressRequest): Promise<WriteResult<ProgressChangeReply>> {
    const token = this.begin(`progress:${request.krId}`);
    return this.afterProgressWrite(token, await this.api.setProgress(request));
  }

  async revertProgress(request: KrIdRequest): Promise<WriteResult<ProgressChangeReply>> {
    const token = this.begin(`progress:${request.krId}`);
    return this.afterProgressWrite(token, await this.api.revertProgress(request));
  }

  async replaceProgress(
    request: ReplaceProgressRequest,
  ): Promise<WriteResult<ProgressChangeReply>> {
    const token = this.begin(`progress:${request.krId}`);
    return this.afterProgressWrite(token, await this.api.replaceProgress(request));
  }

  /**
   * The token says which visit of which OKR the request left from; a reply for a visit that
   * is over (or one that a newer write of the same kind superseded) is dropped.
   */
  private async afterProgressWrite(
    token: WriteToken,
    result: WriteResult<ProgressChangeReply>,
  ): Promise<WriteResult<ProgressChangeReply>> {
    if (!this.accepts(token)) {
      this.dropped(token);
      return result;
    }
    const id = token.id as string;
    if (result.ok) {
      const reply = result.data;
      this.patchDetail(id, (detail) => ({
        ...detail,
        objective: {
          ...detail.objective,
          overallProgress: reply.overallProgress,
          keyResults: detail.objective.keyResults.map((kr) =>
            kr.id === reply.keyResult.id ? reply.keyResult : kr,
          ),
        },
        progress: { ...detail.progress, [reply.keyResult.id]: reply.progress },
      }));
    } else if (STALE_CODES.has(result.error.code)) {
      // The key result changed elsewhere (regenerated, reverted in the other window...):
      // show the real state instead of offering a retry that can never succeed.
      void this.reload(true);
    }
    return result;
  }

  /** Starts an OKR-targeted write: remembers the visit and the sequence number of its kind. */
  private begin(kind: string): WriteToken {
    const seq = (this.writeSeqs.get(kind) ?? 0) + 1;
    this.writeSeqs.set(kind, seq);
    return { id: this.currentId(), epoch: this.epoch, kind, seq };
  }

  private accepts(token: WriteToken): boolean {
    return (
      token.id !== null &&
      this.currentId() === token.id &&
      token.epoch === this.epoch &&
      this.writeSeqs.get(token.kind) === token.seq
    );
  }

  /**
   * A reply was not applied. If the same OKR is open again (A → B → A) the write may have
   * landed after the fresh read of the new visit, so read once more instead of guessing.
   */
  private dropped(token: WriteToken): void {
    if (token.id !== null && this.currentId() === token.id && token.epoch !== this.epoch) {
      void this.reload(true);
    }
  }

  /** Applies `update` only while `okrId` is still the open OKR. */
  private patchDetail(okrId: string, update: (detail: OkrDetail) => OkrDetail): void {
    const current = this.detail();
    if (current && current.objective.id === okrId && this.currentId() === okrId) {
      this.detail.set(update(current));
    }
  }

  private clearPinTimer(): void {
    if (this.pinTimer !== undefined) clearTimeout(this.pinTimer);
    this.pinTimer = undefined;
  }
}
