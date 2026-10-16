// Local natural days. Expectations are built from local wall-clock times so they hold in any
// zone (CI runs in UTC; the box runs in Asia/Shanghai, where the UTC and local days differ).

import {
  QUARTER_ENDING_WITHIN_MS,
  STALE_AFTER_MS,
  staleKrIds,
  type BannerOkr,
  isKrStale,
  previousQuarter,
  quarterBanner,
  quarterEnd,
  quarterOf,
  type ReminderKr,
} from '@clarityokr/contracts';

/** A local wall-clock time (month is 1-based). */
const local = (y: number, m: number, d: number, h = 0, min = 0, s = 0, ms = 0) =>
  new Date(y, m - 1, d, h, min, s, ms);

const kr = (over: Partial<ReminderKr> = {}): ReminderKr => ({
  id: 'k1',
  status: 'in_progress',
  removedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  lastRecordedAt: null,
  ...over,
});

describe('#54 reminders: KR 7 days', () => {
  const at = '2026-10-01T02:00:00.000Z';
  it('exactly 7×24h after the last update is stale; 1 ms before is not', () => {
    const k = kr({ lastRecordedAt: at });
    expect(isKrStale(k, new Date(Date.parse(at) + STALE_AFTER_MS - 1))).toBe(false);
    expect(isKrStale(k, new Date(Date.parse(at) + STALE_AFTER_MS))).toBe(true);
  });
  it('a never-updated KR counts from createdAt', () => {
    const k = kr({ createdAt: at });
    expect(isKrStale(k, new Date(Date.parse(at) + STALE_AFTER_MS))).toBe(true);
  });
  it('an update clears it (latest entry is newer)', () => {
    const now = new Date(Date.parse(at) + STALE_AFTER_MS + 1000);
    expect(isKrStale(kr({ createdAt: at, lastRecordedAt: now.toISOString() }), now)).toBe(false);
  });
  it('done and removed KRs never are', () => {
    const now = new Date('2027-01-01T00:00:00Z');
    expect(isKrStale(kr({ status: 'done' }), now)).toBe(false);
    expect(isKrStale(kr({ removedAt: '2026-10-02T00:00:00Z' }), now)).toBe(false);
  });
});

describe('#54 reminders: quarters in local time', () => {
  it('quarterOf uses the local date across a UTC day rollover', () => {
    // Local 10-01 00:30 is Q4 even where that instant is still 09-30 in UTC (e.g. UTC+8).
    expect(quarterOf(local(2026, 10, 1, 0, 30))).toBe('2026-Q4');
    expect(quarterOf(local(2026, 9, 30, 23, 59, 59, 999))).toBe('2026-Q3');
  });
  it('year rollover: local 2027-01-01 00:30 is 2027-Q1; previous of 2027-Q1 is 2026-Q4', () => {
    expect(quarterOf(local(2027, 1, 1, 0, 30))).toBe('2027-Q1');
    expect(quarterOf(local(2026, 12, 31, 23, 59))).toBe('2026-Q4');
    expect(previousQuarter('2027-Q1')).toBe('2026-Q4');
  });
  it('the last day ends at 23:59:59 local', () => {
    expect(quarterEnd('2026-Q4')).toEqual(local(2026, 12, 31, 23, 59, 59, 999));
    expect(quarterEnd('2026-Q3')).toEqual(local(2026, 9, 30, 23, 59, 59, 999));
  });
  it('leap-year February: Q1 of 2028 ends 03-31; 14 days before counts 29 Feb', () => {
    expect(quarterEnd('2028-Q1')).toEqual(local(2028, 3, 31, 23, 59, 59, 999));
    const start = new Date(quarterEnd('2028-Q1').getTime() - QUARTER_ENDING_WITHIN_MS);
    // 14×24h before 03-31 23:59:59.999 is 03-17 23:59:59.999
    expect(start).toEqual(local(2028, 3, 17, 23, 59, 59, 999));
    expect(quarterOf(local(2028, 2, 29, 12))).toBe('2028-Q1');
  });
});

