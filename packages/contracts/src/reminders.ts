/**
 * #54 in-app reminders: pure rules (no I/O, `now` passed in). Local-time natural days.
 *
 * - A KR is stale when `now >= last update + 7×24h` (last update = latest progress entry's
 *   `recordedAt`, or the KR's `createdAt` when it was never updated). Done and removed KRs never
 *   are. The flag cannot be dismissed; it clears when the KR is updated.
 * - The quarter banner, for the OKR's own quarter P (local time; the quarter's last day ends at
 *   23:59:59 local):
 *   - `ending`: P is the current quarter and `end(P) − now < 14×24h`;
 *   - `ended`: P is the quarter just before the current one (`now > end(P)`);
 *   - and only when there is no review with a non-null `savedAt`, the banner was not dismissed
 *     for P, and P is set. Older quarters ("viewing a past quarter") never show it.
 * - No OKR → nothing.
 */
import type { Period } from './okr-model.js';

export const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
export const QUARTER_ENDING_WITHIN_MS = 14 * 24 * 60 * 60 * 1000;
/** How often the main process re-evaluates (besides startup, focus and resume). */
export const REMINDER_INTERVAL_MS = 5 * 60 * 1000;

export type QuarterBanner = 'none' | 'ending' | 'ended';

export interface ReminderKr {
  id: string;
  status: string;
  removedAt: string | null;
  createdAt: string;
  /** `recordedAt` of the KR's latest progress entry; null when it has none. */
  lastRecordedAt: string | null;
}

/** Local quarter of a date, e.g. `2026-Q4`. */
export function quarterOf(date: Date): Period {
  return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}` as Period;
}

function parse(period: Period): { year: number; quarter: number } {
  const [y, q] = period.split('-Q');
  return { year: Number(y), quarter: Number(q) };
}

/** Last instant of the quarter in local time: its last day at 23:59:59.999. */
export function quarterEnd(period: Period): Date {
  const { year, quarter } = parse(period);
  // day 0 of the month after the quarter = the quarter's last day (handles 28/29/30/31)
  return new Date(year, quarter * 3, 0, 23, 59, 59, 999);
}

/** The quarter before `period` (2027-Q1 → 2026-Q4). */
export function previousQuarter(period: Period): Period {
  const { year, quarter } = parse(period);
  return (quarter === 1 ? `${year - 1}-Q4` : `${year}-Q${quarter - 1}`) as Period;
}

export function isKrStale(kr: ReminderKr, now: Date): boolean {
  if (kr.status === 'done' || kr.removedAt !== null) return false;
  const since = Date.parse(kr.lastRecordedAt ?? kr.createdAt);
  if (Number.isNaN(since)) return false;
  return now.getTime() >= since + STALE_AFTER_MS;
}

/** One OKR as the banner sees it (from the OKR list). */
export interface BannerOkr {
  id: string;
  period: Period | null;
  /** A review with a non-null `savedAt` exists. */
  reviewed: boolean;
  /** Non-removed key results; an OKR without any never asks for a review. */
  keyResultCount: number;
}

export interface BannerInput {
  now: Date;
  /** Quarter of the OKR being viewed (null: none set / nothing open). */
  viewPeriod: Period | null;
  okrs: ReadonlyArray<BannerOkr>;
  /** Quarters whose banner the user closed (each quarter separately). */
  dismissed: ReadonlySet<string> | ReadonlyArray<string>;
  /** Prefer this OKR as the 「去复盘」 target when it qualifies. */
  viewOkrId?: string | null;
}

export interface BannerState {
  banner: QuarterBanner;
  /** The quarter the banner is about. */
  period: Period | null;
  /** The unreviewed OKR 「去复盘」 opens. */
  targetOkrId: string | null;
}

const NO_BANNER: BannerState = { banner: 'none', period: null, targetOkrId: null };

function unreviewedIn(input: BannerInput, period: Period): string | null {
  const candidates = input.okrs.filter(
    (okr) => okr.period === period && !okr.reviewed && okr.keyResultCount > 0,
  );
  if (candidates.length === 0) return null;
  return (candidates.find((okr) => okr.id === input.viewOkrId) ?? candidates[0]).id;
}

/**
 * S1§11.3 + N52/N53. Let C be the current local quarter and P the one before it.
 * - 即将结束 (ending): only in the C view, under 14 days before C ends, C has an unreviewed OKR.
 * - 已经结束 (ended): in the C view and in the P view (the only exception to "no banner in past
 *   quarters"), P has an unreviewed OKR. Older quarter views never show a banner.
 * - One banner at most: C's ending wins over P's ended. Dismissal is per quarter, so closing
 *   P's ended banner never hides C's ending one.
 */
export function quarterBanner(input: BannerInput): BannerState {
  const { now, viewPeriod } = input;
  const current = quarterOf(now);
  const previous = previousQuarter(current);
  if (viewPeriod !== current && viewPeriod !== previous) return NO_BANNER;
  const dismissed = new Set(input.dismissed);
  if (
    viewPeriod === current &&
    !dismissed.has(current) &&
    quarterEnd(current).getTime() - now.getTime() < QUARTER_ENDING_WITHIN_MS
  ) {
    const target = unreviewedIn(input, current);
    if (target !== null) return { banner: 'ending', period: current, targetOkrId: target };
  }
  if (!dismissed.has(previous)) {
    const target = unreviewedIn(input, previous);
    if (target !== null) return { banner: 'ended', period: previous, targetOkrId: target };
  }
  return NO_BANNER;
}

/** KR ids of the viewed OKR showing 「7 天未更新」. */
export function staleKrIds(keyResults: ReadonlyArray<ReminderKr>, now: Date): string[] {
  return keyResults.filter((kr) => isKrStale(kr, now)).map((kr) => kr.id);
}
