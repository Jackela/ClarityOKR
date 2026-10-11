import { jest } from '@jest/globals';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'better-sqlite3';
import { renderJson, renderMarkdown } from '../../../../app/main/src/export/export-document.js';
import {
  ExportService,
  categorizeExportError,
  type ExportDeps,
} from '../../../../app/main/src/export/export-service.js';
import { buildSampleOkr, FIXED_EXPORT_TIME, loadExportSource } from './fixture.js';

/** Jest may be started from the repo root or from tests/integration: walk up to find the fixtures. */
function findFixtures(): string {
  let current = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    for (const candidate of [
      join(current, 'specs', 'export', 'fixtures'),
      join(current, 'tests', 'integration', 'specs', 'export', 'fixtures'),
    ]) {
      if (existsSync(candidate)) return candidate;
    }
    current = join(current, '..');
  }
  throw new Error('export fixtures not found');
}
const FIXTURES = findFixtures();
const readFixture = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8');

describe('export content (sample comparison)', () => {
  let db: Database;
  let okrId: string;
  let source: NonNullable<ReturnType<typeof loadExportSource>>;
  beforeEach(() => {
    const sample = buildSampleOkr();
    db = sample.db;
    okrId = sample.okrId;
    source = loadExportSource(sample.store, okrId)!;
  });
  afterEach(() => db.close());

  it('JSON matches the checked-in sample byte for byte', () => {
    expect(renderJson(source, FIXED_EXPORT_TIME)).toBe(readFixture('sample-export.json'));
  });

  it('JSON has the fixed field list, schemaVersion 1 and typed, referenced progress entries', () => {
    const doc = JSON.parse(renderJson(source, FIXED_EXPORT_TIME)) as Record<string, unknown>;
    expect(Object.keys(doc)).toEqual([
      'schemaVersion',
      'exportedAt',
      'objective',
      'keyResults',
      'progressEntries',
      'review',
    ]);
    expect(doc.schemaVersion).toBe(1);
    const entries = doc.progressEntries as Array<{ kind: string; revertsEntryId: number | null }>;
    expect(entries.map((e) => e.kind)).toEqual(['set', 'set', 'revert', 'set', 'set', 'set']);
    expect(entries[2]!.revertsEntryId).toBe(2);
    expect(entries.filter((e) => e.kind === 'set').every((e) => e.revertsEntryId === null)).toBe(
      true,
    );
    const keyResults = doc.keyResults as Array<Record<string, unknown>>;
    for (const kr of keyResults) {
      expect(Object.keys(kr)).toEqual([
        'id',
        'statement',
        'successMetric',
        'progress',
        'status',
        'removedAt',
      ]);
    }
    // The removed key result stays in the file with its removal time and its history.
    expect(keyResults[2]!.removedAt).toBe('2026-10-07T09:00:00.000Z');
  });

  it('the review snapshot in the file is the one frozen at save time, not the current state', () => {
    const doc = JSON.parse(renderJson(source, FIXED_EXPORT_TIME)) as {
      review: { snapshot: Array<{ krId: string; progress: number | null }> };
      keyResults: Array<{ id: string; progress: number | null }>;
    };
    const live = doc.keyResults.find((k) => k.id === 'kr-2')!;
    const snap = doc.review.snapshot.find((k) => k.krId === 'kr-2')!;
    expect(live.progress).toBe(20);
    expect(snap.progress).toBeNull();
  });

  it('Markdown matches the checked-in sample byte for byte', () => {
    expect(renderMarkdown(source)).toBe(readFixture('sample-export.md'));
  });

  it('Markdown has the sections the spec lists, a separate removed section, and no progress entries', () => {
    const md = renderMarkdown(source);
    for (const part of [
      '# ',
      '- 周期：',
      '- 整体进度：',
      '## 关键结果',
      '## 已移除的关键结果',
      '## 复盘',
      '### 做得好',
      '### 没做到',
      '### 下一步',
      '度量：',
      '进度：',
      '状态：',
    ]) {
      expect(md).toContain(part);
    }
    expect(md).not.toContain('备份');
    expect(md).not.toContain('revert');
    expect(md).not.toContain('snapshot');
  });

  it('Markdown without a review has no review section; all-unset progress shows an em dash', () => {
    const other = buildSampleOkr();
    other.db.prepare('DELETE FROM reviews').run();
    other.db.prepare('UPDATE key_results SET progress = NULL').run();
    const src = loadExportSource(other.store, other.okrId)!;
    const md = renderMarkdown(src);
    expect(md).not.toContain('## 复盘');
    expect(md).toContain('- 整体进度：—');
    expect(JSON.parse(renderJson(src, FIXED_EXPORT_TIME)).review).toBeNull();
    other.db.close();
  });

  it('loadExportSource returns null for an unknown id', () => {
    const other = buildSampleOkr();
    expect(loadExportSource(other.store, 'nope')).toBeNull();
    other.db.close();
  });
});

