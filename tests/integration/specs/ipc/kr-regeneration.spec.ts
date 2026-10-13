import { jest } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { IPC_CHANNELS, type IpcResult, type RegenerateKrsReply } from '@clarityokr/contracts';

import { Logger } from '../../../../app/main/src/core/logger.js';
import type { ExportService } from '../../../../app/main/src/export/export-service.js';
import { registerClosedLoopHandlers } from '../../../../app/main/src/ipc/closed-loop-handlers.js';
import { OkrStore, applySchema } from '../../../../app/main/src/persistence/okr-store/index.js';
import { KrRegenerationService } from '../../../../app/main/src/regenerate/kr-regeneration.service.js';

type Handler = (event: unknown, payload?: unknown) => unknown;

function setup(generate: (ctx: unknown) => Promise<unknown>) {
  const dir = mkdtempSync(join(tmpdir(), 'okr-regen-'));
  const db = new BetterSqlite3(join(dir, 'clarityokr.db'));
  applySchema(db);
  const store = new OkrStore(db);
  store.syncObjective({
    id: 'okr',
    title: '目标',
    sourceSessionId: null,
    keyResults: [
      { id: 'a', statement: 'A', successMetric: 'ma' },
      { id: 'b', statement: 'B', successMetric: 'mb' },
      { id: 'c', statement: 'C', successMetric: 'mc' },
    ],
  });
  store.setProgress('a', { value: 40, status: 'in_progress' });
  const changed = jest.fn();
  let n = 0;
  const generateMock = jest.fn(generate);
  const service = new KrRegenerationService({
    store,
    turnsFor: async () => [],
    generate: generateMock,
    newId: () => `new-${++n}`,
    changed,
  });
  const handlers = new Map<string, Handler>();
  registerClosedLoopHandlers({ handle: (c: string, h: Handler) => handlers.set(c, h) } as never, {
    store,
    exportService: {} as ExportService,
    clipboard: { writeText: jest.fn() },
    regenerate: (r) => service.regenerate(r),
  });
  const invoke = async (payload: unknown) =>
    (await handlers.get(IPC_CHANNELS.OKR_REGENERATE_KRS)!(
      {},
      payload,
    )) as IpcResult<RegenerateKrsReply>;
  return { dir, db, store, changed, generate: generateMock, invoke };
}

const draft = (krs: Array<{ id?: string; statement: string }>) => ({
  draft: {
    objectives: [
      { id: 'o', keyResults: krs.map((k) => ({ ...k, target: '1', measurement: '次' })) },
    ],
  },
});

