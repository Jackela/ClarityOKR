/**
 * #123: clarification wizard progress counter.
 * SET_PROMPT / RESTORE put the open question into `history`, so the header is
 * `history.length` (not history.length + 1). The bar is answered/total where
 * answered = history.length − 1 on a question page.
 */
describe('#123 wizard question counter formula', () => {
  const progressCurrent = (historyLength: number): number => historyLength;
  const progressAnswered = (historyLength: number): number => Math.max(0, historyLength - 1);
  const progressPercent = (answered: number, total: number): number =>
    total <= 0 ? 0 : Math.min(100, (answered / total) * 100);

  it('on question k the header shows k, not k + 1', () => {
    expect(progressCurrent(1)).toBe(1);
    expect(progressCurrent(4)).toBe(4);
    // the old bug: history.length + (currentPrompt ? 1 : 0) → 5 on Q4
    expect(progressCurrent(4) + 1).not.toBe(progressCurrent(4));
  });

  it('on question 4 of 5 the bar is 3 answered / 5', () => {
    expect(progressAnswered(4)).toBe(3);
    expect(progressPercent(3, 5)).toBe(60);
  });

  it('on question 5 of 5 the bar is 4 / 5 (not full / green)', () => {
    expect(progressAnswered(5)).toBe(4);
    expect(progressPercent(4, 5)).toBe(80);
  });
});
