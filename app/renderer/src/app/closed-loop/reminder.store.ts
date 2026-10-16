import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  IPC_CHANNELS,
  quarterBanner,
  staleKrIds,
  type BannerOkr,
  type BannerState,
  type Period,
} from '@clarityokr/contracts';

import { ClosedLoopApi } from './closed-loop-api.service';
import { ClosedLoopStore } from './closed-loop.store';
import { ReviewStore } from './review.store';

/**
 * #54 in-app reminders (S1§11): the 「7 天未更新」 KRs of the open OKR and the one quarter review
 * banner. Re-read at startup and on every main-process tick (focus, resume, 5 minutes). Never a
 * system notification.
 */
@Injectable({ providedIn: 'root' })
export class ReminderStore {
  private readonly api = inject(ClosedLoopApi);
  private readonly store = inject(ClosedLoopStore);
  private readonly review = inject(ReviewStore);

  readonly now = signal<Date>(new Date());
  readonly dismissed = signal<ReadonlySet<string>>(new Set());
  /** Banners already announced in this run (`kind:period`): role=status only the first time. */
  private readonly announced = new Set<string>();
  private started = false;

  readonly staleIds = computed<ReadonlySet<string>>(() => {
    const detail = this.store.detail();
    if (!detail) return new Set();
    const krs = detail.objective.keyResults.map((kr) => ({
      id: kr.id,
      status: kr.status,
      removedAt: kr.removedAt,
      createdAt: kr.createdAt,
      lastRecordedAt: detail.progress[kr.id]?.latest?.recordedAt ?? null,
    }));
    return new Set(staleKrIds(krs, this.now()));
  });

  readonly banner = computed<BannerState>(() => {
    const detail = this.store.detail();
    const saved = this.review.review();
    const okrs: BannerOkr[] = this.store.list().map((item) => ({
      id: item.id,
      period: item.period,
      reviewed: item.reviewed || (saved !== null && saved.objectiveId === item.id),
      keyResultCount: item.keyResultCount,
    }));
    return quarterBanner({
      now: this.now(),
      viewPeriod: detail?.objective.period ?? null,
      viewOkrId: detail?.objective.id ?? null,
      okrs,
      dismissed: this.dismissed(),
    });
  });

  constructor() {
    // The open OKR, its quarter or its review changed: read the list again (silently), so the
    // banner sees the new quarter / review state at once.
    effect(() => {
      const detail = this.store.detail();
      void detail?.objective.period;
      void detail?.review;
      void this.review.review();
      if (!this.started) return;
      untracked(() => void this.store.refreshList(true));
    });
  }

  start(): void {
    // Partial test doubles of the API may lack the reminder calls: then reminders stay off.
    if (this.started || typeof this.api.getReminders !== 'function') return;
    this.started = true;
    this.api.onEvent?.(IPC_CHANNELS.REMINDERS_TICK, () => void this.refresh());
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const reply = await this.api.getReminders();
    if (reply) {
      const now = new Date(reply.now);
      if (!Number.isNaN(now.getTime())) this.now.set(now);
      this.dismissed.set(new Set(reply.dismissedQuarters));
    } else {
      this.now.set(new Date());
    }
    await this.store.refreshList(true);
  }

  /** Closes this quarter's banner (other quarters keep theirs). Holds for this run even if saving fails. */
  async dismiss(period: Period): Promise<void> {
    this.dismissed.set(new Set([...this.dismissed(), period]));
    await this.api.dismissReminder?.(period);
  }

  /** True the first time a banner is shown in this run; later showings are not re-announced. */
  claimAnnouncement(state: BannerState): boolean {
    if (state.banner === 'none') return false;
    const key = `${state.banner}:${state.period}`;
    if (this.announced.has(key)) return false;
    this.announced.add(key);
    return true;
  }
}
