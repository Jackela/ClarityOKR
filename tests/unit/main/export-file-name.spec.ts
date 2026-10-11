import {
  buildExportFileName,
  sanitizeTitleForFileName,
} from '@clarityokr/main/export/export-file-name';

const DAY = new Date(2026, 9, 11, 12, 0, 0); // local 2026-10-11

describe('buildExportFileName', () => {
  it('follows ClarityOKR-<title>-<yyyy-MM-dd>.<ext> and keeps spaces and CJK text', () => {
    expect(buildExportFileName('把发布频率提到每周 3 次', DAY, 'md')).toBe(
      'ClarityOKR-把发布频率提到每周 3 次-2026-10-11.md',
    );
    expect(buildExportFileName('Ship it', DAY, 'json')).toBe('ClarityOKR-Ship it-2026-10-11.json');
  });

  it('matches the fixed pattern for tricky titles', () => {
    for (const title of [
      'a/b',
      'CON',
      '..',
      '',
      '   ',
      '"?*',
      'x'.repeat(500),
      '你'.repeat(500),
      '\u0000\u0001',
    ]) {
      expect(buildExportFileName(title, DAY, 'md')).toMatch(
        /^ClarityOKR-.+-\d{4}-\d{2}-\d{2}\.(md|json)$/,
      );
    }
  });

  it('zero-pads month and day', () => {
    expect(buildExportFileName('t', new Date(2026, 0, 5), 'md')).toBe('ClarityOKR-t-2026-01-05.md');
  });

  it('never exceeds 200 UTF-8 bytes, even for CJK or emoji titles, and never splits a character', () => {
    for (const title of ['你'.repeat(500), '😀'.repeat(500), '👨‍👩‍👧‍👦'.repeat(100), 'a'.repeat(1000)]) {
      const name = buildExportFileName(title, DAY, 'json');
      expect(Buffer.byteLength(name, 'utf8')).toBeLessThanOrEqual(200);
      expect(name).not.toContain('\uFFFD');
      expect(name.isWellFormed()).toBe(true);
    }
    const emoji = buildExportFileName('👨‍👩‍👧‍👦'.repeat(100), DAY, 'md');
    // Only whole family emoji remain in the title part.
    const title = emoji.slice('ClarityOKR-'.length, emoji.length - '-2026-10-11.md'.length);
    expect(title.length % '👨‍👩‍👧‍👦'.length).toBe(0);
  });
});

describe('sanitizeTitleForFileName', () => {
  it.each(['/', '\\', ':', '*', '?', '"', '<', '>', '|'])(
    'replaces the illegal character %s',
    (ch) => {
      const out = sanitizeTitleForFileName(`a${ch}b`);
      expect(out).toBe('a_b');
    },
  );

  it('removes path traversal: separators never survive', () => {
    const out = sanitizeTitleForFileName('../../etc/passwd');
    expect(out).not.toMatch(/[\\/]/);
    expect(out).toBe('_.._etc_passwd');
    expect(sanitizeTitleForFileName('C:\\Windows\\System32')).toBe('C__Windows_System32');
  });

  it('turns control characters into spaces, drops bidi controls, collapses whitespace', () => {
    expect(sanitizeTitleForFileName('a\u0000b\tc\nd')).toBe('a b c d');
    expect(sanitizeTitleForFileName('abc\u202Egpj.exe')).toBe('abcgpj.exe');
    expect(sanitizeTitleForFileName('  many    spaces  ')).toBe('many spaces');
  });

  it('strips leading and trailing dots and spaces (Windows)', () => {
    expect(sanitizeTitleForFileName('. hidden .')).toBe('hidden');
    expect(sanitizeTitleForFileName('..')).toBe('未命名');
    expect(sanitizeTitleForFileName('title...')).toBe('title');
  });

  it('falls back to a placeholder when nothing usable is left', () => {
    for (const empty of ['', '   ', '\u0000', '...', '\u202E']) {
      expect(sanitizeTitleForFileName(empty)).toBe('未命名');
    }
  });

  it.each([
    'CON',
    'con',
    'PRN',
    'AUX',
    'NUL',
    'COM1',
    'com9',
    'LPT1',
    'lpt9',
    'CON.txt',
    'nul.tar.gz',
  ])('marks the Windows reserved name %s', (name) => {
    expect(sanitizeTitleForFileName(name).endsWith('_')).toBe(true);
  });

  it('leaves similar but legal names alone', () => {
    for (const name of ['CONSOLE', 'COM10', 'LPT0', 'my CON']) {
      expect(sanitizeTitleForFileName(name)).toBe(name);
    }
  });

  it('truncates on grapheme boundaries within the byte budget', () => {
    const out = sanitizeTitleForFileName('你好世界你好世界', 10);
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(10);
    expect(out).toBe('你好世');
  });
});
