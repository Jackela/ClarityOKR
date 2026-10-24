import {
  BACKUP_MAX_MB,
  BYTES_PER_MB,
  IMPORT_BACKUP_MAX_BYTES,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_MB,
} from '@clarityokr/contracts';
import { TestBed } from '@angular/core/testing';
import { IMPORT_ISSUE_UI } from '@clarityokr/contracts';

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

  it('#93 too large (backup): the plain sentence without the file size; its 50 is the limit', async () => {
    api['importPick']!.mockResolvedValue(
      ok({
        outcome: 'rejected',
        problem: {
          kind: 'too_large',
          sizeBytes: IMPORT_BACKUP_MAX_BYTES + 1,
          limitBytes: IMPORT_BACKUP_MAX_BYTES,
          backup: true,
        },
      }),
    );
    await flow.start();
    expect(flow.dialog()).toMatchObject({
      kind: 'error',
      title: '文件太大，无法导入',
      body: '这个备份超过 50 MB 的上限，无法导入。',
      hint: '数据没有任何改动。',
      action: 'reselect',
    });
    const body = flow.dialog()!.body;
    expect(body).not.toMatch(/\d+\.\d/);
    expect(body.match(/(\d+) MB/g)).toEqual([`${BACKUP_MAX_MB} MB`]);
    expect(IMPORT_BACKUP_MAX_BYTES).toBe(BACKUP_MAX_MB * BYTES_PER_MB);
  });

  it('#89 too large (single OKR): the plain sentence without the file size, even just over the limit', async () => {
    api['importPick']!.mockResolvedValue(
      ok({
        outcome: 'rejected',
        problem: {
          kind: 'too_large',
          sizeBytes: IMPORT_MAX_BYTES + 1,
          limitBytes: IMPORT_MAX_BYTES,
          backup: false,
        },
      }),
    );
    await flow.start();
    const body = flow.dialog()!.body;
    expect(body).toBe('这个文件超过 5 MB 的上限，无法导入。');
    expect(body).not.toMatch(/\d+\.\d/); // never 「5.0 MB」
    // the 5 in the copy is the limit the import enforces
    expect(body.match(/(\d+) MB/g)).toEqual([`${IMPORT_MAX_MB} MB`]);
    expect(IMPORT_MAX_BYTES).toBe(IMPORT_MAX_MB * 1024 * 1024);
  });

  it.each([
    [
      {
        kind: 'too_large',
        sizeBytes: IMPORT_MAX_BYTES + 1,
        limitBytes: IMPORT_MAX_BYTES,
        backup: false,
      },
      '文件太大，无法导入',
      '这个文件超过 5 MB 的上限，无法导入。',
      'reselect',
    ],
    [
      {
        kind: 'too_large',
        sizeBytes: IMPORT_BACKUP_MAX_BYTES + 1,
        limitBytes: IMPORT_BACKUP_MAX_BYTES,
        backup: true,
      },
      '文件太大，无法导入',
      '这个备份超过 50 MB 的上限，无法导入。',
      'reselect',
    ],
    [{ kind: 'not_json' }, '这个文件导入不了', '这不是 ClarityOKR 导出的文件', 'reselect'],
    [
      { kind: 'unsupported_version', version: '2' },
      '这个文件的版本不支持',
      '这个文件来自版本 2',
      null,
    ],
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

  it('#69 invalid: plain body, located lines (≤ 5, then 「另有 n 处」), no English keys', async () => {
    const issue = (i: number) => ({
      code: 'out_of_range' as const,
      location: ['keyResults', i, 'progress'],
      params: {},
    });
    api['importPick']!.mockResolvedValue(
      ok({
        outcome: 'rejected',
        problem: {
          kind: 'invalid',
          field: '',
          reason: '第 1 个关键结果的进度超出 0 到 100',
          more: 104,
          issues: [0, 1, 2, 3, 4].map(issue),
          total: 105,
        },
      }),
    );
    await flow.start();
    const dialog = flow.dialog()!;
    expect(dialog).toMatchObject({
      title: '文件内容有误，无法导入',
      body: IMPORT_ISSUE_UI.singleBody,
      detail: [
        '第 1 个关键结果的进度超出 0 到 100',
        '第 2 个关键结果的进度超出 0 到 100',
        '第 3 个关键结果的进度超出 0 到 100',
        '第 4 个关键结果的进度超出 0 到 100',
        '另有 99+ 处',
      ],
    });
    expect(dialog.kind === 'error' && dialog.detail.join('')).not.toMatch(/[A-Za-z]{3,}|\[\d/);
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

  describe('#50 backup import (S1§9.4)', () => {
    const items = [
      { title: '甲', createdAt: '2026-09-01T00:00:00.000Z' },
      { title: '乙', createdAt: '2026-09-02T00:00:00.000Z' },
      { title: '丙', createdAt: '2026-09-03T00:00:00.000Z' },
      { title: '乙', createdAt: '2026-09-02T00:00:00.000Z' },
    ];
    const backup = { exportedAt: '2026-10-15T07:58:00.000Z', appVersion: '0.2.0' };

    it('empty backup → 「备份里没有 OKR」 information notice (#85)', async () => {
      api['importPick']!.mockResolvedValue(
        ok({ outcome: 'rejected', problem: { kind: 'empty_backup' } }),
      );
      await flow.start();
      expect(flow.dialog()).toMatchObject({
        kind: 'error',
        title: '备份里没有 OKR',
        body: '这个备份里一个 OKR 也没有，没有可导入的内容。',
        hint: '数据没有任何改动。',
        action: null,
        info: true,
      });
    });

    it('one bad OKR → body names it, detail keeps okrs[i] (AC4); B4 line without a path', async () => {
      api['importPick']!.mockResolvedValue(
        ok({
          outcome: 'rejected',
          problem: {
            kind: 'invalid',
            field: '',
            reason: '第 4 个 OKR 有 12 个 KR，最多 10 个',
            more: 0,
            okrIndex: 3,
          },
        }),
      );
      await flow.start();
      expect(flow.dialog()).toMatchObject({
        body: '备份里第 4 个 OKR 有误，整份没有导入。',
        detail: ['第 4 个 OKR 有 12 个 KR，最多 10 个'],
      });
    });

    it('no duplicates: preview 「导入备份？」 with 「n 个都是新的」', async () => {
      api['importPick']!.mockResolvedValue(
        confirm({ items: items.slice(0, 3), conflicts: [], backup }),
      );
      await flow.start();
      const dialog = flow.dialog()!;
      expect(dialog).toMatchObject({ kind: 'backup', title: '导入备份？', count: 3, rows: [] });
      expect(dialog.body).toMatch(
        /^这个备份包含 3 个 OKR，备份于 .+（ClarityOKR 0\.2\.0）。导入不会覆盖已有数据。$/,
      );
      expect(dialog.hint).toBe('3 个都是新的，会全部导入。');
      expect(flow.backupCounts()).toEqual({ imported: 3, skipped: 0 });
    });

    it('duplicates (history + in file, Q9-5): default skip (Q9-2), per row and bulk, summary', async () => {
      api['importPick']!.mockResolvedValue(
        confirm({
          items,
          conflicts: [
            { ...items[0], index: 0, source: 'existing' },
            { ...items[3], index: 3, source: 'in_file' },
          ],
          backup,
        }),
      );
      await flow.start();
      const dialog = flow.dialog()!;
      expect(dialog.hint).toBe('其中 2 个和历史里已有的 OKR 同名且创建时间相同：');
      expect(dialog.kind === 'backup' && dialog.rows.map((r) => [r.index, r.inFile])).toEqual([
        [0, false],
        [3, true],
      ]);
      expect(flow.choices()).toEqual({ 0: 'skip', 3: 'skip' });
      expect(flow.backupCounts()).toEqual({ imported: 2, skipped: 2 });
      flow.choose(3, 'copy');
      expect(flow.backupCounts()).toEqual({ imported: 3, skipped: 1 });
      flow.chooseAll('copy');
      expect(flow.backupCounts()).toEqual({ imported: 4, skipped: 0 });
      flow.chooseAll('skip');
      flow.choose(0, 'copy');

      api['importCommit']!.mockResolvedValue(
        ok({
          outcome: 'imported',
          imported: [
            { okrId: 'n1', title: '甲（导入）' },
            { okrId: 'n2', title: '乙' },
            { okrId: 'n3', title: '丙' },
          ],
          skipped: [items[3]],
          memory: false,
        }),
      );
      await flow.commitBackup();
      expect(api['importCommit']).toHaveBeenCalledWith({
        token: 'tok-1',
        onConflict: 'skip',
        choices: { 0: 'copy', 3: 'skip' },
      });
      expect(toasts.current()!.message).toBe('导入 3 个，跳过 1 个。');
      expect(flow.reveal()).toMatchObject({ okrId: 'n1' });
      expect([...flow.fresh()]).toEqual(['n1', 'n2', 'n3']);
    });

    it('everything skipped: nothing to import, commit does nothing', async () => {
      api['importPick']!.mockResolvedValue(
        confirm({
          items: items.slice(0, 1),
          conflicts: [{ ...items[0], index: 0, source: 'existing' }],
          backup,
        }),
      );
      await flow.start();
      expect(flow.backupCounts()).toEqual({ imported: 0, skipped: 1 });
      await flow.commitBackup();
      expect(api['importCommit']).not.toHaveBeenCalled();
    });

    it('no skips: 「已导入 n 个 OKR。」', async () => {
      api['importPick']!.mockResolvedValue(confirm({ items: items.slice(0, 2), backup }));
      await flow.start();
      api['importCommit']!.mockResolvedValue(
        ok({
          outcome: 'imported',
          imported: [
            { okrId: 'a', title: '甲' },
            { okrId: 'b', title: '乙' },
          ],
          skipped: [],
          memory: false,
        }),
      );
      await flow.commitBackup();
      expect(toasts.current()!.message).toBe('已导入 2 个 OKR。');
    });
  });
});
