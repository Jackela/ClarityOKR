import { middleEllipsis } from './path-display';

describe('middleEllipsis', () => {
  it('leaves a short path alone', () => {
    expect(middleEllipsis('/home/me/Downloads/a.md')).toBe('/home/me/Downloads/a.md');
  });

  it('keeps the start and the file name, drops the middle, and stays within the limit', () => {
    const path = `/Users/someone-with-a-long-name/Documents/deeply/nested/folders/ClarityOKR-把发布频率提到每周 3 次-2026-10-11.md`;
    const short = middleEllipsis(path, 44);
    expect(Array.from(short)).toHaveLength(44);
    expect(short.startsWith('/Users/')).toBe(true);
    expect(short.endsWith('2026-10-11.md')).toBe(true);
    expect(short).toContain('…');
  });

  it('counts code points, so an emoji is not cut in half', () => {
    const short = middleEllipsis('😀'.repeat(60), 20);
    expect(Array.from(short)).toHaveLength(20);
    expect(short).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
  });
});
