// Local natural days: run the rules in a zone ahead of UTC so a UTC day/year rollover differs
// from the local one. (Node reads TZ when the first Date needs it.)
process.env.TZ = 'Asia/Shanghai';

import {
  QUARTER_ENDING_WITHIN_MS,
  STALE_AFTER_MS,
  evaluateReminders,
  isKrStale,
  previousQuarter,
  quarterBanner,
  quarterEnd,
  quarterOf,
  type ReminderKr,
} from '@clarityokr/contracts';

/** Local time in Asia/Shanghai (UTC+8). */
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
    // 2026-09-30T16:30Z is already 10-01 00:30 in Shanghai → Q4 locally, Q3 in UTC
    expect(quarterOf(new Date('2026-09-30T16:30:00Z'))).toBe('2026-Q4');
  });
  it('year rollover: 2026-12-31T16:30Z is 2027-Q1 locally; previous of 2027-Q1 is 2026-Q4', () => {
    expect(quarterOf(new Date('2026-12-31T16:30:00Z'))).toBe('2027-Q1');
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

describe('#54 reminders: banner', () => {
  const base = { reviewSavedAt: null, dismissed: [] as string[] };
  it('ending: under 14 days before the local end, not at 14 days or more', () => {
    const end = quarterEnd('2026-Q4').getTime();
    const p = '2026-Q4' as const;
    expect(
      quarterBanner({ ...base, period: p, now: new Date(end - QUARTER_ENDING_WITHIN_MS) }),
    ).toBe('none');
    expect(
      quarterBanner({ ...base, period: p, now: new Date(end - QUARTER_ENDING_WITHIN_MS + 1) }),
    ).toBe('ending');
  });
  it('ended: the quarter just before, after its end; older quarters never (past quarter)', () => {
    const now = local(2027, 1, 1, 0, 0, 0, 0);
    expect(quarterBanner({ ...base, period: '2026-Q4', now })).toBe('ended');
    expect(quarterBanner({ ...base, period: '2026-Q3', now })).toBe('none');
  });
  it('no quarter set → no banner', () => {
    expect(quarterBanner({ ...base, period: null, now: local(2026, 12, 30) })).toBe('none');
  });
  it('a review with savedAt removes it; dismissal is per quarter', () => {
    const now = local(2026, 12, 30);
    expect(
      quarterBanner({ ...base, period: '2026-Q4', now, reviewSavedAt: '2026-12-29T00:00:00Z' }),
    ).toBe('none');
    expect(quarterBanner({ ...base, period: '2026-Q4', now, dismissed: ['2026-Q4'] })).toBe('none');
    // next quarter: rules apply again
    expect(
      quarterBanner({
        ...base,
        period: '2027-Q1',
        now: local(2027, 3, 25),
        dismissed: ['2026-Q4'],
      }),
    ).toBe('ending');
  });
});

describe('#54 reminders: evaluate', () => {
  it('no key results (no OKR) → nothing', () => {
    expect(
      evaluateReminders({
        now: local(2026, 12, 30),
        period: '2026-Q4',
        keyResults: [],
        reviewSavedAt: null,
        dismissed: [],
      }),
    ).toEqual({ staleKrIds: [], banner: 'none', period: null });
  });
  it('collects stale KRs and the banner', () => {
    expect(
      evaluateReminders({
        now: local(2026, 12, 30),
        period: '2026-Q4',
        keyResults: [
          kr(),
          kr({ id: 'k2', status: 'done' }),
          kr({ id: 'k3', lastRecordedAt: '2026-12-29T00:00:00Z' }),
        ],
        reviewSavedAt: null,
        dismissed: [],
      }),
    ).toEqual({ staleKrIds: ['k1'], banner: 'ending', period: '2026-Q4' });
  });
});
