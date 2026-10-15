import type { ProgressEntryRecord } from '@clarityokr/contracts';

import { buildProgressHistory } from './progress-history';

let id = 0;
let clock = Date.parse('2026-10-01T08:00:00.000Z');
const at = (gapMs = 60_000) => new Date((clock += gapMs)).toISOString();
const set = (
  value: number | null,
  status = 'in_progress' as const,
  gap?: number,
): ProgressEntryRecord => ({
  id: ++id,
  krId: 'k',
  kind: 'set',
  value,
  status,
  revertsEntryId: null,
  recordedAt: at(gap),
});
const revert = (
  of: ProgressEntryRecord,
  value: number | null,
  gap?: number,
): ProgressEntryRecord => ({
  id: ++id,
  krId: 'k',
  kind: 'revert',
  value,
  status: 'in_progress',
  revertsEntryId: of.id,
  recordedAt: at(gap),
});

beforeEach(() => {
  id = 0;
  clock = Date.parse('2026-10-01T08:00:00.000Z');
});

describe('buildProgressHistory (#53 AC1)', () => {
  it('no entries: nothing', () => {
    expect(buildProgressHistory([])).toEqual({
      rows: [],
      points: [],
      count: 0,
      first: null,
      last: null,
    });
  });

  it('plain updates: newest first rows, oldest first points', () => {
    const h = buildProgressHistory([set(10), set(30), set(60)]);
    expect(h.rows.map((r) => r.value)).toEqual([60, 30, 10]);
    expect(h.points).toEqual([10, 30, 60]);
    expect(h).toMatchObject({ count: 3, first: 10, last: 60 });
  });

  it('a reverted set is 「已撤回」, leaves the trend and the count; the revert has no row (Q10-3)', () => {
    const a = set(10);
    const b = set(40);
    const h = buildProgressHistory([a, b, revert(b, 10), set(20)]);
    expect(h.rows.map((r) => [r.value, r.reverted])).toEqual([
      [20, false],
      [40, true],
      [10, false],
    ]);
    expect(h.points).toEqual([10, 20]);
    expect(h.count).toBe(2);
  });

  it('「修改这次」 (revert + set in one write) shows the corrected value once, tagged 已修改 (Q10-4, Q10-5)', () => {
    const a = set(10);
    const b = set(45);
    const h = buildProgressHistory([a, b, revert(b, 10), set(50, 'in_progress', 0)]);
    expect(h.rows.map((r) => [r.value, r.modified, r.reverted])).toEqual([
      [50, true, false],
      [10, false, false],
    ]);
    expect(h.points).toEqual([10, 50]);
    expect(h.count).toBe(2);
  });

  it('a corrected record that is reverted later is 已撤回 and keeps 已修改', () => {
    const a = set(10);
    const b = set(45);
    const r = revert(b, 10);
    const c = set(50, 'in_progress', 0);
    const h = buildProgressHistory([a, b, r, c, revert(c, 10)]);
    expect(h.rows[0]).toMatchObject({ value: 50, modified: true, reverted: true });
    expect(h.points).toEqual([10]);
  });

  it('a revert and a new update a while later are two things', () => {
    const a = set(10);
    const b = set(40);
    const h = buildProgressHistory([a, b, revert(b, 10), set(70, 'in_progress', 5_000)]);
    expect(h.rows.map((r) => [r.value, r.reverted, r.modified])).toEqual([
      [70, false, false],
      [40, true, false],
      [10, false, false],
    ]);
  });

  it('a cleared value is effective but has no point (gap, Q10-2); summary uses the non-empty ends', () => {
    const h = buildProgressHistory([set(null), set(20), set(null), set(60)]);
    expect(h.points).toEqual([null, 20, null, 60]);
    expect(h).toMatchObject({ count: 4, first: 20, last: 60 });
  });

  it('only reverted / empty: no effective value', () => {
    const a = set(30);
    const h = buildProgressHistory([a, revert(a, null)]);
    expect(h).toMatchObject({ count: 0, first: null, last: null, points: [] });
    expect(h.rows).toHaveLength(1);
  });

  it('order comes from the id, not the input order', () => {
    const entries = [set(1), set(2), set(3)];
    expect(buildProgressHistory([...entries].reverse()).points).toEqual([1, 2, 3]);
  });

  it('200 entries stay fast', () => {
    const many = Array.from({ length: 200 }, (_, i) => set(i % 101));
    const started = performance.now();
    expect(buildProgressHistory(many).count).toBe(200);
    expect(performance.now() - started).toBeLessThan(50);
  });
});
