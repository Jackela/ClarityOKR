import * as contracts from '@clarityokr/contracts';

import { evaluateText } from './text-limit';

const FAMILY = '👨‍👩‍👧‍👦';
const FLAG = '🇨🇳';
const THUMB = '👍🏽';

describe('evaluateText (spec §3.9a)', () => {
  it('counts what the user sees: an emoji of any kind is one character', () => {
    expect(evaluateText('目标abc', 200).count).toBe(5);
    expect(evaluateText(FAMILY, 200).count).toBe(1);
    expect(evaluateText(FLAG, 200).count).toBe(1);
    expect(evaluateText(THUMB, 200).count).toBe(1);
    expect(evaluateText('e\u0301', 200).count).toBe(1);
    expect(evaluateText('a\nb', 200).count).toBe(3);
  });

  it('is within the limit at exactly the limit and over by one beyond it', () => {
    expect(evaluateText('a'.repeat(200), 200)).toMatchObject({
      kind: 'ok',
      over: 0,
      invalid: false,
    });
    expect(evaluateText('a'.repeat(236), 200)).toMatchObject({
      kind: 'too_long',
      over: 36,
      count: 236,
      invalid: true,
    });
  });

  it('200 family emoji (11 code units each) pass, 201 do not', () => {
    expect(evaluateText(FAMILY.repeat(200), 200).kind).toBe('ok');
    expect(evaluateText(FAMILY.repeat(201), 200)).toMatchObject({ kind: 'too_long', over: 1 });
  });

  it('a cluster of more than 32 UTF-16 units is its own failure while the count stays real', () => {
    const stacked = 'a' + '\u0301'.repeat(40);
    expect(evaluateText(stacked, 200)).toMatchObject({
      kind: 'cluster_too_long',
      count: 1,
      invalid: true,
    });
    // exactly 32 units is fine
    expect(evaluateText('a' + '\u0301'.repeat(31), 200).kind).toBe('ok');
  });

  it('the cluster rule wins when both apply', () => {
    const text = 'a'.repeat(210) + 'b' + '\u0301'.repeat(40);
    expect(evaluateText(text, 200).kind).toBe('cluster_too_long');
  });

  it('uses the very functions the main process uses (one counting function, spec §3.9a)', () => {
    const sample = `x${FAMILY}${FLAG}\u0301`;
    expect(evaluateText(sample, 200).count).toBe(contracts.countGraphemes(sample));
    // same verdicts as the shared checkText at the limit boundary
    for (const text of ['a'.repeat(200), 'a'.repeat(201), 'a' + '\u0301'.repeat(40)]) {
      expect(evaluateText(text, 200).invalid).toBe(!contracts.checkText(text, 200).ok);
    }
  });
});
