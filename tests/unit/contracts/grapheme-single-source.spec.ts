import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { checkText, countGraphemes, updateOKRRequestSchema } from '@clarityokr/contracts';

function findRoot(from: string): string {
  let dir = from;
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('repository root not found');
    dir = parent;
  }
  return dir;
}

const ROOT = findRoot(process.cwd());

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name.startsWith('dist')) return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.ts$/.test(name) && !/\.(test|spec|d)\.ts$/.test(name) ? [path] : [];
  });
}
const read = (path: string): string => readFileSync(path, 'utf8');

/**
 * Reviewer check (D1b-1): the 200-character limit is counted by ONE function. The main process
 * (okr:update schema) and the renderer (live counter / save button) both use
 * `countGraphemes` / `checkText` from the contracts package.
 */
describe('one grapheme counting function for the text limits', () => {
  const all = ['app/main/src', 'app/renderer/src', 'packages/contracts/src'].flatMap((dir) =>
    sources(join(ROOT, dir)),
  );

  it('Intl.Segmenter is only used by the contracts counter (and by the export file-name / export text code, which are not limits)', () => {
    const users = all
      .filter((file) => read(file).includes('Intl.Segmenter'))
      .map((file) => relative(ROOT, file).replace(/\\/g, '/'))
      .sort();
    expect(users).toEqual([
      'app/main/src/export/export-file-name.ts',
      'app/main/src/export/export-service.ts',
      'packages/contracts/src/okr-model.ts',
    ]);
  });

  it('the renderer limit code imports the contracts function and has no counter of its own', () => {
    const source = read(join(ROOT, 'app/renderer/src/app/closed-loop/text-limit.ts'));
    expect(source).toMatch(
      /import \{[^}]*\bcountGraphemes\b[^}]*\} from '@clarityokr\/contracts'/s,
    );
    expect(source).toMatch(/import \{[^}]*\bcheckText\b[^}]*\} from '@clarityokr\/contracts'/s);
    expect(source).not.toMatch(/Segmenter|\.length\s*>\s*\d{2,}/);
  });

  it('the schema the main process validates with uses the same contracts functions', () => {
    const source = read(
      join(ROOT, 'packages/contracts/src/validators/clarify-to-okr.validator.ts'),
    );
    expect(source).toMatch(/\bcountGraphemes\b|\bcheckText\b/);
    expect(source).toMatch(/from '\.\.\/okr-model(\.js)?'/);
    expect(source).not.toMatch(/Segmenter/);
  });

  const CORPUS = [
    '目'.repeat(200),
    '目'.repeat(201),
    '👨‍👩‍👧‍👦'.repeat(200),
    '👨‍👩‍👧‍👦'.repeat(201),
    '🇨🇳'.repeat(200),
    'e\u0301'.repeat(200),
    'e\u0301'.repeat(201),
    'a' + '\u0301'.repeat(40),
    '',
    'x',
  ];

  it.each(
    CORPUS.map((text) => [
      text.length > 12 ? `${text.slice(0, 6)}…(${[...text].length})` : text,
      text,
    ]),
  )('main schema acceptance == contracts count/cluster rule for %s', (_label, text) => {
    const rule = checkText(text as string, 200).ok;
    const accepted = updateOKRRequestSchema.safeParse({
      id: 'okr-1',
      objective: (text as string) || 'x',
      keyResults: [{ id: 'kr-1', statement: 'x' }],
    }).success;
    if ((text as string) !== '') {
      expect(accepted).toBe(rule);
      expect(countGraphemes(text as string) <= 200 && rule).toBe(accepted);
    }
  });
});