describe('ExportService (injected dialog, temp directory)', () => {
  let dir: string;
  let downloads: string;
  let db: Database;
  let okrId: string;
  let service: ExportService;
  let showSaveDialog: ReturnType<typeof jest.fn>;
  let showItemInFolder: ReturnType<typeof jest.fn>;
  let overrides: Partial<ExportDeps>;

  const make = (): ExportService => {
    const sample = buildSampleOkr();
    db = sample.db;
    okrId = sample.okrId;
    return new ExportService({
      loadSource: (id) => loadExportSource(sample.store, id),
      showSaveDialog: showSaveDialog as never,
      showItemInFolder: showItemInFolder as never,
      getDownloadsDir: () => downloads,
      now: () => new Date(2026, 9, 11, 12, 0, 0),
      ...overrides,
    });
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'okr-export-'));
    downloads = join(dir, 'Downloads');
    mkdirSync(downloads);
    showSaveDialog = jest.fn();
    showItemInFolder = jest.fn();
    overrides = {};
  });
  afterEach(() => {
    db?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('offers Downloads and the generated name as the default path, then writes the file', async () => {
    service = make();
    showSaveDialog.mockImplementation(
      async (request: unknown) => (request as { defaultPath: string }).defaultPath,
    );
    const result = await service.export(okrId, 'md');
    const expectedName = 'ClarityOKR-Ship the _closed loop_ _ v2-2026-10-11.md';
    expect(showSaveDialog).toHaveBeenCalledWith({
      defaultPath: join(downloads, expectedName),
      format: 'md',
    });
    expect(result).toEqual({
      outcome: 'saved',
      format: 'md',
      fileName: expectedName,
      path: join(downloads, expectedName),
    });
    expect(readFileSync(join(downloads, expectedName), 'utf8')).toBe(
      readFixture('sample-export.md'),
    );
  });

  it('JSON is written as UTF-8 and parses back with schemaVersion 1; no temp file is left behind', async () => {
    service = make();
    const target = join(dir, 'out.json');
    showSaveDialog.mockResolvedValue(target);
    const result = await service.export(okrId, 'json');
    expect(result).toMatchObject({
      outcome: 'saved',
      format: 'json',
      fileName: 'out.json',
      path: target,
    });
    const text = readFileSync(target, 'utf8');
    expect(JSON.parse(text).schemaVersion).toBe(1);
    expect(text).toContain('Retire the old importer\\nkeep the data');
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('appends the right extension when the chosen name has none or a wrong one', async () => {
    service = make();
    showSaveDialog.mockResolvedValue(join(dir, 'notes'));
    expect(await service.export(okrId, 'md')).toMatchObject({ fileName: 'notes.md' });
    showSaveDialog.mockResolvedValue(join(dir, 'data.txt'));
    expect(await service.export(okrId, 'json')).toMatchObject({ fileName: 'data.txt.json' });
  });

  it('a cancelled dialog is not an error and writes nothing', async () => {
    service = make();
    showSaveDialog.mockResolvedValue(null);
    expect(await service.export(okrId, 'json')).toEqual({ outcome: 'cancelled' });
    expect(readdirSync(dir).sort()).toEqual(['Downloads']);
    expect(readdirSync(downloads)).toEqual([]);
  });

  it('returns null for an unknown OKR without opening the dialog', async () => {
    service = make();
    expect(await service.export('missing', 'md')).toBeNull();
    expect(showSaveDialog).not.toHaveBeenCalled();
  });

  it.each([
    ['EACCES', 'permission'],
    ['EPERM', 'permission'],
    ['ENOSPC', 'disk_full'],
    ['ENOENT', 'not_found'],
    ['EBUSY', 'busy'],
    ['EIO', 'other'],
    ['constructor', 'other'],
    ['EMFILE', 'other'],
    [undefined, 'other'],
  ])(
    'maps write error %s to category %s and leaks no path or error text',
    async (code, category) => {
      overrides = {
        writeFile: async () => {
          throw Object.assign(new Error(`failed at ${dir}`), code ? { code } : {});
        },
      };
      service = make();
      showSaveDialog.mockResolvedValue(join(dir, 'x.md'));
      const result = await service.export(okrId, 'md');
      expect(result).toEqual({ outcome: 'failed', category });
      expect(JSON.stringify(result)).not.toContain(dir);
      expect(service.canReveal(join(dir, 'x.md'))).toBe(false);
    },
  );

  it('a real write failure (read-only directory) is categorised and leaves no partial file', async () => {
    service = make();
    const ro = join(dir, 'ro');
    mkdirSync(ro);
    chmodSync(ro, 0o500);
    showSaveDialog.mockResolvedValue(join(ro, 'out.md'));
    const result = await service.export(okrId, 'md');
    chmodSync(ro, 0o700);
    if (process.getuid && process.getuid() === 0) {
      // root ignores directory permissions; the write simply succeeds
      expect(result).toMatchObject({ outcome: 'saved' });
    } else {
      expect(result).toEqual({ outcome: 'failed', category: 'permission' });
      expect(readdirSync(ro)).toEqual([]);
    }
  });

  it('a missing target directory is reported as not_found', async () => {
    service = make();
    showSaveDialog.mockResolvedValue(join(dir, 'does', 'not', 'exist', 'out.md'));
    expect(await service.export(okrId, 'md')).toEqual({ outcome: 'failed', category: 'not_found' });
  });

  it('a failed write does not clobber an existing file at the chosen path', async () => {
    const target = join(dir, 'keep.md');
    writeFileSync(target, 'precious');
    overrides = {
      writeFile: async () => {
        throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
      },
    };
    service = make();
    showSaveDialog.mockResolvedValue(target);
    expect(await service.export(okrId, 'md')).toEqual({ outcome: 'failed', category: 'disk_full' });
    expect(readFileSync(target, 'utf8')).toBe('precious');
  });

  it('the atomic default writer replaces an existing file and cleans up on failure', async () => {
    service = make();
    const target = join(dir, 'replace.json');
    writeFileSync(target, 'old');
    showSaveDialog.mockResolvedValue(target);
    expect(await service.export(okrId, 'json')).toMatchObject({ outcome: 'saved' });
    expect(readFileSync(target, 'utf8')).not.toBe('old');
    // chosen path is a directory: rename fails, temp file is removed
    const asDir = join(dir, 'a-directory.json');
    mkdirSync(asDir);
    showSaveDialog.mockResolvedValue(asDir);
    const failed = await service.export(okrId, 'json');
    expect(failed).toMatchObject({ outcome: 'failed' });
    expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('a dialog that throws or returns a relative path fails as "other" and writes nothing', async () => {
    service = make();
    showSaveDialog.mockRejectedValueOnce(new Error('dialog crashed'));
    expect(await service.export(okrId, 'md')).toEqual({ outcome: 'failed', category: 'other' });
    showSaveDialog.mockResolvedValueOnce('relative/out.md');
    expect(await service.export(okrId, 'md')).toEqual({ outcome: 'failed', category: 'other' });
    expect(existsSync(join(process.cwd(), 'relative', 'out.md'))).toBe(false);
  });

  describe('reveal', () => {
    it('only accepts the path returned by the most recent successful export', async () => {
      service = make();
      const first = join(dir, 'first.md');
      const second = join(dir, 'second.md');
      showSaveDialog.mockResolvedValueOnce(first);
      await service.export(okrId, 'md');
      expect(service.reveal(first)).toBe(true);
      expect(showItemInFolder).toHaveBeenCalledWith(first);

      showSaveDialog.mockResolvedValueOnce(second);
      await service.export(okrId, 'md');
      expect(service.reveal(first)).toBe(false);
      expect(service.reveal(second)).toBe(true);
      expect(service.reveal(join(dir, 'never-exported.md'))).toBe(false);
      expect(service.reveal('/etc/passwd')).toBe(false);
      expect(showItemInFolder).toHaveBeenCalledTimes(2);
    });

    it('is revoked by a later cancelled or failed export attempt', async () => {
      service = make();
      const first = join(dir, 'first.md');
      showSaveDialog.mockResolvedValueOnce(first);
      await service.export(okrId, 'md');
      showSaveDialog.mockResolvedValueOnce(null);
      await service.export(okrId, 'md');
      expect(service.canReveal(first)).toBe(false);
    });

    it('nothing can be revealed before any export', () => {
      service = make();
      expect(service.reveal(join(dir, 'x.md'))).toBe(false);
      expect(showItemInFolder).not.toHaveBeenCalled();
    });
  });
});

describe('categorizeExportError', () => {
  it('handles non-error values', () => {
    expect(categorizeExportError(null)).toBe('other');
    expect(categorizeExportError('EACCES')).toBe('other');
    expect(categorizeExportError({ code: 'EACCES' })).toBe('permission');
  });
});
