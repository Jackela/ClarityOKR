import { TestBed } from '@angular/core/testing';

import { ToastService } from '../shared/components/toast.service';
import { ClosedLoopApi } from './closed-loop-api.service';
import { ClosedLoopStore } from './closed-loop.store';
import { IMPORT_SLOW_MS, ImportFlow } from './import-flow.service';

describe('ImportFlow (#49, S1§8 + v3.1)', () => {
  let flow: ImportFlow;
  let toasts: ToastService;
  let api: Record<string, jest.Mock>;

  const ok = <T>(data: T) => ({ ok: true as const, data });
  const item = { title: '提升团队交付节奏', createdAt: '2026-09-28T06:20:00.000Z' };
  const confirm = (over: object = {}) =>
    ok({
      outcome: 'confirm',
      token: 'tok-1',
      items: [item],
      conflicts: [],
      memory: false,
      ...over,
    });

  beforeEach(() => {
    api = {
      importPick: jest.fn(),
      importCommit: jest.fn(),
      importRetry: jest.fn(),
      importDiscard: jest.fn().mockResolvedValue(ok({ discarded: true })),
      list: jest.fn().mockResolvedValue(ok({ items: [] })),
    };
    TestBed.configureTestingModule({ providers: [{ provide: ClosedLoopApi, useValue: api }] });
    flow = TestBed.inject(ImportFlow);
    toasts = TestBed.inject(ToastService);
  });

  it('cancelled file dialog: neutral toast, nothing else', async () => {
    api['importPick']!.mockResolvedValue(ok({ outcome: 'cancelled' }));
    await flow.start();
    expect(toasts.current()).toMatchObject({
      kind: 'neutral',
      message: '已取消导入，没有改动数据。',
    });
    expect(flow.dialog()).toBeNull();
  });

  it('imported without conflicts (Q8-1): 「已导入 1 个 OKR」 + 「查看」, list refreshed, 新导入 tag', async () => {
    api['importPick']!.mockResolvedValue(
      ok({
        outcome: 'imported',
        imported: [{ okrId: 'n1', title: 't' }],
        skipped: [],
        memory: false,
      }),
    );
    await flow.start();
    expect(api['list']).toHaveBeenCalled();
    const toast = toasts.current()!;
    expect(toast).toMatchObject({ kind: 'success', message: '已导入 1 个 OKR' });
    expect(flow.fresh().has('n1')).toBe(true);
    toast.actions[0]!.run();
    expect(flow.reveal()).toMatchObject({ okrId: 'n1' });
    flow.clearFresh();
    expect(flow.fresh().size).toBe(0);
  });

  it('in-memory mode (Q8-6): confirm with the warning, success toast says it is lost on quit', async () => {
    api['importPick']!.mockResolvedValue(confirm({ memory: true }));
    await flow.start();
    expect(flow.dialog()).toMatchObject({
      kind: 'confirm',
      title: '导入 1 个 OKR？',
      hint: '当前数据不会保存，退出后导入的内容也会丢失。',
    });
    api['importCommit']!.mockResolvedValue(
      ok({
        outcome: 'imported',
        imported: [{ okrId: 'n1', title: 't' }],
        skipped: [],
        memory: true,
      }),
    );
    await flow.commit('skip');
    expect(api['importCommit']).toHaveBeenCalledWith({ token: 'tok-1', onConflict: 'skip' });
    expect(toasts.current()!.message).toBe('已导入 1 个 OKR，退出后会丢失。');
  });

  it('conflict: three answers; skip → 「已跳过…」; cancel discards the token', async () => {
    api['importPick']!.mockResolvedValue(
      confirm({ conflicts: [{ ...item, index: 0, source: 'existing' }] }),
    );
    await flow.start();
    const dialog = flow.dialog()!;
    expect(dialog.kind).toBe('conflict');
    expect(dialog.body).toContain('「提升团队交付节奏」（创建于 ');
    expect(dialog.hint).toBe('作为副本导入时，新 OKR 的标题会加上「（导入）」。');

    flow.close();
    expect(api['importDiscard']).toHaveBeenCalledWith({ token: 'tok-1' });
    expect(toasts.current()!.message).toBe('已取消导入，没有改动数据。');

    await flow.start();
    api['importCommit']!.mockResolvedValue(
      ok({ outcome: 'imported', imported: [], skipped: [item], memory: false }),
    );
    await flow.commit('skip');
    expect(toasts.current()!.message).toBe('已跳过「提升团队交付节奏」，没有改动数据。');
    expect(flow.dialog()).toBeNull();
  });

  it.each([
    [
      { kind: 'too_large', sizeBytes: 7.3 * 1024 * 1024 },
      '文件太大，无法导入',
      '这个文件有 7.3 MB',
      'reselect',
    ],
    [{ kind: 'not_json' }, '这不是可以导入的文件', '不是有效的 JSON', 'reselect'],
    [{ kind: 'unsupported_version', version: '2' }, '这个文件的版本不受支持', '版本是 2', null],
    [{ kind: 'read_failed', category: 'permission' }, '没能读取这个文件', '没有权限', 'reselect'],
  ])(
    'rejected %o → error dialog ending with 「数据没有任何改动。」',
    async (problem, title, body, action) => {
      api['importPick']!.mockResolvedValue(ok({ outcome: 'rejected', problem }));
      await flow.start();
      expect(flow.dialog()).toMatchObject({
        kind: 'error',
        title,
        hint: '数据没有任何改动。',
        action,
      });
      expect(flow.dialog()!.body).toContain(body);
    },
  );

  it('invalid: first problem in the detail plus 「另有 n 处错误」', async () => {
    api['importPick']!.mockResolvedValue(
      ok({
        outcome: 'rejected',
        problem: {
          kind: 'invalid',
          field: 'keyResults[2].progress',
          reason: '超出 0–100',
          more: 3,
        },
      }),
    );
    await flow.start();
    expect(flow.dialog()).toMatchObject({
      title: '文件内容有误，无法导入',
      body: '第一处错误：',
      detail: ['keyResults[2].progress 超出 0–100', '另有 3 处错误'],
    });
  });

  it('write failed → 「重试」 re-reads the same file by token (Q8-3); original gone → 「重新选择文件…」', async () => {
    api['importPick']!.mockResolvedValue(
      ok({ outcome: 'write_failed', category: 'disk_full', token: 'tok-9' }),
    );
    await flow.start();
    expect(flow.dialog()).toMatchObject({
      title: '导入没有完成',
      body: '磁盘已满，导入没有完成。',
      action: 'retry',
    });
    expect(flow.dialog()!.hint).toContain('已撤销这次导入');
    api['importRetry']!.mockResolvedValue(ok({ outcome: 'original_missing' }));
    await flow.secondary();
    expect(api['importRetry']).toHaveBeenCalledWith({ token: 'tok-9' });
    expect(flow.dialog()).toMatchObject({ body: '找不到原文件，请重新选择。', action: 'reselect' });
    api['importPick']!.mockResolvedValue(ok({ outcome: 'cancelled' }));
    await flow.secondary();
    expect(api['importPick']).toHaveBeenCalledTimes(2);
  });

  it('loading only after 300ms: 「正在读取文件…」', async () => {
    jest.useFakeTimers();
    let resolve!: (v: unknown) => void;
    api['importPick']!.mockReturnValue(new Promise((r) => (resolve = r)));
    const running = flow.start();
    jest.advanceTimersByTime(IMPORT_SLOW_MS - 1);
    expect(flow.slow()).toBe(false);
    jest.advanceTimersByTime(1);
    expect(flow.slow()).toBe(true);
    expect(flow.statusText()).toBe('正在读取文件…');
    resolve(ok({ outcome: 'cancelled' }));
    await running;
    expect(flow.slow()).toBe(false);
    jest.useRealTimers();
  });

  it('#68: opening a dialog closes the toast of the previous step', async () => {
    api['importPick']!.mockResolvedValueOnce(ok({ outcome: 'cancelled' }));
    await flow.start();
    expect(toasts.current()).not.toBeNull();
    api['importPick']!.mockResolvedValueOnce(
      confirm({ conflicts: [{ ...item, index: 0, source: 'existing' }] }),
    );
    await flow.start();
    expect(flow.dialog()?.kind).toBe('conflict');
    expect(toasts.current()).toBeNull();
    flow.close();
    api['importPick']!.mockResolvedValueOnce(
      ok({ outcome: 'rejected', problem: { kind: 'not_json' } }),
    );
    expect(toasts.current()).not.toBeNull();
    await flow.start();
    expect(flow.dialog()?.kind).toBe('error');
    expect(toasts.current()).toBeNull();
  });

  it('B4: a plain-language reason is shown without a field path', async () => {
    api['importPick']!.mockResolvedValue(
      ok({
        outcome: 'rejected',
        problem: {
          kind: 'invalid',
          field: '',
          reason: '这个 OKR 有 11 个 KR，最多 10 个',
          more: 0,
        },
      }),
    );
    await flow.start();
    expect(flow.dialog()).toMatchObject({
      title: '文件内容有误，无法导入',
      detail: ['这个 OKR 有 11 个 KR，最多 10 个'],
    });
  });

  it('N26: starting a new import closes the old toast', async () => {
    toasts.show({ kind: 'success', message: '旧的' });
    let resolve!: (v: unknown) => void;
    api['importPick']!.mockReturnValue(new Promise((r) => (resolve = r)));
    const running = flow.start();
    expect(toasts.current()).toBeNull();
    resolve(ok({ outcome: 'cancelled' }));
    await running;
  });
});
