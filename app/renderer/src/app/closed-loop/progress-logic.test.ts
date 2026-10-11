import { COPY, formatMonthDay, formatRelativeTime } from './copy';
import {
  describeLatestUpdate,
  isDoneButNot100,
  quarterOptions,
  stepProgressText,
  validateProgressInput,
} from './progress-logic';
import { makeEntry, makeInfo } from './testing/fixtures';

describe('validateProgressInput', () => {
  it.each([
    ['0', 0],
    ['100', 100],
    ['007', 7],
    ['65', 65],
    [' 42 ', 42],
  ])('accepts %j as %i', (text, value) => {
    expect(validateProgressInput(text)).toEqual({ ok: true, value });
  });

  it.each(['', '   '])('treats %j as "clear"', (text) => {
    expect(validateProgressInput(text)).toEqual({ ok: true, value: null });
  });

  it.each([
    ['-5', COPY.progressErrors.belowMin],
    ['-0', COPY.progressErrors.belowMin],
    ['-12.5', COPY.progressErrors.belowMin],
    ['101', COPY.progressErrors.aboveMax],
    ['99999999999999999999', COPY.progressErrors.aboveMax],
    ['abc', COPY.progressErrors.notNumber],
    ['12a', COPY.progressErrors.notNumber],
    ['50%', COPY.progressErrors.notNumber],
    ['５０', COPY.progressErrors.notNumber],
    ['1e2', COPY.progressErrors.notNumber],
    ['12.5', COPY.progressErrors.decimal],
    ['12.', COPY.progressErrors.decimal],
  ])('rejects %j with %s', (text, message) => {
    expect(validateProgressInput(text)).toEqual({ ok: false, message });
  });

  it('uses the exact spec copy', () => {
    expect(COPY.progressErrors).toEqual({
      belowMin: '进度不能小于 0',
      aboveMax: '进度不能超过 100',
      notNumber: '请输入 0–100 的整数',
      decimal: '请输入整数，不要带小数点',
    });
  });
});

describe('stepProgressText', () => {
  it.each([
    ['50', 1, '51'],
    ['50', -1, '49'],
    ['50', 10, '60'],
    ['95', 10, '100'],
    ['3', -10, '0'],
    ['', 1, '1'],
    ['abc', 1, '1'],
    ['', -1, '0'],
  ])('%j %+i → %j', (text, delta, expected) => {
    expect(stepProgressText(text, delta)).toBe(expected);
  });
});

describe('describeLatestUpdate', () => {
  const now = new Date('2026-10-09T12:00:00');
  const recorded = new Date('2026-10-09T09:05:00').toISOString();

  it('is null without any entry', () => {
    expect(describeLatestUpdate(makeInfo(), now)).toBeNull();
  });

  it('writes value and status when both changed', () => {
    const info = makeInfo({
      latest: makeEntry({ value: 100, status: 'done', recordedAt: recorded }),
      before: { value: 70, status: 'at_risk' },
      canRevert: true,
    });
    expect(describeLatestUpdate(info, now)).toEqual({
      kind: 'set',
      text: '最近更新 70% → 100%，有风险 → 已完成 · 今天 09:05',
    });
  });

  it('writes only the value when only the value changed', () => {
    const info = makeInfo({
      latest: makeEntry({ value: 65, status: 'in_progress', recordedAt: recorded }),
      before: { value: 40, status: 'in_progress' },
    });
    expect(describeLatestUpdate(info, now)?.text).toBe('最近更新 40% → 65% · 今天 09:05');
  });

  it('writes only the status when only the status changed', () => {
    const info = makeInfo({
      latest: makeEntry({ value: 40, status: 'at_risk', recordedAt: recorded }),
      before: { value: 40, status: 'in_progress' },
    });
    expect(describeLatestUpdate(info, now)?.text).toBe(
      '最近更新 状态 进行中 → 有风险 · 今天 09:05',
    );
  });

  it('writes "—" for empty values (first entry and cleared)', () => {
    const first = makeInfo({
      latest: makeEntry({ value: 30, recordedAt: recorded }),
      before: { value: null, status: 'not_started' },
    });
    expect(describeLatestUpdate(first, now)?.text).toContain('— → 30%');
    const cleared = makeInfo({
      latest: makeEntry({ value: null, status: 'in_progress', recordedAt: recorded }),
      before: { value: 30, status: 'in_progress' },
    });
    expect(describeLatestUpdate(cleared, now)?.text).toContain('30% → —');
  });

  it('describes a revert with the restored value and status', () => {
    const info = makeInfo({
      latest: makeEntry({ kind: 'revert', value: 70, status: 'at_risk', recordedAt: recorded }),
      before: { value: 100, status: 'done' },
    });
    expect(describeLatestUpdate(info, now)).toEqual({
      kind: 'revert',
      text: '已撤回上一次更新，进度恢复为 70%，状态恢复为有风险 · 今天 09:05',
    });
    const restoredEmpty = makeInfo({
      latest: makeEntry({ kind: 'revert', value: null, status: 'not_started' }),
    });
    expect(describeLatestUpdate(restoredEmpty, now)?.text).toContain(
      '进度恢复为 —，状态恢复为未开始',
    );
  });
});

