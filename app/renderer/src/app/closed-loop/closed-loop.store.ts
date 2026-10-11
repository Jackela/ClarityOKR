import { Injectable, type OnDestroy, inject, signal } from '@angular/core';
import type {
  ClosedLoopError,
  KrIdRequest,
  OkrDetail,
  OkrListItem,
  Period,
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

  readonly list = signal<OkrListItem[]>([]);
  readonly listState = signal<LoadState>('idle');
  readonly openError = signal(false);

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
    const result = await this.api.open({ okrId: id });
    if (this.currentId() !== id) return;
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
    const result = await this.api.open({ okrId });
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
    const result = await this.api.pin({ okrId: id });
    // The user may have opened another OKR meanwhile: that one's state is not ours to touch.
    if (this.currentId() !== id) return result.ok;
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
    const result = await this.api.setPeriod({ okrId: id, period });
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
    const id = this.currentId();
    return this.afterProgressWrite(id, await this.api.setProgress(request));
  }

  async revertProgress(request: KrIdRequest): Promise<WriteResult<ProgressChangeReply>> {
    const id = this.currentId();
    return this.afterProgressWrite(id, await this.api.revertProgress(request));
  }

  async replaceProgress(
    request: ReplaceProgressRequest,
  ): Promise<WriteResult<ProgressChangeReply>> {
    const id = this.currentId();
    return this.afterProgressWrite(id, await this.api.replaceProgress(request));
  }

  /** `id` is the OKR that was open when the request left; a reply for another OKR is dropped. */
  private async afterProgressWrite(
    id: string | null,
    result: WriteResult<ProgressChangeReply>,
  ): Promise<WriteResult<ProgressChangeReply>> {
    if (id === null || this.currentId() !== id) return result;
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
