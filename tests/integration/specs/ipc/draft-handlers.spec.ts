import { jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type { Database } from 'better-sqlite3';
import {
  ALLOWED_CHANNELS,
  IPC_CHANNELS,
  type DraftGetReply,
  type DraftRow,
  type IpcResult,
} from '@clarityokr/contracts';

import { Logger } from '../../../../app/main/src/core/logger.js';
import { registerDraftHandlers } from '../../../../app/main/src/drafts/draft-handlers.js';
import {
  SessionDraftStore,
  wireSessionEndDrafts,
} from '../../../../app/main/src/drafts/session-draft-store.js';
import { OkrStore, applySchema } from '../../../../app/main/src/persistence/okr-store/index.js';

type Handler = (event: unknown, payload?: unknown) => unknown;
const MAIN = 1;
const STICKY = 2;

class FakeIpcMain {
  readonly handlers = new Map<string, Handler>();
  handle(channel: string, handler: Handler): void {
    this.handlers.set(channel, handler);
  }
  async invoke<T>(sender: number, channel: string, payload?: unknown): Promise<IpcResult<T>> {
    const handler = this.handlers.get(channel);
    if (!handler) throw new Error(`no handler: ${channel}`);
    return (await handler({ sender: { id: sender } }, payload)) as IpcResult<T>;
  }
}

/** One app launch: the same database file and userData/drafts as the previous one. */
function launch(dbFile: string, draftsDir: string | null) {
  const db = new BetterSqlite3(dbFile);
  applySchema(db);
  const store = new OkrStore(db);
  const drafts = new SessionDraftStore({ dir: draftsDir });
  const ipc = new FakeIpcMain();
  registerDraftHandlers(ipc as never, {
    drafts,
    store,
    windowOf: (id) => (id === MAIN ? 'main' : id === STICKY ? 'sticky' : null),
  });
  const quit = jest.fn();
  const win = new EventEmitter();
  const wiring = wireSessionEndDrafts(drafts, quit);
  wiring.attach(win as never);
  return { db, store, drafts, ipc, quit, win, wiring };
}

const okrInput = (title: string) => ({
  title,
  keyResults: [
    { id: 'kr-1', statement: '代码评审缩短到两天内', successMetric: '耗时' },
    { id: 'kr-2', statement: '测试覆盖率提升到 80%' },
  ],
});

describe('#110 session-end drafts through the main process (real OkrStore, temp userData)', () => {
  let dir: string;
  let dbFile: string;
  let draftsDir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'drafts-ipc-'));
    dbFile = join(dir, 'clarityokr.db');
    draftsDir = join(dir, 'drafts');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('the three channels are whitelisted', () => {
    for (const c of [
      IPC_CHANNELS.APP_REPORT_DRAFT,
      IPC_CHANNELS.APP_DRAFT_GET,
      IPC_CHANNELS.APP_DRAFT_SETTLE,
    ]) {
      expect(ALLOWED_CHANNELS).toContain(c);
    }
  });

  it('session-end writes the reported input; the next launch offers it in the owning window', async () => {
    const first = launch(dbFile, draftsDir);
    const okr = first.store.createObjective(okrInput('提升团队交付效率与质量'));
    first.store.setPeriod(okr.id, '2026-Q4');
    const rows: DraftRow[] = [
      {
        kind: 'review',
        okrId: okr.id,
        base: { wentWell: '', fellShort: '', nextSteps: '' },
        draft: { wentWell: '节奏稳定', fellShort: '', nextSteps: '' },
      },
      {
        kind: 'textEdit',
        okrId: okr.id,
        krId: 'kr-2',
        base: { statement: '测试覆盖率提升到 80%', successMetric: '' },
        draft: { statement: '测试覆盖率提升到 90%', successMetric: '' },
      },
    ];
    expect(await first.ipc.invoke(STICKY, IPC_CHANNELS.APP_REPORT_DRAFT, { rows })).toEqual({
      ok: true,
      data: { recorded: true },
    });
    await first.ipc.invoke(MAIN, IPC_CHANNELS.APP_REPORT_DRAFT, {
      rows: [{ kind: 'wizard', step: 2, intent: '提高团队效率' }],
    });
    expect(existsSync(draftsDir)).toBe(false); // nothing on disk before the session ends
    first.win.emit('query-session-end');
    first.win.emit('session-end');
    expect(first.quit).toHaveBeenCalledTimes(1);
    first.db.close();

    const second = launch(dbFile, draftsDir);
    const sticky = await second.ipc.invoke<DraftGetReply>(STICKY, IPC_CHANNELS.APP_DRAFT_GET);
    expect(sticky.ok && sticky.data).toEqual({
      deletedCount: 0,
      rows: [
        {
          key: `textEdit:${okr.id}:kr-2`,
          row: rows[1],
          okrTitle: '提升团队交付效率与质量',
          krIndex: 2,
        },
        {
          key: `review:${okr.id}`,
          row: rows[0],
          okrTitle: '提升团队交付效率与质量',
          period: '2026-Q4',
        },
      ],
    });
    const main = await second.ipc.invoke<DraftGetReply>(MAIN, IPC_CHANNELS.APP_DRAFT_GET);
    expect(main.ok && main.data.rows.map((r) => r.key)).toEqual(['wizard']);
    // 放弃 in the main window only removes the main window's draft
    await second.ipc.invoke(MAIN, IPC_CHANNELS.APP_DRAFT_SETTLE, { all: true });
    expect(existsSync(join(draftsDir, 'main.json'))).toBe(false);
    expect(existsSync(join(draftsDir, 'sticky.json'))).toBe(true);
    second.db.close();
  });

  it('rows of a deleted OKR / KR are dropped and counted; rows already saved are voided', async () => {
    const first = launch(dbFile, draftsDir);
    const kept = first.store.createObjective(okrInput('保留的目标'));
    const rows: DraftRow[] = [
      {
        kind: 'textEdit',
        okrId: kept.id,
        krId: 'kr-1',
        base: { statement: '代码评审缩短到两天内', successMetric: '耗时' },
        draft: { statement: '代码评审缩短到一天内', successMetric: '耗时' },
      },
      {
        kind: 'textEdit',
        okrId: kept.id,
        krId: 'kr-2',
        base: { statement: '测试覆盖率提升到 80%', successMetric: '' },
        draft: { statement: '新的', successMetric: '' },
      },
      {
        kind: 'review',
        okrId: 'gone-okr',
        base: { wentWell: '', fellShort: '', nextSteps: '' },
        draft: { wentWell: 'x', fellShort: '', nextSteps: '' },
      },
    ];
    first.drafts.report('sticky', rows);
    first.win.emit('session-end');
    // kr-1 was saved with other text before the next launch (the spot was saved over)
    first.store.syncObjective({
      id: kept.id,
      title: kept.title,
      keyResults: [
        { id: 'kr-1', statement: '已经保存过的', successMetric: '耗时' },
        { id: 'kr-2', statement: '测试覆盖率提升到 80%' },
      ],
    });
    first.db.close();

    const second = launch(dbFile, draftsDir);
    const reply = await second.ipc.invoke<DraftGetReply>(STICKY, IPC_CHANNELS.APP_DRAFT_GET);
    expect(reply.ok && reply.data.deletedCount).toBe(1);
    // partial: one valid row left, one deleted
    expect(reply.ok && reply.data.rows.map((r) => r.key)).toEqual([`textEdit:${kept.id}:kr-2`]);
    // the dropped rows are gone from the file too
    expect(second.drafts.load('sticky')).toEqual({ kind: 'ok', rows: [rows[1]] });
    second.db.close();
  });

  it('deleted objects, two-digit n: 12 gone + 1 valid → one line and 12 counted; 12 gone only → nothing', async () => {
    const first = launch(dbFile, draftsDir);
    const okr = first.store.createObjective(okrInput('保留的目标'));
    const empty = { wentWell: '', fellShort: '', nextSteps: '' };
    const valid: DraftRow = {
      kind: 'review',
      okrId: okr.id,
      base: empty,
      draft: { ...empty, wentWell: 'x' },
    };
    const gone = Array.from(
      { length: 12 },
      (_, i): DraftRow => ({ ...valid, okrId: `gone-${i}` }) as DraftRow,
    );
    first.drafts.report('sticky', [valid, ...gone]);
    first.drafts.report('main', []);
    first.win.emit('session-end');
    first.db.close();
    const second = launch(dbFile, draftsDir);
    const partial = await second.ipc.invoke<DraftGetReply>(STICKY, IPC_CHANNELS.APP_DRAFT_GET);
    expect(partial.ok && partial.data.deletedCount).toBe(12);
    expect(partial.ok && partial.data.rows).toHaveLength(1);
    second.db.close();

    rmSync(draftsDir, { recursive: true, force: true });
    const third = launch(dbFile, draftsDir);
    third.drafts.report('sticky', gone);
    third.win.emit('session-end');
    third.db.close();
    const fourth = launch(dbFile, draftsDir);
    const all = await fourth.ipc.invoke<DraftGetReply>(STICKY, IPC_CHANNELS.APP_DRAFT_GET);
    expect(all).toEqual({ ok: true, data: { rows: [], deletedCount: 0 } });
    expect(existsSync(join(draftsDir, 'sticky.json'))).toBe(false);
    fourth.db.close();
  });

  it('every row gone → no bar, and the draft is cleared silently', async () => {
    const first = launch(dbFile, draftsDir);
    first.drafts.report('sticky', [
      {
        kind: 'review',
        okrId: 'gone',
        base: { wentWell: '', fellShort: '', nextSteps: '' },
        draft: { wentWell: 'x', fellShort: '', nextSteps: '' },
      },
    ]);
    first.win.emit('session-end');
    first.db.close();
    const second = launch(dbFile, draftsDir);
    const reply = await second.ipc.invoke<DraftGetReply>(STICKY, IPC_CHANNELS.APP_DRAFT_GET);
    expect(reply).toEqual({ ok: true, data: { rows: [], deletedCount: 0 } });
    expect(existsSync(join(draftsDir, 'sticky.json'))).toBe(false);
    second.db.close();
  });

  it('a corrupt draft: renamed to .corrupt, logged, empty reply (no bar)', async () => {
    mkdirSync(draftsDir, { recursive: true });
    writeFileSync(join(draftsDir, 'main.json'), 'not json', 'utf8');
    const error = jest.spyOn(Logger, 'error').mockImplementation(() => undefined);
    const app = launch(dbFile, draftsDir);
    const reply = await app.ipc.invoke<DraftGetReply>(MAIN, IPC_CHANNELS.APP_DRAFT_GET);
    expect(reply).toEqual({ ok: true, data: { rows: [], deletedCount: 0 } });
    expect(existsSync(join(draftsDir, 'main.json.corrupt'))).toBe(true);
    expect(existsSync(join(draftsDir, 'main.json'))).toBe(false);
    expect(error).toHaveBeenCalled();
    app.db.close();
  });

  it('in-memory database mode: reports are not kept, session end writes nothing, no prompt', async () => {
    const app = launch(':memory:', null);
    const report = await app.ipc.invoke(MAIN, IPC_CHANNELS.APP_REPORT_DRAFT, {
      rows: [{ kind: 'wizard', step: 1, intent: 'x' }],
    });
    expect(report).toEqual({ ok: true, data: { recorded: false } });
    app.win.emit('session-end');
    expect(app.quit).toHaveBeenCalled();
    expect(existsSync(draftsDir)).toBe(false);
    const reply = await app.ipc.invoke<DraftGetReply>(MAIN, IPC_CHANNELS.APP_DRAFT_GET);
    expect(reply).toEqual({ ok: true, data: { rows: [], deletedCount: 0 } });
    app.db.close();
  });

  it('one handler for the app: two windows ending the session → ONE write pass, ONE quit', () => {
    const app = launch(dbFile, draftsDir);
    const other = new EventEmitter();
    app.wiring.attach(other as never);
    const writeAll = jest.spyOn(app.drafts, 'writeAll');
    app.drafts.report('main', [{ kind: 'wizard', step: 1, intent: 'x' }]);
    for (const w of [app.win, other]) w.emit('query-session-end');
    for (const w of [app.win, other]) w.emit('session-end');
    expect(writeAll).toHaveBeenCalledTimes(1);
    expect(app.quit).toHaveBeenCalledTimes(1);
    expect(existsSync(join(draftsDir, 'main.json'))).toBe(true);
    app.db.close();
  });

  it('a normal quit (no session end) leaves no draft: the next launch offers nothing', async () => {
    const first = launch(dbFile, draftsDir);
    await first.ipc.invoke(MAIN, IPC_CHANNELS.APP_REPORT_DRAFT, {
      rows: [{ kind: 'wizard', step: 1, intent: '提高团队效率' }],
    });
    first.db.close(); // quit through 退出: no session-end event
    const second = launch(dbFile, draftsDir);
    const reply = await second.ipc.invoke<DraftGetReply>(MAIN, IPC_CHANNELS.APP_DRAFT_GET);
    expect(reply).toEqual({ ok: true, data: { rows: [], deletedCount: 0 } });
    expect(existsSync(draftsDir)).toBe(false);
    second.db.close();
  });

  it('hiding / closing a window is not a decision: the draft is offered again until 恢复 / 放弃', async () => {
    const first = launch(dbFile, draftsDir);
    first.drafts.report('main', [{ kind: 'wizard', step: 1, intent: '提高团队效率' }]);
    first.win.emit('session-end');
    first.db.close();
    const second = launch(dbFile, draftsDir);
    // the window asks when it is shown; hidden / closed / shown again asks again
    for (let shown = 0; shown < 3; shown++) {
      const reply = await second.ipc.invoke<DraftGetReply>(MAIN, IPC_CHANNELS.APP_DRAFT_GET);
      expect(reply.ok && reply.data.rows.map((r) => r.key)).toEqual(['wizard']);
    }
    second.db.close();
    // and the next launch still has it
    const third = launch(dbFile, draftsDir);
    const reply = await third.ipc.invoke<DraftGetReply>(MAIN, IPC_CHANNELS.APP_DRAFT_GET);
    expect(reply.ok && reply.data.rows.map((r) => r.key)).toEqual(['wizard']);
    third.db.close();
  });

  it('main-window text edit: drafted in main.json and offered only in the main window', async () => {
    const first = launch(dbFile, draftsDir);
    const okr = first.store.createObjective(okrInput('主窗口的目标'));
    const kr = okr.keyResults[0];
    const base = { statement: kr.statement, successMetric: kr.successMetric ?? '' };
    const row: DraftRow = {
      kind: 'textEdit',
      okrId: okr.id,
      krId: kr.id,
      base,
      draft: { ...base, statement: '主窗口改的' },
    };
    await first.ipc.invoke(MAIN, IPC_CHANNELS.APP_REPORT_DRAFT, { rows: [row] });
    first.win.emit('session-end');
    first.db.close();
    const second = launch(dbFile, draftsDir);
    const main = await second.ipc.invoke<DraftGetReply>(MAIN, IPC_CHANNELS.APP_DRAFT_GET);
    expect(main.ok && main.data.rows.map((r) => r.key)).toEqual([`textEdit:${okr.id}:${kr.id}`]);
    const sticky = await second.ipc.invoke<DraftGetReply>(STICKY, IPC_CHANNELS.APP_DRAFT_GET);
    expect(sticky.ok && sticky.data.rows).toHaveLength(0);
    second.db.close();
  });

  it('the same KR edited in both windows: each window keeps its own row and bar (【缺】 safest choice)', async () => {
    const first = launch(dbFile, draftsDir);
    const okr = first.store.createObjective(okrInput('两边都改'));
    const kr = okr.keyResults[0];
    const base = { statement: kr.statement, successMetric: kr.successMetric ?? '' };
    const rowOf = (statement: string): DraftRow => ({
      kind: 'textEdit',
      okrId: okr.id,
      krId: kr.id,
      base,
      draft: { ...base, statement },
    });
    await first.ipc.invoke(MAIN, IPC_CHANNELS.APP_REPORT_DRAFT, { rows: [rowOf('主窗口版')] });
    await first.ipc.invoke(STICKY, IPC_CHANNELS.APP_REPORT_DRAFT, { rows: [rowOf('便签版')] });
    first.win.emit('session-end');
    first.db.close();
    const second = launch(dbFile, draftsDir);
    const key = `textEdit:${okr.id}:${kr.id}`;
    const main = await second.ipc.invoke<DraftGetReply>(MAIN, IPC_CHANNELS.APP_DRAFT_GET);
    const sticky = await second.ipc.invoke<DraftGetReply>(STICKY, IPC_CHANNELS.APP_DRAFT_GET);
    expect(
      main.ok &&
        main.data.rows.map((r) => [
          r.key,
          (r.row as { draft: { statement: string } }).draft.statement,
        ]),
    ).toEqual([[key, '主窗口版']]);
    expect(
      sticky.ok &&
        sticky.data.rows.map((r) => [
          r.key,
          (r.row as { draft: { statement: string } }).draft.statement,
        ]),
    ).toEqual([[key, '便签版']]);
    // settling one window's row leaves the other window's row
    await second.ipc.invoke(MAIN, IPC_CHANNELS.APP_DRAFT_SETTLE, { keys: [key] });
    const after = await second.ipc.invoke<DraftGetReply>(STICKY, IPC_CHANNELS.APP_DRAFT_GET);
    expect(after.ok && after.data.rows.map((r) => r.key)).toEqual([key]);
    second.db.close();
  });

  it.each([
    ['saved in A → B voided', true],
    ['restored without saving in A → B unaffected', false],
  ])('same KR in both windows, re-checked at 恢复: %s', async (_name, savedInA) => {
    {
      rmSync(draftsDir, { recursive: true, force: true });
      const first = launch(dbFile, draftsDir);
      const okr = first.store.createObjective(okrInput(`两边 ${savedInA}`));
      const kr = okr.keyResults[0];
      const base = { statement: kr.statement, successMetric: kr.successMetric ?? '' };
      const rowOf = (statement: string): DraftRow => ({
        kind: 'textEdit',
        okrId: okr.id,
        krId: kr.id,
        base,
        draft: { ...base, statement },
      });
      first.drafts.report('main', [rowOf('A 版')]);
      first.drafts.report('sticky', [rowOf('B 版')]);
      first.win.emit('session-end');
      first.db.close();
      const second = launch(dbFile, draftsDir);
      const key = `textEdit:${okr.id}:${kr.id}`;
      // both bars are up
      for (const w of [MAIN, STICKY]) {
        const r = await second.ipc.invoke<DraftGetReply>(w, IPC_CHANNELS.APP_DRAFT_GET);
        expect(r.ok && r.data.rows.map((x) => x.key)).toEqual([key]);
      }
      // window A restores (settles its row), and maybe saves the KR
      await second.ipc.invoke(MAIN, IPC_CHANNELS.APP_DRAFT_SETTLE, { keys: [key] });
      if (savedInA) {
        second.store.syncObjective({
          id: okr.id,
          title: okr.title,
          keyResults: okr.keyResults.map((k) =>
            k.id === kr.id ? { id: k.id, statement: 'A 版', successMetric: k.successMetric } : k,
          ),
        });
      }
      // window B clicks 恢复: the bar asks again (app:draft-get) before restoring
      const recheck = await second.ipc.invoke<DraftGetReply>(STICKY, IPC_CHANNELS.APP_DRAFT_GET);
      if (savedInA) {
        expect(recheck).toEqual({ ok: true, data: { rows: [], deletedCount: 0 } });
      } else {
        expect(recheck.ok && recheck.data.rows.map((x) => x.key)).toEqual([key]);
      }
      second.db.close();
    }
  });

  it('rejects malformed payloads and unknown senders', async () => {
    const app = launch(dbFile, draftsDir);
    const bad = await app.ipc.invoke(MAIN, IPC_CHANNELS.APP_REPORT_DRAFT, {
      rows: [{ kind: 'x' }],
    });
    expect(bad.ok).toBe(false);
    const settle = await app.ipc.invoke(MAIN, IPC_CHANNELS.APP_DRAFT_SETTLE, {});
    expect(settle.ok).toBe(false);
    const stranger = await app.ipc.invoke(99, IPC_CHANNELS.APP_REPORT_DRAFT, { rows: [] });
    expect(stranger).toEqual({ ok: true, data: { recorded: false } });
    app.db.close();
  });
});