describe('quarterOptions', () => {
  it('lists "not set" + 4 before, current, 4 after in order (2026-Q4)', () => {
    const options = quarterOptions(new Date('2026-10-12T10:00:00'), null);
    expect(options.map((option) => option.label)).toEqual([
      '不设置',
      '2025-Q4',
      '2026-Q1',
      '2026-Q2',
      '2026-Q3',
      '2026-Q4（当前季度）',
      '2027-Q1',
      '2027-Q2',
      '2027-Q3',
      '2027-Q4',
    ]);
    expect(options[0]?.value).toBeNull();
    expect(options[5]?.value).toBe('2026-Q4');
    for (const option of options.slice(1)) expect(option.value).toMatch(/^\d{4}-Q[1-4]$/);
  });

  it('is correct at the year boundaries (Q1 and Q4)', () => {
    const q1 = quarterOptions(new Date('2027-01-01T00:00:00'), null).map((o) => o.value);
    expect(q1[1]).toBe('2026-Q1');
    expect(q1[5]).toBe('2027-Q1');
    expect(q1[9]).toBe('2028-Q1');
    const q4 = quarterOptions(new Date('2026-12-31T23:59:00'), null).map((o) => o.value);
    expect(q4[1]).toBe('2025-Q4');
    expect(q4[9]).toBe('2027-Q4');
  });

  it('puts a stored period outside the window first so it is never lost', () => {
    const options = quarterOptions(new Date('2026-10-12T10:00:00'), '2019-Q2');
    expect(options).toHaveLength(11);
    expect(options[0]).toEqual({ value: '2019-Q2', label: '2019-Q2' });
    expect(quarterOptions(new Date('2026-10-12T10:00:00'), '2026-Q3')).toHaveLength(10);
  });
});

describe('isDoneButNot100', () => {
  it.each([
    ['done', 70, true],
    ['done', null, true],
    ['done', 100, false],
    ['in_progress', 70, false],
    ['at_risk', null, false],
  ] as const)('%s with %s → %s', (status, progress, expected) => {
    expect(isDoneButNot100(status, progress)).toBe(expected);
  });
});

describe('time formatting', () => {
  const now = new Date('2026-10-09T12:00:00');
  it('formats today, yesterday and older dates without the English medium format', () => {
    expect(formatRelativeTime(new Date('2026-10-09T14:20:00').toISOString(), now)).toBe(
      '今天 14:20',
    );
    expect(formatRelativeTime(new Date('2026-10-08T09:05:00').toISOString(), now)).toBe(
      '昨天 09:05',
    );
    expect(formatRelativeTime(new Date('2026-09-28T09:05:00').toISOString(), now)).toBe(
      '2026-09-28',
    );
    expect(formatRelativeTime('nonsense', now)).toBe('');
  });

  it('formats the removed date as month-day', () => {
    expect(formatMonthDay(new Date('2026-10-03T09:00:00').toISOString())).toBe('10-03');
    expect(formatMonthDay('x')).toBe('');
  });
});
