import { jest } from '@jest/globals';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type { Database } from 'better-sqlite3';
import { ALLOWED_CHANNELS, IPC_CHANNELS, type IpcResult } from '@clarityokr/contracts';
import { ExportService } from '../../../../app/main/src/export/export-service.js';
import { registerClosedLoopHandlers } from '../../../../app/main/src/ipc/closed-loop-handlers.js';
import { AppRestartService } from '../../../../app/main/src/lifecycle/restart-service.js';
import { OkrStore, applySchema } from '../../../../app/main/src/persistence/okr-store/index.js';
import { loadExportSource } from '../../../../app/main/src/startup/closed-loop.js';

const CLOSED_LOOP_CHANNELS = [
  IPC_CHANNELS.OKR_LIST,
  IPC_CHANNELS.OKR_OPEN,
  IPC_CHANNELS.OKR_PIN,
  IPC_CHANNELS.OKR_SET_PERIOD,
  IPC_CHANNELS.KR_SET_PROGRESS,
  IPC_CHANNELS.KR_REVERT_PROGRESS,
  IPC_CHANNELS.KR_REPLACE_PROGRESS,
  IPC_CHANNELS.REVIEW_GET,
  IPC_CHANNELS.REVIEW_SAVE,
  IPC_CHANNELS.EXPORT_SAVE,
  IPC_CHANNELS.EXPORT_REVEAL,
  IPC_CHANNELS.APP_RESTART,
];

const T0 = '2026-10-11T00:00:00.000Z';
const T1 = '2026-10-11T01:00:00.000Z';
const T2 = '2026-10-11T02:00:00.000Z';
const FAMILY = '👨‍👩‍👧‍👦';

type Handler = (event: unknown, payload?: unknown) => unknown;

class FakeIpcMain {
  readonly handlers = new Map<string, Handler>();
  handle(channel: string, handler: Handler): void {
    if (this.handlers.has(channel)) throw new Error(`duplicate handler: ${channel}`);
    this.handlers.set(channel, handler);
  }
  async invoke<T = unknown>(channel: string, payload?: unknown): Promise<IpcResult<T>> {
    const handler = this.handlers.get(channel);
    if (!handler) throw new Error(`no handler: ${channel}`);
    return (await handler({}, payload)) as IpcResult<T>;
  }
}

interface Harness {
  dir: string;
  db: Database;
  store: OkrStore;
  ipc: FakeIpcMain;
  setNow: (iso: string) => void;
  relaunch: ReturnType<typeof jest.fn>;
  showSaveDialog: ReturnType<typeof jest.fn>;
  showItemInFolder: ReturnType<typeof jest.fn>;
  setStorageMode: (mode: 'normal' | 'fresh-file' | 'memory') => void;
}

function createHarness(): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'okr-ipc-'));
  const db = new BetterSqlite3(join(dir, 'clarityokr.db'));
  applySchema(db);
  let now = new Date(T0);
  const store = new OkrStore(db, () => now);
  let storageMode: 'normal' | 'fresh-file' | 'memory' = 'normal';
  const relaunch = jest.fn();
  const showSaveDialog = jest.fn();
  const showItemInFolder = jest.fn();
  const exportService = new ExportService({
    loadSource: (id) => loadExportSource(store, id),
    showSaveDialog,
    showItemInFolder,
    getDownloadsDir: () => dir,
    now: () => new Date(2026, 9, 11, 12, 0, 0),
  });
  const restartService = new AppRestartService({
    getStorageMode: () => storageMode,
    dbHasData: () => store.hasAnyData(),
    relaunch,
  });
  const ipc = new FakeIpcMain();
  registerClosedLoopHandlers(ipc as never, { store, exportService, restartService });
  return {
    dir,
    db,
    store,
    ipc,
    setNow: (iso) => {
      now = new Date(iso);
    },
    relaunch,
    showSaveDialog,
    showItemInFolder,
    setStorageMode: (mode) => {
      storageMode = mode;
    },
  };
}

function expectFailure(
  result: IpcResult<unknown>,
  code: string,
  extra: { field?: string; reason?: string } = {},
): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe(code);
  expect(typeof result.error.message).toBe('string');
  expect(result.error.message.length).toBeGreaterThan(0);
  if (extra.field !== undefined) expect(result.error.field).toBe(extra.field);
  if (extra.reason !== undefined) expect(result.error.reason).toBe(extra.reason);
  // Only these keys may appear in an error.
  expect(
    Object.keys(result.error).every((k) => ['code', 'message', 'field', 'reason'].includes(k)),
  ).toBe(true);
}

