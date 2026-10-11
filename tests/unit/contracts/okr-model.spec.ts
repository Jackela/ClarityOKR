import {
  MAX_CLUSTER_UTF16_UNITS,
  TEXT_LIMITS,
  checkText,
  countGraphemes,
  isKrStatus,
  isPeriod,
  isValidProgress,
} from '@clarityokr/contracts';

const FAMILY = '👨‍👩‍👧‍👦';

describe('okr-model text counting', () => {
  it('counts user-perceived characters', () => {
    expect(countGraphemes('abc')).toBe(3);
    expect(countGraphemes('目标')).toBe(2);
    expect(countGraphemes('😀')).toBe(1);
    expect(countGraphemes(FAMILY)).toBe(1);
    expect(countGraphemes('e\u0301')).toBe(1);
    expect(countGraphemes('')).toBe(0);
  });

  it('accepts exactly the limit and rejects one over, counting graphemes', () => {
    expect(checkText('a'.repeat(200), 200)).toEqual({ ok: true });
    expect(checkText('a'.repeat(201), 200)).toEqual({ ok: false, reason: 'too_long' });
    expect(checkText('😀'.repeat(200), 200)).toEqual({ ok: true });
    expect(checkText('😀'.repeat(201), 200)).toEqual({ ok: false, reason: 'too_long' });
  });

  it('accepts 200 ZWJ family emoji (each is 11 UTF-16 units)', () => {
    expect(FAMILY.length).toBe(11);
    expect(checkText(FAMILY.repeat(200), TEXT_LIMITS.objective)).toEqual({ ok: true });
  });

  it('rejects a single character stacked with 40 combining marks', () => {
    const stacked = 'a' + '\u0301'.repeat(40);
    expect(checkText(stacked, 200)).toEqual({ ok: false, reason: 'cluster_too_long' });
  });

  it('allows a cluster of exactly 32 UTF-16 units and rejects 33', () => {
    const exact = 'a' + '\u0301'.repeat(MAX_CLUSTER_UTF16_UNITS - 1);
    expect(exact.length).toBe(MAX_CLUSTER_UTF16_UNITS);
    expect(checkText(exact, 200)).toEqual({ ok: true });
    expect(checkText(exact + '\u0301', 200)).toEqual({ ok: false, reason: 'cluster_too_long' });
  });
});

describe('okr-model validators', () => {
  it('validates progress as integer 0-100', () => {
    for (const ok of [0, 1, 50, 100]) expect(isValidProgress(ok)).toBe(true);
    for (const bad of [-1, 101, 1.5, Number.NaN, '5', null, undefined]) {
      expect(isValidProgress(bad)).toBe(false);
    }
  });

  it('validates statuses', () => {
    for (const s of ['not_started', 'in_progress', 'at_risk', 'done']) {
      expect(isKrStatus(s)).toBe(true);
    }
    expect(isKrStatus('unset')).toBe(false);
    expect(isKrStatus(undefined)).toBe(false);
  });

  it('validates quarter periods', () => {
    for (const ok of ['2026-Q1', '2026-Q4']) expect(isPeriod(ok)).toBe(true);
    for (const bad of ['2026-Q5', '2026-Q0', '26-Q1', '2026Q1', '', null]) {
      expect(isPeriod(bad)).toBe(false);
    }
  });
});
