import { jest } from '@jest/globals';
import * as fs from 'node:fs';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DraftRow } from '@clarityokr/contracts';

import { Logger } from '../../../app/main/src/core/logger.js';
import { SessionDraftStore } from '../../../app/main/src/drafts/session-draft-store.js';

const wizard: DraftRow = { kind: 'wizard', step: 3, intent: '提高团队效率' };
const review: DraftRow = {
  kind: 'review',
  okrId: 'o1',
  base: { wentWell: '', fellShort: '', nextSteps: '' },
  draft: { wentWell: '稳定', fellShort: '', nextSteps: '' },
};

describe('SessionDraftStore (#110: userData/drafts, one versioned file per window)', () => {
  let dir: string;
  beforeEach(() => {
    dir = join(mkdtempSync(join(tmpdir(), 'drafts-')), 'drafts');
  });
  afterEach(() => {
    rmSync(join(dir, '..'), { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('reported input stays in memory: a normal quit leaves no file', () => {
    const store = new SessionDraftStore({ dir });
    store.report('main', [wizard]);
    expect(existsSync(dir)).toBe(false);
    expect(store.load('main')).toEqual({ kind: 'none' });
  });

  it('session end writes each window to its own versioned JSON file', () => {
    const store = new SessionDraftStore({ dir, now: () => new Date('2026-10-28T09:00:00Z') });
    store.report('main', [wizard]);
    store.report('sticky', [review]);
    store.writeAll();
    expect(readdirSync(dir).sort()).toEqual(['main.json', 'sticky.json']);
    const main = JSON.parse(readFileSync(join(dir, 'main.json'), 'utf8'));
    expect(main).toEqual({
      version: 1,
      window: 'main',
      savedAt: '2026-10-28T09:00:00.000Z',
      rows: [wizard],
    });
    expect(store.load('sticky')).toEqual({ kind: 'ok', rows: [review] });
  });

  it('writes atomically: a temp file renamed over the draft', () => {
    const calls: string[] = [];
    const spyFs = {
      ...fs,
      writeFileSync: ((path: string, ...rest: unknown[]) => {
        calls.push(`write ${path.split('/').pop()}`);
        return (fs.writeFileSync as (...a: unknown[]) => void)(path, ...rest);
      }) as typeof fs.writeFileSync,
      renameSync: ((from: string, to: string) => {
        calls.push(`rename ${from.split('/').pop()} → ${to.split('/').pop()}`);
        return fs.renameSync(from, to);
      }) as typeof fs.renameSync,
    };
    const store = new SessionDraftStore({ dir, fs: spyFs });
    store.report('main', [wizard]);
    store.writeAll();
    expect(calls).toEqual(['write main.json.tmp', 'rename main.json.tmp → main.json']);
    expect(existsSync(join(dir, 'main.json.tmp'))).toBe(false);
  });

  it('in-memory database mode (dir null): nothing is kept or written', () => {
    const store = new SessionDraftStore({ dir: null });
    expect(store.enabled).toBe(false);
    store.report('main', [wizard]);
    store.writeAll();
    expect(existsSync(dir)).toBe(false);
    expect(store.load('main')).toEqual({ kind: 'none' });
  });

  it('corrupt draft: renamed to .corrupt, logged, nothing offered', () => {
    fs.mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'sticky.json'), '{"version":1,"window":"sticky","rows":[{', 'utf8');
    const error = jest.spyOn(Logger, 'error').mockImplementation(() => undefined);
    const store = new SessionDraftStore({ dir });
    expect(store.load('sticky')).toEqual({ kind: 'corrupt' });
    expect(existsSync(join(dir, 'sticky.json'))).toBe(false);
    expect(existsSync(join(dir, 'sticky.json.corrupt'))).toBe(true);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('[drafts] The draft file cannot be read'),
      'sticky',
      expect.anything(),
    );
  });

  it('a file that parses but fails validation is treated the same (zod)', () => {
    fs.mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'main.json'), JSON.stringify({ version: 9, rows: [] }), 'utf8');
    jest.spyOn(Logger, 'error').mockImplementation(() => undefined);
    expect(new SessionDraftStore({ dir }).load('main')).toEqual({ kind: 'corrupt' });
    expect(existsSync(join(dir, 'main.json.corrupt'))).toBe(true);
  });

  it('settle drops rows by key, and the file goes with the last row (放弃 = all)', () => {
    const store = new SessionDraftStore({ dir });
    store.report('sticky', [review]);
    store.report('main', [wizard]);
    store.writeAll();
    expect(store.settle('sticky', { keys: ['review:o1'] })).toBe(0);
    expect(existsSync(join(dir, 'sticky.json'))).toBe(false);
    expect(store.settle('main', { all: true })).toBe(0);
    expect(existsSync(join(dir, 'main.json'))).toBe(false);
  });

  it('a later session end keeps rows still on disk unless the same spot is newer', () => {
    const first = new SessionDraftStore({ dir });
    first.report('sticky', [review]);
    first.writeAll();
    const second = new SessionDraftStore({ dir });
    const newer: DraftRow = { ...review, draft: { ...review.draft, wentWell: '更新' } };
    second.report('sticky', [newer]);
    second.writeAll();
    expect(second.load('sticky')).toEqual({ kind: 'ok', rows: [newer] });
  });
});
