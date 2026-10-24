import { Injectable, computed, inject, signal } from '@angular/core';
import { TEXT_LIMITS, type ReviewRecord } from '@clarityokr/contracts';

import { ClosedLoopApi } from './closed-loop-api.service';
import { evaluateText } from './text-limit';

export type ReviewKey = 'wentWell' | 'fellShort' | 'nextSteps';
export const REVIEW_KEYS: readonly ReviewKey[] = ['wentWell', 'fellShort', 'nextSteps'];

export type ReviewLoad = 'idle' | 'loading' | 'ready' | 'error';
export type ReviewSaveFailure = 'none' | 'failed' | 'over_limit';

export type ReviewDraft = Record<ReviewKey, string>;

const EMPTY: ReviewDraft = { wentWell: '', fellShort: '', nextSteps: '' };

/**
 * State of the review tab for the OKR that is open: the saved review, the text being typed
 * and the save request. The draft belongs to one OKR; `load` for another one drops it.
 */
@Injectable({ providedIn: 'root' })
export class ReviewStore {
  readonly loadState = signal<ReviewLoad>('idle');
  readonly review = signal<ReviewRecord | null>(null);
  readonly draft = signal<ReviewDraft>({ ...EMPTY });
  readonly saving = signal(false);
  readonly saveFailure = signal<ReviewSaveFailure>('none');

  /** What the text areas were last loaded / saved with. */
  private readonly baseline = computed<ReviewDraft>(() => {
    const review = this.review();
    return review
      ? { wentWell: review.wentWell, fellShort: review.fellShort, nextSteps: review.nextSteps }
      : { ...EMPTY };
  });

  /** The user changed something that is not saved yet. */
  readonly dirty = computed(() => {
    const draft = this.draft();
    const base = this.baseline();
    return REVIEW_KEYS.some((key) => draft[key] !== base[key]);
  });

  readonly allEmpty = computed(() => {
    const draft = this.draft();
    return REVIEW_KEYS.every((key) => draft[key].trim().length === 0);
  });

  readonly overLimit = computed(() => {
    const draft = this.draft();
    return REVIEW_KEYS.some((key) => evaluateText(draft[key], TEXT_LIMITS.reviewSection).invalid);
  });

  /** Why saving is not possible right now, or null. */
  readonly blockedReason = computed<'none' | 'empty' | 'over_limit' | null>(() => {
    if (!this.dirty()) return 'none';
    if (this.overLimit()) return 'over_limit';
    if (this.allEmpty()) return 'empty';
    return null;
  });

  readonly canSave = computed(() => this.blockedReason() === null && !this.saving());

  private readonly api = inject(ClosedLoopApi);
  private okrId: string | null = null;
  /** Latest read / save wins: a slow reply for an earlier request is ignored. */
  private seq = 0;

  /** Reads the review of `okrId`. A different OKR than before drops the draft. */
  async load(okrId: string | null): Promise<void> {
    const seq = ++this.seq;
    this.okrId = okrId;
    this.saveFailure.set('none');
    this.saving.set(false);
    this.review.set(null);
    this.draft.set({ ...EMPTY });
    if (okrId === null) {
      this.loadState.set('idle');
      return;
    }
    this.loadState.set('loading');
    const result = await this.api.getReview({ okrId });
    if (seq !== this.seq) return;
    if (!result.ok) {
      this.loadState.set('error');
      return;
    }
    this.review.set(result.data.review);
    this.draft.set({ ...this.baseline() });
    this.loadState.set('ready');
  }

  setSection(key: ReviewKey, text: string): void {
    if (this.saving()) return;
    this.draft.update((draft) => ({ ...draft, [key]: text }));
    if (this.saveFailure() !== 'none') this.saveFailure.set('none');
  }

  /**
   * Throws the typed text away (the user confirmed leaving). This only resets local state: it
   * cannot undo a save the main process already wrote. Callers must not offer 「放弃修改」 while a
   * save is in flight (the leave dialog keeps its confirm button `aria-disabled` then).
   */
  discard(): void {
    // A reply still in flight is not adopted into the (reset) draft; the main process may still
    // have written it, which is why discarding during a save is not offered at all.
    this.seq++;
    this.saving.set(false);
    this.draft.set({ ...this.baseline() });
    this.saveFailure.set('none');
  }

  /** Saves the draft. Resolves with the saved record, or null when nothing was saved. */
  async save(): Promise<ReviewRecord | null> {
    const okrId = this.okrId;
    if (okrId === null || !this.canSave()) return null;
    const seq = ++this.seq;
    this.saving.set(true);
    this.saveFailure.set('none');
    const draft = this.draft();
    const result = await this.api.saveReview({ okrId, ...draft });
    if (seq !== this.seq || okrId !== this.okrId) return null;
    this.saving.set(false);
    if (!result.ok || !result.data.review) {
      const reason = !result.ok ? result.error.reason : undefined;
      this.saveFailure.set(
        !result.ok &&
          result.error.code === 'INVALID_REQUEST' &&
          (reason === 'too_long' || reason === 'cluster_too_long')
          ? 'over_limit'
          : 'failed',
      );
      return null;
    }
    this.review.set(result.data.review);
    return result.data.review;
  }
}
