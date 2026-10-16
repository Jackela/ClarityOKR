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

export interface ReminderInput {
  now: Date;
  period: Period | null;
  keyResults: ReadonlyArray<ReminderKr>;
  /** `savedAt` of the OKR's review, or null when there is none / it was never saved. */
  reviewSavedAt: string | null;
  /** Quarters whose banner the user closed. */
  dismissed: ReadonlySet<string> | ReadonlyArray<string>;
}

export interface ReminderState {
  staleKrIds: string[];
  banner: QuarterBanner;
  /** The quarter the banner is about (the OKR's), or null. */
  period: Period | null;
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

export function quarterBanner(input: Omit<ReminderInput, 'keyResults'>): QuarterBanner {
  const { now, period, reviewSavedAt } = input;
  if (period === null || reviewSavedAt !== null) return 'none';
  const dismissed = new Set(input.dismissed);
  if (dismissed.has(period)) return 'none';
  const current = quarterOf(now);
  if (period === current) {
    return quarterEnd(period).getTime() - now.getTime() < QUARTER_ENDING_WITHIN_MS
      ? 'ending'
      : 'none';
  }
  return period === previousQuarter(current) ? 'ended' : 'none';
}

export function evaluateReminders(input: ReminderInput): ReminderState {
  if (input.keyResults.length === 0) return { staleKrIds: [], banner: 'none', period: null };
  const banner = quarterBanner(input);
  return {
    staleKrIds: input.keyResults.filter((kr) => isKrStale(kr, input.now)).map((kr) => kr.id),
    banner,
    period: banner === 'none' ? null : input.period,
  };
}