describe('#54 reminders: banner (S1§11.3, N52, N53)', () => {
  const okr = (period: string | null, over: Partial<BannerOkr> = {}): BannerOkr => ({
    id: `o-${period}`,
    period: period as BannerOkr['period'],
    reviewed: false,
    keyResultCount: 2,
    ...over,
  });
  const at = (now: Date, viewPeriod: string | null, okrs: BannerOkr[], dismissed: string[] = []) =>
    quarterBanner({ now, viewPeriod: viewPeriod as BannerOkr['period'], okrs, dismissed });

  it('ending: only in the current view, under 14 days before the local end', () => {
    const end = quarterEnd('2026-Q4').getTime();
    const okrs = [okr('2026-Q4')];
    expect(at(new Date(end - QUARTER_ENDING_WITHIN_MS), '2026-Q4', okrs).banner).toBe('none');
    expect(at(new Date(end - QUARTER_ENDING_WITHIN_MS + 1), '2026-Q4', okrs)).toEqual({
      banner: 'ending',
      period: '2026-Q4',
      targetOkrId: 'o-2026-Q4',
    });
  });
  it('N51(1) Q+1, Q unreviewed → ended, in the Q+1 view and in the Q view', () => {
    const now = local(2027, 1, 1);
    const okrs = [okr('2026-Q4'), okr('2027-Q1')];
    expect(at(now, '2027-Q1', okrs)).toEqual({
      banner: 'ended',
      period: '2026-Q4',
      targetOkrId: 'o-2026-Q4',
    });
    expect(at(now, '2026-Q4', okrs).banner).toBe('ended');
  });
  it('N51(2) Q+2: Q no longer, nor any older quarter, in any view', () => {
    const now = local(2027, 4, 1);
    const okrs = [okr('2026-Q3'), okr('2026-Q4'), okr('2027-Q2')];
    for (const view of ['2027-Q2', '2027-Q1', '2026-Q4', '2026-Q3']) {
      expect(at(now, view, okrs).banner).toBe('none');
    }
  });
  it('no banner in an older or unset view', () => {
    const now = local(2027, 1, 1);
    expect(at(now, '2026-Q3', [okr('2026-Q4')]).banner).toBe('none');
    expect(at(now, null, [okr('2026-Q4')]).banner).toBe('none');
  });
  it('N53 precedence: Q+1 ending wins over Q ended in the Q+1 view; Q view still shows ended', () => {
    const now = local(2027, 3, 25);
    const okrs = [okr('2026-Q4'), okr('2027-Q1')];
    // at 2027-03-25: C = 2027-Q1 (in its last 14 days), P = 2026-Q4
    expect(at(now, '2027-Q1', okrs).banner).toBe('ending');
    expect(at(now, '2026-Q4', okrs).banner).toBe('ended');
  });
  it('N53 dismissal is per quarter: closing Q ended keeps Q+1 ending', () => {
    const now = local(2027, 3, 25);
    const okrs = [okr('2026-Q4'), okr('2027-Q1')];
    expect(at(now, '2027-Q1', okrs, ['2026-Q4']).banner).toBe('ending');
    expect(at(now, '2026-Q4', okrs, ['2026-Q4']).banner).toBe('none');
    // closing Q+1 ending lets Q ended show in the Q+1 view
    expect(at(now, '2027-Q1', okrs, ['2027-Q1']).banner).toBe('ended');
  });
  it('N51(3) a saved review removes it; no key results → no reminder', () => {
    const now = local(2027, 1, 5);
    expect(at(now, '2027-Q1', [okr('2026-Q4', { reviewed: true })]).banner).toBe('none');
    expect(at(now, '2027-Q1', [okr('2026-Q4', { keyResultCount: 0 })]).banner).toBe('none');
  });
  it('prefers the viewed OKR as the 去复盘 target', () => {
    const okrs = [okr('2026-Q4', { id: 'a' }), okr('2026-Q4', { id: 'b' })];
    expect(
      quarterBanner({
        now: local(2027, 1, 5),
        viewPeriod: '2026-Q4',
        okrs,
        dismissed: [],
        viewOkrId: 'b',
      }).targetOkrId,
    ).toBe('b');
  });
});

describe('#54 reminders: stale KR ids', () => {
  it('collects only stale, open KRs', () => {
    expect(
      staleKrIds(
        [
          kr(),
          kr({ id: 'k2', status: 'done' }),
          kr({ id: 'k3', lastRecordedAt: '2026-12-29T00:00:00Z' }),
        ],
        local(2026, 12, 30),
      ),
    ).toEqual(['k1']);
  });
});