describe('okr:regenerate-krs (spec §3.7)', () => {
  let ctx: ReturnType<typeof setup>;
  beforeAll(() => {
    jest.spyOn(Logger, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    ctx.db.close();
    rmSync(ctx.dir, { recursive: true, force: true });
  });

  it('full, ids back: text and metric replaced, progress and status kept', async () => {
    ctx = setup(async () =>
      draft([
        { id: 'a', statement: 'A2' },
        { id: 'b', statement: 'B2' },
        { id: 'c', statement: 'C2' },
      ]),
    );
    const reply = await ctx.invoke({ okrId: 'okr' });
    expect(reply.ok).toBe(true);
    if (!reply.ok) return;
    expect(reply.data.summary.outcome).toBe('updated');
    const a = reply.data.detail.objective.keyResults.find((k) => k.id === 'a')!;
    expect(a).toMatchObject({
      statement: 'A2',
      successMetric: '1 次',
      progress: 40,
      status: 'in_progress',
    });
    expect(ctx.changed).toHaveBeenCalledTimes(1);
    // the existing key results were sent so the model can return their ids
    expect(ctx.generate.mock.calls[0]![0]).toMatchObject({
      existingKeyResults: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    });
  });

  it('id missing: new one added (not started, no progress), unmatched marked removed', async () => {
    ctx = setup(async () =>
      draft([{ id: 'a', statement: 'A' }, { statement: 'N' }, { id: 'b', statement: 'B' }]),
    );
    const reply = await ctx.invoke({ okrId: 'okr' });
    if (!reply.ok) throw new Error('failed');
    expect(reply.data.summary).toMatchObject({
      outcome: 'changed',
      added: 1,
      removed: 1,
      missingIds: 1,
    });
    const krs = reply.data.detail.objective.keyResults;
    expect(krs.find((k) => k.id === 'c')!.removedAt).not.toBeNull();
    expect(krs.find((k) => k.id === 'new-1')).toMatchObject({
      progress: null,
      status: 'not_started',
    });
  });

  it('partial: only the selection is sent and changed', async () => {
    ctx = setup(async () =>
      draft([
        { id: 'b', statement: 'B2' },
        { id: 'a', statement: 'NO' },
      ]),
    );
    const reply = await ctx.invoke({ okrId: 'okr', krIds: ['b'] });
    if (!reply.ok) throw new Error('failed');
    expect(ctx.generate.mock.calls[0]![0]).toMatchObject({ existingKeyResults: [{ id: 'b' }] });
    expect(reply.data.summary.outcome).toBe('partial_updated');
    const texts = reply.data.detail.objective.keyResults.map((k) => k.statement);
    expect(texts).toEqual(['A', 'B2', 'C']);
  });

  it.each([
    ['the model throws', async () => Promise.reject(new Error('net /path'))],
    ['an unusable reply', async () => ({ nope: true })],
  ])('failure (%s): REGENERATE_FAILED, nothing changed, no raw error', async (_name, gen) => {
    ctx = setup(gen as () => Promise<unknown>);
    const reply = await ctx.invoke({ okrId: 'okr' });
    expect(reply.ok).toBe(false);
    if (reply.ok) return;
    expect(reply.error.code).toBe('REGENERATE_FAILED');
    expect(reply.error.message).not.toContain('/path');
    expect(ctx.store.getObjective('okr')!.keyResults.map((k) => k.statement)).toEqual([
      'A',
      'B',
      'C',
    ]);
    expect(ctx.changed).not.toHaveBeenCalled();
  });

  it('validation: unknown OKR / key result, removed key result, bad krIds', async () => {
    ctx = setup(async () => draft([{ id: 'a', statement: 'A' }]));
    expect((await ctx.invoke({ okrId: 'nope' })).ok).toBe(false);
    const unknownKr = await ctx.invoke({ okrId: 'okr', krIds: ['zzz'] });
    expect(!unknownKr.ok && unknownKr.error.code).toBe('NOT_FOUND');
    const empty = await ctx.invoke({ okrId: 'okr', krIds: [] });
    expect(!empty.ok && empty.error.code).toBe('INVALID_REQUEST');
    const extra = await ctx.invoke({ okrId: 'okr', policy: 'x' });
    expect(!extra.ok && extra.error.reason).toBe('unknown_field');
    await ctx.invoke({ okrId: 'okr' }); // b and c are removed now
    const removed = await ctx.invoke({ okrId: 'okr', krIds: ['b'] });
    expect(!removed.ok && removed.error.code).toBe('KEY_RESULT_REMOVED');
    expect(ctx.generate).toHaveBeenCalledTimes(1);
  });

  it('a second request for the same OKR while one runs is refused', async () => {
    let release: (v: unknown) => void = () => undefined;
    ctx = setup(() => new Promise((r) => (release = r)));
    const first = ctx.invoke({ okrId: 'okr' });
    await new Promise((r) => setTimeout(r, 0));
    const second = await ctx.invoke({ okrId: 'okr' });
    expect(!second.ok && second.error.code).toBe('INVALID_REQUEST');
    release(
      draft([
        { id: 'a', statement: 'A' },
        { id: 'b', statement: 'B' },
        { id: 'c', statement: 'C' },
      ]),
    );
    expect((await first).ok).toBe(true);
  });
});