describe('closed-loop IPC handlers (real OkrStore on a temp database)', () => {
  let h: Harness;
  beforeEach(() => {
    h = createHarness();
  });
  afterEach(() => {
    h.db.close();
    rmSync(h.dir, { recursive: true, force: true });
  });

  const create = (title = 'Ship the closed loop') =>
    h.store.createObjective({
      title,
      keyResults: [
        { id: 'kr-a', statement: 'Write progress UI', successMetric: 'all screens' },
        { id: 'kr-b', statement: 'Add review view' },
      ],
    });

  describe('registration and whitelist', () => {
    it('registers exactly the closed-loop channels and each one is whitelisted', () => {
      for (const channel of CLOSED_LOOP_CHANNELS) {
        expect(ALLOWED_CHANNELS).toContain(channel);
        expect(h.ipc.handlers.has(channel)).toBe(true);
      }
      expect([...h.ipc.handlers.keys()].sort()).toEqual([...CLOSED_LOOP_CHANNELS].sort());
    });
  });

  describe('clarityokr:okr:list', () => {
    it('is empty for an empty database', async () => {
      expect(await h.ipc.invoke(IPC_CHANNELS.OKR_LIST)).toEqual({ ok: true, data: { items: [] } });
    });

    it('lists by updated_at descending, ignores the payload, and carries no path or session data', async () => {
      const older = create('Older');
      h.setNow(T1);
      const newer = h.store.createObjective({
        title: 'Newer',
        keyResults: [{ statement: 'n' }, { statement: 'm' }],
      });
      h.setNow(T2);
      h.store.setProgress('kr-a', { value: 50, status: 'in_progress' });
      const result = await h.ipc.invoke<{ items: Array<{ id: string }> }>(IPC_CHANNELS.OKR_LIST, {
        path: '/etc/passwd',
        sort: 'title',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // kr-a belongs to the objective created first ("Older"), whose progress write at T2 moved it up.
      expect(result.data.items.map((i) => i.id)).toEqual([older.id, newer.id]);
      expect(result.data.items[0]).toEqual({
        id: older.id,
        title: 'Older',
        period: null,
        pinned: false,
        createdAt: T0,
        updatedAt: T2,
        overallProgress: 50,
        keyResultCount: 2,
        filledKeyResultCount: 1,
        allDone: false,
        reviewed: false,
      });
    });
  });

  describe('clarityokr:okr:open', () => {
    it('returns the OKR with removed key results, progress summaries and the review', async () => {
      const okr = create();
      h.store.setProgress('kr-a', { value: 40, status: 'in_progress' });
      h.store.setProgress('kr-a', { value: 65, status: 'at_risk' });
      h.store.markKeyResultRemoved('kr-b');
      h.store.saveReview(okr.id, { wentWell: 'good', fellShort: '', nextSteps: '' });

      const result = await h.ipc.invoke<{
        objective: { id: string; keyResults: Array<{ id: string; removedAt: string | null }> };
        progress: Record<
          string,
          { canRevert: boolean; before: unknown; latest: { value: number } | null }
        >;
        review: { wentWell: string; snapshot: unknown[] } | null;
      }>(IPC_CHANNELS.OKR_OPEN, { okrId: okr.id });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data.objective.keyResults.map((k) => k.id)).toEqual(['kr-a', 'kr-b']);
      expect(result.data.objective.keyResults[1]!.removedAt).not.toBeNull();
      expect(result.data.progress['kr-a']).toMatchObject({
        canRevert: true,
        before: { value: 40, status: 'in_progress' },
        latest: { value: 65 },
      });
      expect(result.data.progress['kr-b']).toEqual({
        latest: null,
        before: null,
        canRevert: false,
      });
      expect(result.data.review?.wentWell).toBe('good');
      expect(result.data.review?.snapshot).toHaveLength(2);
    });

    it('rejects an unknown id with NOT_FOUND', async () => {
      expectFailure(await h.ipc.invoke(IPC_CHANNELS.OKR_OPEN, { okrId: 'missing' }), 'NOT_FOUND');
    });

    it.each([
      [undefined, 'payload', 'wrong_type'],
      [null, 'payload', 'wrong_type'],
      ['id', 'payload', 'wrong_type'],
      [[], 'payload', 'wrong_type'],
      [{}, 'okrId', 'missing'],
      [{ okrId: 5 }, 'okrId', 'wrong_type'],
      [{ okrId: '' }, 'okrId', 'empty'],
      [{ okrId: '   ' }, 'okrId', 'empty'],
      [{ okrId: 'x'.repeat(129) }, 'okrId', 'too_long'],
      [{ okrId: 'a', extra: 1 }, 'extra', 'unknown_field'],
    ])('rejects payload %j', async (payload, field, reason) => {
      expectFailure(await h.ipc.invoke(IPC_CHANNELS.OKR_OPEN, payload), 'INVALID_REQUEST', {
        field,
        reason,
      });
    });
  });

  describe('clarityokr:okr:pin', () => {
    it('pins one OKR and unpins the previous one without touching updated_at', async () => {
      const first = create('First');
      const second = h.store.createObjective({ title: 'Second', keyResults: [{ statement: 'x' }] });
      h.setNow(T1);
      expect(await h.ipc.invoke(IPC_CHANNELS.OKR_PIN, { okrId: first.id })).toEqual({
        ok: true,
        data: { okrId: first.id, pinned: true },
      });
      await h.ipc.invoke(IPC_CHANNELS.OKR_PIN, { okrId: second.id });
      const pinned = h.store.listObjectives().filter((o) => o.pinned);
      expect(pinned.map((o) => o.id)).toEqual([second.id]);
      expect(h.store.getObjective(first.id)!.updatedAt).toBe(T0);
    });

    it('rejects unknown ids, wrong types and extra fields', async () => {
      expectFailure(await h.ipc.invoke(IPC_CHANNELS.OKR_PIN, { okrId: 'missing' }), 'NOT_FOUND');
      expectFailure(await h.ipc.invoke(IPC_CHANNELS.OKR_PIN, { okrId: 1 }), 'INVALID_REQUEST', {
        field: 'okrId',
        reason: 'wrong_type',
      });
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.OKR_PIN, { okrId: 'a', pinned: false }),
        'INVALID_REQUEST',
        { field: 'pinned', reason: 'unknown_field' },
      );
      expect(h.store.listObjectives().filter((o) => o.pinned)).toEqual([]);
    });
  });

  describe('clarityokr:okr:set-period', () => {
    it('sets and clears the quarter, bumping updated_at', async () => {
      const okr = create();
      h.setNow(T1);
      expect(
        await h.ipc.invoke(IPC_CHANNELS.OKR_SET_PERIOD, { okrId: okr.id, period: '2026-Q4' }),
      ).toEqual({
        ok: true,
        data: { okrId: okr.id, period: '2026-Q4', updatedAt: T1 },
      });
      h.setNow(T2);
      expect(
        await h.ipc.invoke(IPC_CHANNELS.OKR_SET_PERIOD, { okrId: okr.id, period: null }),
      ).toEqual({
        ok: true,
        data: { okrId: okr.id, period: null, updatedAt: T2 },
      });
      expect(h.store.getObjective(okr.id)!.period).toBeNull();
    });

    it.each([
      [{ okrId: 'a' }, 'period', 'missing'],
      [{ okrId: 'a', period: 2026 }, 'period', 'wrong_type'],
      [{ okrId: 'a', period: '2026-Q5' }, 'period', 'invalid_value'],
      [{ okrId: 'a', period: '2026-Q0' }, 'period', 'invalid_value'],
      [{ okrId: 'a', period: '2026Q4' }, 'period', 'invalid_value'],
      [{ okrId: 'a', period: '26-Q4' }, 'period', 'invalid_value'],
      [{ okrId: 'a', period: '' }, 'period', 'invalid_value'],
      [{ okrId: 'a', period: '2026-Q4', x: 1 }, 'x', 'unknown_field'],
    ])('rejects %j', async (payload, field, reason) => {
      expectFailure(await h.ipc.invoke(IPC_CHANNELS.OKR_SET_PERIOD, payload), 'INVALID_REQUEST', {
        field,
        reason,
      });
    });

    it('rejects an unknown id', async () => {
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.OKR_SET_PERIOD, { okrId: 'missing', period: '2026-Q4' }),
        'NOT_FOUND',
      );
    });
  });

  describe('clarityokr:kr:set-progress', () => {
    it('writes value and status together, records a set entry, and survives a restart', async () => {
      const okr = create();
      const result = await h.ipc.invoke<{
        changed: boolean;
        keyResult: { progress: number; status: string };
        overallProgress: number;
        progress: { latest: { kind: string; value: number; status: string }; canRevert: boolean };
      }>(IPC_CHANNELS.KR_SET_PROGRESS, { krId: 'kr-a', value: 65, status: 'in_progress' });
      expect(result).toMatchObject({
        ok: true,
        data: {
          changed: true,
          keyResult: { progress: 65, status: 'in_progress' },
          overallProgress: 65,
          progress: { latest: { kind: 'set', value: 65, status: 'in_progress' }, canRevert: true },
        },
      });

      // "Restart": a brand new connection and store on the same file.
      h.db.close();
      const reopened = new BetterSqlite3(join(h.dir, 'clarityokr.db'));
      applySchema(reopened);
      const store2 = new OkrStore(reopened);
      expect(store2.getObjective(okr.id)!.keyResults[0]).toMatchObject({
        progress: 65,
        status: 'in_progress',
      });
      expect(store2.listProgressEntries('kr-a')).toHaveLength(1);
      reopened.close();
      h.db = new BetterSqlite3(':memory:'); // afterEach closes this
    });

    it('accepts 0 and 100 and null (clear), each as one entry', async () => {
      create();
      for (const value of [0, 100, null]) {
        const r = await h.ipc.invoke(IPC_CHANNELS.KR_SET_PROGRESS, {
          krId: 'kr-a',
          value,
          status: 'done',
        });
        expect(r.ok).toBe(true);
      }
      expect(h.store.listProgressEntries('kr-a').map((e) => e.value)).toEqual([0, 100, null]);
      expect(h.store.findKeyResult('kr-a')!.progress).toBeNull();
    });

    it('a status-only change keeps the value and still writes an entry (value copied)', async () => {
      create();
      h.store.setProgress('kr-a', { value: 40, status: 'in_progress' });
      const r = await h.ipc.invoke(IPC_CHANNELS.KR_SET_PROGRESS, {
        krId: 'kr-a',
        status: 'at_risk',
      });
      expect(r).toMatchObject({
        ok: true,
        data: { changed: true, keyResult: { progress: 40, status: 'at_risk' } },
      });
      expect(h.store.listProgressEntries('kr-a').map((e) => [e.value, e.status])).toEqual([
        [40, 'in_progress'],
        [40, 'at_risk'],
      ]);
    });

    it('writes nothing when value and status already match (changed:false)', async () => {
      create();
      h.store.setProgress('kr-a', { value: 40, status: 'in_progress' });
      const r = await h.ipc.invoke(IPC_CHANNELS.KR_SET_PROGRESS, {
        krId: 'kr-a',
        value: 40,
        status: 'in_progress',
      });
      expect(r).toMatchObject({ ok: true, data: { changed: false } });
      expect(h.store.listProgressEntries('kr-a')).toHaveLength(1);
    });

    it.each([
      [-1, 'below_min'],
      [-100, 'below_min'],
      [101, 'above_max'],
      [1000, 'above_max'],
      [12.5, 'not_integer'],
      [Number.NaN, 'not_integer'],
      [Number.POSITIVE_INFINITY, 'not_integer'],
      ['50', 'wrong_type'],
      ['abc', 'wrong_type'],
      [true, 'wrong_type'],
      [{}, 'wrong_type'],
    ])('rejects out-of-range or non-numeric progress %p', async (value, reason) => {
      create();
      const before = h.store.listProgressEntries('kr-a');
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.KR_SET_PROGRESS, { krId: 'kr-a', value, status: 'done' }),
        'INVALID_REQUEST',
        { field: 'value', reason },
      );
      expect(h.store.listProgressEntries('kr-a')).toEqual(before);
    });

    it.each([
      [{ value: 5, status: 'done' }, 'krId', 'missing'],
      [{ krId: 'kr-a', value: 5 }, 'status', 'missing'],
      [{ krId: 'kr-a', value: 5, status: 'unset' }, 'status', 'invalid_value'],
      [{ krId: 'kr-a', value: 5, status: 3 }, 'status', 'wrong_type'],
      [{ krId: 'kr-a', value: 5, status: 'done', owner: 'me' }, 'owner', 'unknown_field'],
      [{ krId: 7, value: 5, status: 'done' }, 'krId', 'wrong_type'],
    ])('rejects %j', async (payload, field, reason) => {
      expectFailure(await h.ipc.invoke(IPC_CHANNELS.KR_SET_PROGRESS, payload), 'INVALID_REQUEST', {
        field,
        reason,
      });
    });

    it('rejects unknown ids with NOT_FOUND and removed key results with KEY_RESULT_REMOVED', async () => {
      create();
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.KR_SET_PROGRESS, {
          krId: 'nope',
          value: 1,
          status: 'done',
        }),
        'NOT_FOUND',
      );
      h.store.markKeyResultRemoved('kr-b');
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.KR_SET_PROGRESS, {
          krId: 'kr-b',
          value: 1,
          status: 'done',
        }),
        'KEY_RESULT_REMOVED',
      );
      expect(h.store.listProgressEntries('kr-b')).toEqual([]);
    });
  });

  describe('clarityokr:kr:revert-progress', () => {
    it('appends a revert and restores value AND status of the previous entry', async () => {
      create();
      h.store.setProgress('kr-a', { value: 70, status: 'at_risk' });
      h.store.setProgress('kr-a', { value: 100, status: 'done' });
      const r = await h.ipc.invoke<{
        keyResult: { progress: number; status: string };
        progress: { latest: { kind: string }; canRevert: boolean };
      }>(IPC_CHANNELS.KR_REVERT_PROGRESS, { krId: 'kr-a' });
      expect(r).toMatchObject({
        ok: true,
        data: {
          keyResult: { progress: 70, status: 'at_risk' },
          progress: { latest: { kind: 'revert' }, canRevert: false },
        },
      });
      expect(h.store.listProgressEntries('kr-a').map((e) => e.kind)).toEqual([
        'set',
        'set',
        'revert',
      ]);
    });

    it('rejects NOTHING_TO_REVERT, LATEST_IS_REVERT, removed and unknown key results', async () => {
      create();
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.KR_REVERT_PROGRESS, { krId: 'kr-a' }),
        'NOTHING_TO_REVERT',
      );
      h.store.setProgress('kr-a', { value: 10, status: 'in_progress' });
      await h.ipc.invoke(IPC_CHANNELS.KR_REVERT_PROGRESS, { krId: 'kr-a' });
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.KR_REVERT_PROGRESS, { krId: 'kr-a' }),
        'LATEST_IS_REVERT',
      );
      expect(h.store.listProgressEntries('kr-a')).toHaveLength(2);
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.KR_REVERT_PROGRESS, { krId: 'nope' }),
        'NOT_FOUND',
      );
      h.store.setProgress('kr-b', { value: 10, status: 'in_progress' });
      h.store.markKeyResultRemoved('kr-b');
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.KR_REVERT_PROGRESS, { krId: 'kr-b' }),
        'KEY_RESULT_REMOVED',
      );
    });

    it('each key result is independent', async () => {
      create();
      h.store.setProgress('kr-a', { value: 10, status: 'in_progress' });
      h.store.setProgress('kr-b', { value: 20, status: 'in_progress' });
      await h.ipc.invoke(IPC_CHANNELS.KR_REVERT_PROGRESS, { krId: 'kr-a' });
      expect(await h.ipc.invoke(IPC_CHANNELS.KR_REVERT_PROGRESS, { krId: 'kr-b' })).toMatchObject({
        ok: true,
      });
    });

    it('rejects bad payloads', async () => {
      expectFailure(await h.ipc.invoke(IPC_CHANNELS.KR_REVERT_PROGRESS, {}), 'INVALID_REQUEST', {
        field: 'krId',
        reason: 'missing',
      });
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.KR_REVERT_PROGRESS, { krId: 'a', force: true }),
        'INVALID_REQUEST',
        { field: 'force', reason: 'unknown_field' },
      );
    });
  });

  describe('clarityokr:kr:replace-progress ("edit this one")', () => {
    it('reverts the latest set and writes the new value in one step (two entries)', async () => {
      create();
      h.store.setProgress('kr-a', { value: 30, status: 'in_progress' });
      h.store.setProgress('kr-a', { value: 90, status: 'in_progress' });
      const r = await h.ipc.invoke(IPC_CHANNELS.KR_REPLACE_PROGRESS, { krId: 'kr-a', value: 80 });
      expect(r).toMatchObject({
        ok: true,
        data: { changed: true, keyResult: { progress: 80, status: 'in_progress' } },
      });
      expect(h.store.listProgressEntries('kr-a').map((e) => [e.kind, e.value])).toEqual([
        ['set', 30],
        ['set', 90],
        ['revert', 30],
        ['set', 80],
      ]);
    });

    it('can change the status and clear the value', async () => {
      create();
      h.store.setProgress('kr-a', { value: 30, status: 'in_progress' });
      await h.ipc.invoke(IPC_CHANNELS.KR_REPLACE_PROGRESS, {
        krId: 'kr-a',
        value: null,
        status: 'at_risk',
      });
      expect(h.store.findKeyResult('kr-a')).toMatchObject({ progress: null, status: 'at_risk' });
    });

    it('writes nothing when the new value equals the current one', async () => {
      create();
      h.store.setProgress('kr-a', { value: 30, status: 'in_progress' });
      const r = await h.ipc.invoke(IPC_CHANNELS.KR_REPLACE_PROGRESS, { krId: 'kr-a', value: 30 });
      expect(r).toMatchObject({ ok: true, data: { changed: false } });
      expect(h.store.listProgressEntries('kr-a')).toHaveLength(1);
    });

    it('is atomic: when the new write fails the revert is rolled back and nothing leaks', async () => {
      create();
      h.store.setProgress('kr-a', { value: 20, status: 'in_progress' });
      const entriesBefore = h.store.listProgressEntries('kr-a');
      const krBefore = h.store.findKeyResult('kr-a');
      h.db.exec(`
        CREATE TRIGGER fail_new_set BEFORE INSERT ON progress_entries
        WHEN NEW.kind = 'set' AND NEW.value = 77
        BEGIN SELECT RAISE(ABORT, 'simulated write failure at /secret/path'); END;
      `);
      const r = await h.ipc.invoke(IPC_CHANNELS.KR_REPLACE_PROGRESS, { krId: 'kr-a', value: 77 });
      expectFailure(r, 'INTERNAL');
      if (!r.ok) {
        expect(JSON.stringify(r)).not.toContain('/secret/path');
        expect(JSON.stringify(r)).not.toContain('simulated');
      }
      expect(h.store.listProgressEntries('kr-a')).toEqual(entriesBefore);
      expect(h.store.findKeyResult('kr-a')).toEqual(krBefore);
    });

    it('rejects: no entry, latest is a revert, removed, unknown, bad payloads', async () => {
      create();
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.KR_REPLACE_PROGRESS, { krId: 'kr-a', value: 1 }),
        'NOTHING_TO_REVERT',
      );
      h.store.setProgress('kr-a', { value: 10, status: 'in_progress' });
      h.store.revertLastProgress('kr-a');
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.KR_REPLACE_PROGRESS, { krId: 'kr-a', value: 1 }),
        'LATEST_IS_REVERT',
      );
      h.store.setProgress('kr-b', { value: 10, status: 'in_progress' });
      h.store.markKeyResultRemoved('kr-b');
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.KR_REPLACE_PROGRESS, { krId: 'kr-b', value: 1 }),
        'KEY_RESULT_REMOVED',
      );
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.KR_REPLACE_PROGRESS, { krId: 'nope', value: 1 }),
        'NOT_FOUND',
      );
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.KR_REPLACE_PROGRESS, { krId: 'kr-a' }),
        'INVALID_REQUEST',
        {
          field: 'value',
          reason: 'missing',
        },
      );
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.KR_REPLACE_PROGRESS, { krId: 'kr-a', value: 101 }),
        'INVALID_REQUEST',
        { field: 'value', reason: 'above_max' },
      );
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.KR_REPLACE_PROGRESS, {
          krId: 'kr-a',
          value: 5,
          status: 'bad',
        }),
        'INVALID_REQUEST',
        { field: 'status', reason: 'invalid_value' },
      );
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.KR_REPLACE_PROGRESS, { krId: 'kr-a', value: 5, note: 'x' }),
        'INVALID_REQUEST',
        { field: 'note', reason: 'unknown_field' },
      );
    });
  });

  describe('review channels', () => {
    it('get returns null before the first save and the review after', async () => {
      const okr = create();
      expect(await h.ipc.invoke(IPC_CHANNELS.REVIEW_GET, { okrId: okr.id })).toEqual({
        ok: true,
        data: { review: null },
      });
      h.setNow(T1);
      const saved = await h.ipc.invoke<{ review: { wentWell: string; snapshotAt: string } }>(
        IPC_CHANNELS.REVIEW_SAVE,
        { okrId: okr.id, wentWell: 'shipped', fellShort: '', nextSteps: 'celebrate' },
      );
      expect(saved).toMatchObject({
        ok: true,
        data: { review: { wentWell: 'shipped', snapshotAt: T1 } },
      });
      expect(await h.ipc.invoke(IPC_CHANNELS.REVIEW_GET, { okrId: okr.id })).toEqual(saved);
    });

    it('re-saving edits the text but the snapshot does not drift, and persists a single review', async () => {
      const okr = create();
      h.store.setProgress('kr-a', { value: 40, status: 'in_progress' });
      await h.ipc.invoke(IPC_CHANNELS.REVIEW_SAVE, {
        okrId: okr.id,
        wentWell: 'v1',
        fellShort: '',
        nextSteps: '',
      });
      h.store.setProgress('kr-a', { value: 100, status: 'done' });
      h.setNow(T2);
      const second = await h.ipc.invoke<{
        review: {
          snapshot: Array<{ progress: number | null }>;
          savedAt: string;
          snapshotAt: string;
        };
      }>(IPC_CHANNELS.REVIEW_SAVE, { okrId: okr.id, wentWell: 'v2', fellShort: '', nextSteps: '' });
      expect(second.ok && second.data.review.snapshot[0]!.progress).toBe(40);
      expect(second.ok && second.data.review.snapshotAt).toBe(T0);
      expect(second.ok && second.data.review.savedAt).toBe(T2);
      expect((h.db.prepare('SELECT COUNT(*) AS n FROM reviews').get() as { n: number }).n).toBe(1);
    });

    it('rejects all-empty and whitespace-only reviews', async () => {
      const okr = create();
      for (const [a, b, c] of [
        ['', '', ''],
        [' ', '\n', '\t'],
      ]) {
        expectFailure(
          await h.ipc.invoke(IPC_CHANNELS.REVIEW_SAVE, {
            okrId: okr.id,
            wentWell: a,
            fellShort: b,
            nextSteps: c,
          }),
          'INVALID_REQUEST',
          { field: 'review', reason: 'empty' },
        );
      }
      expect(h.store.getReview(okr.id)).toBeNull();
    });

    it('enforces 2000 graphemes per section: exactly 2000 passes, 2001 fails, nothing is truncated', async () => {
      const okr = create();
      const ok = await h.ipc.invoke<{ review: { fellShort: string } }>(IPC_CHANNELS.REVIEW_SAVE, {
        okrId: okr.id,
        wentWell: 'x',
        fellShort: '😀'.repeat(2000),
        nextSteps: '',
      });
      expect(ok.ok && ok.data.review.fellShort).toBe('😀'.repeat(2000));
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.REVIEW_SAVE, {
          okrId: okr.id,
          wentWell: 'a'.repeat(2001),
          fellShort: '',
          nextSteps: '',
        }),
        'INVALID_REQUEST',
        { field: 'wentWell', reason: 'too_long' },
      );
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.REVIEW_SAVE, {
          okrId: okr.id,
          wentWell: 'x',
          fellShort: '',
          nextSteps: '😀'.repeat(2001),
        }),
        'INVALID_REQUEST',
        { field: 'nextSteps', reason: 'too_long' },
      );
      expect(h.store.getReview(okr.id)!.fellShort).toBe('😀'.repeat(2000));
    });

    it('accepts 200 ZWJ family emoji, rejects a character stacked with 40 combining marks', async () => {
      const okr = create();
      expect(
        (
          await h.ipc.invoke(IPC_CHANNELS.REVIEW_SAVE, {
            okrId: okr.id,
            wentWell: FAMILY.repeat(200),
            fellShort: '',
            nextSteps: '',
          })
        ).ok,
      ).toBe(true);
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.REVIEW_SAVE, {
          okrId: okr.id,
          wentWell: 'a' + '\u0301'.repeat(40),
          fellShort: '',
          nextSteps: '',
        }),
        'INVALID_REQUEST',
        { field: 'wentWell', reason: 'cluster_too_long' },
      );
    });

    it.each([
      [{ okrId: 'a', wentWell: 'x', fellShort: '' }, 'nextSteps', 'missing'],
      [{ okrId: 'a', wentWell: 5, fellShort: '', nextSteps: '' }, 'wentWell', 'wrong_type'],
      [{ okrId: 'a', wentWell: null, fellShort: '', nextSteps: '' }, 'wentWell', 'wrong_type'],
      [
        { okrId: 'a', wentWell: 'x', fellShort: '', nextSteps: '', draft: true },
        'draft',
        'unknown_field',
      ],
    ])('rejects %j', async (payload, field, reason) => {
      expectFailure(await h.ipc.invoke(IPC_CHANNELS.REVIEW_SAVE, payload), 'INVALID_REQUEST', {
        field,
        reason,
      });
    });

    it('rejects unknown okr ids for get and save', async () => {
      expectFailure(await h.ipc.invoke(IPC_CHANNELS.REVIEW_GET, { okrId: 'missing' }), 'NOT_FOUND');
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.REVIEW_SAVE, {
          okrId: 'missing',
          wentWell: 'x',
          fellShort: '',
          nextSteps: '',
        }),
        'NOT_FOUND',
      );
    });
  });

  describe('export channels', () => {
    it('saves Markdown through the injected dialog and returns the written path (only on success)', async () => {
      const okr = create();
      const target = join(h.dir, 'out.md');
      h.showSaveDialog.mockResolvedValue(target);
      const r = await h.ipc.invoke(IPC_CHANNELS.EXPORT_SAVE, { okrId: okr.id, format: 'md' });
      expect(r).toEqual({
        ok: true,
        data: { outcome: 'saved', format: 'md', fileName: 'out.md', path: target },
      });
      expect(readFileSync(target, 'utf8')).toContain('# Ship the closed loop');
    });

    it('reports `exists` (no path, nothing overwritten) when the appended extension collides', async () => {
      const okr = create();
      writeFileSync(join(h.dir, 'taken.md'), 'precious');
      h.showSaveDialog.mockResolvedValue(join(h.dir, 'taken'));
      const r = await h.ipc.invoke(IPC_CHANNELS.EXPORT_SAVE, { okrId: okr.id, format: 'md' });
      expect(r).toEqual({ ok: true, data: { outcome: 'failed', category: 'exists' } });
      expect(JSON.stringify(r)).not.toContain(h.dir);
      expect(readFileSync(join(h.dir, 'taken.md'), 'utf8')).toBe('precious');
    });

    it('saves JSON with schemaVersion 1', async () => {
      const okr = create();
      const target = join(h.dir, 'out.json');
      h.showSaveDialog.mockResolvedValue(target);
      await h.ipc.invoke(IPC_CHANNELS.EXPORT_SAVE, { okrId: okr.id, format: 'json' });
      expect(JSON.parse(readFileSync(target, 'utf8'))).toMatchObject({
        schemaVersion: 1,
        objective: { title: 'Ship the closed loop' },
      });
    });

    it('a cancelled dialog is a neutral outcome, not an error', async () => {
      const okr = create();
      h.showSaveDialog.mockResolvedValue(null);
      expect(await h.ipc.invoke(IPC_CHANNELS.EXPORT_SAVE, { okrId: okr.id, format: 'md' })).toEqual(
        {
          ok: true,
          data: { outcome: 'cancelled' },
        },
      );
    });

    it('a write failure is a categorised outcome that contains no path', async () => {
      const okr = create();
      h.showSaveDialog.mockResolvedValue(join(h.dir, 'missing-dir', 'out.md'));
      const r = await h.ipc.invoke(IPC_CHANNELS.EXPORT_SAVE, { okrId: okr.id, format: 'md' });
      expect(r).toEqual({ ok: true, data: { outcome: 'failed', category: 'not_found' } });
      expect(JSON.stringify(r)).not.toContain(h.dir);
    });

    it('rejects unknown ids, bad formats and extra fields without opening the dialog', async () => {
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.EXPORT_SAVE, { okrId: 'missing', format: 'md' }),
        'NOT_FOUND',
      );
      for (const [payload, field, reason] of [
        [{ okrId: 'a', format: 'pdf' }, 'format', 'invalid_value'],
        [{ okrId: 'a', format: 'MD' }, 'format', 'invalid_value'],
        [{ okrId: 'a', format: 1 }, 'format', 'wrong_type'],
        [{ okrId: 'a' }, 'format', 'missing'],
        [{ format: 'md' }, 'okrId', 'missing'],
        [{ okrId: 'a', format: 'md', path: '/tmp/x' }, 'path', 'unknown_field'],
      ] as const) {
        expectFailure(await h.ipc.invoke(IPC_CHANNELS.EXPORT_SAVE, payload), 'INVALID_REQUEST', {
          field,
          reason,
        });
      }
      expect(h.showSaveDialog).not.toHaveBeenCalled();
    });

    it('reveal accepts only the path of the last successful export', async () => {
      const okr = create();
      const first = join(h.dir, 'a.md');
      h.showSaveDialog.mockResolvedValueOnce(first);
      await h.ipc.invoke(IPC_CHANNELS.EXPORT_SAVE, { okrId: okr.id, format: 'md' });
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.EXPORT_REVEAL, { path: '/etc/passwd' }),
        'PATH_NOT_ALLOWED',
      );
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.EXPORT_REVEAL, { path: join(h.dir, 'other.md') }),
        'PATH_NOT_ALLOWED',
      );
      expect(h.showItemInFolder).not.toHaveBeenCalled();
      expect(await h.ipc.invoke(IPC_CHANNELS.EXPORT_REVEAL, { path: first })).toEqual({
        ok: true,
        data: { revealed: true },
      });
      expect(h.showItemInFolder).toHaveBeenCalledWith(first);

      // A newer export replaces the permission.
      const second = join(h.dir, 'b.md');
      h.showSaveDialog.mockResolvedValueOnce(second);
      await h.ipc.invoke(IPC_CHANNELS.EXPORT_SAVE, { okrId: okr.id, format: 'md' });
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.EXPORT_REVEAL, { path: first }),
        'PATH_NOT_ALLOWED',
      );
      expect((await h.ipc.invoke(IPC_CHANNELS.EXPORT_REVEAL, { path: second })).ok).toBe(true);
    });

    it('reveal rejects bad payloads and reports a failing file manager as INTERNAL without details', async () => {
      const okr = create();
      expectFailure(await h.ipc.invoke(IPC_CHANNELS.EXPORT_REVEAL, {}), 'INVALID_REQUEST', {
        field: 'path',
        reason: 'missing',
      });
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.EXPORT_REVEAL, { path: 5 }),
        'INVALID_REQUEST',
        { field: 'path', reason: 'wrong_type' },
      );
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.EXPORT_REVEAL, { path: '' }),
        'INVALID_REQUEST',
        { field: 'path', reason: 'empty' },
      );
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.EXPORT_REVEAL, { path: 'a'.repeat(5000) }),
        'INVALID_REQUEST',
        { field: 'path', reason: 'too_long' },
      );
      expectFailure(
        await h.ipc.invoke(IPC_CHANNELS.EXPORT_REVEAL, { path: 'a', extra: 1 }),
        'INVALID_REQUEST',
        { field: 'extra', reason: 'unknown_field' },
      );
      const target = join(h.dir, 'x.md');
      h.showSaveDialog.mockResolvedValueOnce(target);
      await h.ipc.invoke(IPC_CHANNELS.EXPORT_SAVE, { okrId: okr.id, format: 'md' });
      h.showItemInFolder.mockImplementation(() => {
        throw new Error(`cannot open ${target}`);
      });
      const r = await h.ipc.invoke(IPC_CHANNELS.EXPORT_REVEAL, { path: target });
      expect(r).toEqual({
        ok: false,
        error: { code: 'INTERNAL', message: 'Something went wrong' },
      });
    });
  });

  describe('clarityokr:app:restart (same confirmation rule as quit)', () => {
    const none = { wizard: false, textEdit: false, reviewDraft: false };

    it('restarts immediately in normal mode with nothing unsaved', async () => {
      create();
      expect(await h.ipc.invoke(IPC_CHANNELS.APP_RESTART, { unsaved: none })).toEqual({
        ok: true,
        data: { outcome: 'restarting' },
      });
      expect(h.relaunch).toHaveBeenCalledTimes(1);
    });

    it('a throwing relaunch is reported as relaunch_failed without leaking text, and later calls work', async () => {
      create();
      h.relaunch.mockImplementationOnce(() => {
        throw new Error(`boom ${h.dir}`);
      });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const r = await h.ipc.invoke(IPC_CHANNELS.APP_RESTART, { unsaved: none });
      expect(r).toEqual({ ok: true, data: { outcome: 'failed', category: 'relaunch_failed' } });
      expect(JSON.stringify(r)).not.toContain(h.dir);
      expect(await h.ipc.invoke(IPC_CHANNELS.APP_RESTART, { unsaved: none })).toEqual({
        ok: true,
        data: { outcome: 'restarting' },
      });
      expect(h.relaunch).toHaveBeenCalledTimes(2);
      errorSpy.mockRestore();
    });

    it('memory mode WITH data asks first, and relaunches only after confirmed:true', async () => {
      h.setStorageMode('memory');
      create();
      const first = await h.ipc.invoke<{
        outcome: string;
        confirmation: { reasons: string[]; memoryOnly: boolean };
      }>(IPC_CHANNELS.APP_RESTART, { unsaved: none });
      expect(first).toMatchObject({
        ok: true,
        data: {
          outcome: 'confirm_required',
          confirmation: { needsConfirm: true, reasons: ['memory_data'], memoryOnly: true },
        },
      });
      expect(h.relaunch).not.toHaveBeenCalled();
      expect(
        await h.ipc.invoke(IPC_CHANNELS.APP_RESTART, { unsaved: none, confirmed: true }),
      ).toEqual({
        ok: true,
        data: { outcome: 'restarting' },
      });
      expect(h.relaunch).toHaveBeenCalledTimes(1);
      // A second request while restarting does not relaunch twice.
      await h.ipc.invoke(IPC_CHANNELS.APP_RESTART, { unsaved: none, confirmed: true });
      expect(h.relaunch).toHaveBeenCalledTimes(1);
    });

    it('memory mode with an EMPTY database restarts without asking', async () => {
      h.setStorageMode('memory');
      expect(await h.ipc.invoke(IPC_CHANNELS.APP_RESTART, { unsaved: none })).toEqual({
        ok: true,
        data: { outcome: 'restarting' },
      });
      expect(h.relaunch).toHaveBeenCalledTimes(1);
    });

    it('unsaved wizard / text edit / review draft ask even in normal mode', async () => {
      const r = await h.ipc.invoke<{ confirmation: { reasons: string[]; dialogWindow: string } }>(
        IPC_CHANNELS.APP_RESTART,
        { unsaved: { wizard: true, textEdit: true, reviewDraft: true } },
      );
      expect(r).toMatchObject({
        ok: true,
        data: {
          outcome: 'confirm_required',
          confirmation: { reasons: ['wizard', 'text_edit', 'review_draft'], dialogWindow: 'main' },
        },
      });
      expect(h.relaunch).not.toHaveBeenCalled();
    });

    it.each([
      [undefined, 'payload', 'wrong_type'],
      [{}, 'unsaved', 'missing'],
      [{ unsaved: 'yes' }, 'unsaved', 'wrong_type'],
      [{ unsaved: { wizard: true, textEdit: false } }, 'unsaved.reviewDraft', 'missing'],
      [
        { unsaved: { wizard: 1, textEdit: false, reviewDraft: false } },
        'unsaved.wizard',
        'wrong_type',
      ],
      [
        { unsaved: { wizard: true, textEdit: false, reviewDraft: false, extra: 1 } },
        'unsaved.extra',
        'unknown_field',
      ],
      [
        { unsaved: { wizard: false, textEdit: false, reviewDraft: false }, confirmed: 'true' },
        'confirmed',
        'wrong_type',
      ],
      [
        { unsaved: { wizard: false, textEdit: false, reviewDraft: false }, force: true },
        'force',
        'unknown_field',
      ],
    ])('rejects %j without relaunching', async (payload, field, reason) => {
      expectFailure(await h.ipc.invoke(IPC_CHANNELS.APP_RESTART, payload), 'INVALID_REQUEST', {
        field,
        reason,
      });
      expect(h.relaunch).not.toHaveBeenCalled();
    });
  });

  describe('storage rules', () => {
    it('progress, review and export never write to the action log', async () => {
      const okr = create();
      await h.ipc.invoke(IPC_CHANNELS.KR_SET_PROGRESS, {
        krId: 'kr-a',
        value: 10,
        status: 'in_progress',
      });
      await h.ipc.invoke(IPC_CHANNELS.KR_REPLACE_PROGRESS, { krId: 'kr-a', value: 20 });
      await h.ipc.invoke(IPC_CHANNELS.KR_REVERT_PROGRESS, { krId: 'kr-a' });
      await h.ipc.invoke(IPC_CHANNELS.OKR_PIN, { okrId: okr.id });
      await h.ipc.invoke(IPC_CHANNELS.OKR_SET_PERIOD, { okrId: okr.id, period: '2026-Q4' });
      await h.ipc.invoke(IPC_CHANNELS.REVIEW_SAVE, {
        okrId: okr.id,
        wentWell: 'x',
        fellShort: '',
        nextSteps: '',
      });
      h.showSaveDialog.mockResolvedValue(join(h.dir, 'a.json'));
      await h.ipc.invoke(IPC_CHANNELS.EXPORT_SAVE, { okrId: okr.id, format: 'json' });
      expect((h.db.prepare('SELECT COUNT(*) AS n FROM action_logs').get() as { n: number }).n).toBe(
        0,
      );
    });
  });

  describe('error shape and unexpected failures', () => {
    it('never throws across IPC: an unexpected store error becomes INTERNAL with a generic message', async () => {
      create();
      jest.spyOn(h.store, 'listObjectiveSummaries').mockImplementation(() => {
        throw new Error('boom at C:\\Users\\someone\\secret.db');
      });
      const r = await h.ipc.invoke(IPC_CHANNELS.OKR_LIST);
      expect(r).toEqual({
        ok: false,
        error: { code: 'INTERNAL', message: 'Something went wrong' },
      });
    });

    it('every failure has exactly { ok:false, error:{ code, message, [field, reason] } }', async () => {
      const r = await h.ipc.invoke(IPC_CHANNELS.OKR_PIN, { okrId: 3 });
      expect(r).toEqual({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: expect.any(String),
          field: 'okrId',
          reason: 'wrong_type',
        },
      });
    });
  });
});
