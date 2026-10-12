import { TestBed } from '@angular/core/testing';
import type { ExportFailureCategory } from '@clarityokr/contracts';

import { ToastService } from '../shared/components/toast.service';
import { ClosedLoopApi } from './closed-loop-api.service';
import { ClosedLoopStore } from './closed-loop.store';
import { EXPORT_SLOW_MS, ExportFlow } from './export-flow.service';

const PATH = '/Users/someone/Downloads/ClarityOKR-把发布频率提到每周 3 次-2026-10-11.md';

describe('ExportFlow (spec §6.3)', () => {
  let flow: ExportFlow;
  let toasts: ToastService;
  let store: ClosedLoopStore;
  let api: {
    exportOkr: jest.Mock;
    reveal: jest.Mock;
    copyMarkdown: jest.Mock;
    getStorageMode: jest.Mock;
  };
  let focusTrigger: jest.Mock;

  const ok = <T>(data: T) => ({ ok: true as const, data });
  const saved = (path = PATH, format: 'md' | 'json' = 'md') =>
    ok({ outcome: 'saved' as const, format, fileName: path.split('/').pop()!, path });
  const flush = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(0);
  };

  beforeEach(() => {
    jest.useFakeTimers();
    api = {
      exportOkr: jest.fn(),
      reveal: jest.fn(),
      copyMarkdown: jest.fn(),
      getStorageMode: jest.fn().mockResolvedValue('normal'),
    };
    TestBed.configureTestingModule({ providers: [{ provide: ClosedLoopApi, useValue: api }] });
    flow = TestBed.inject(ExportFlow);
    toasts = TestBed.inject(ToastService);
    store = TestBed.inject(ClosedLoopStore);
    store.currentId.set('okr-1');
    focusTrigger = jest.fn();
    flow.registerTrigger(focusTrigger);
  });

  afterEach(() => jest.useRealTimers());

  describe('availability', () => {
    it('is available with an open OKR', () => {
      expect(flow.disabledReason).toBeNull();
    });
    it('says 「没有可导出的内容」 without an open OKR and does nothing when asked', async () => {
      store.currentId.set(null);
      expect(flow.disabledReason).toBe('没有可导出的内容');
      await flow.export('md');
      await flow.copyMarkdown();
      expect(api.exportOkr).not.toHaveBeenCalled();
      expect(api.copyMarkdown).not.toHaveBeenCalled();
    });
    it('says 「正在重新生成，完成后可导出」 while regenerating (it wins over the other reason)', () => {
      store.regenerating.set(true);
      expect(flow.disabledReason).toBe('正在重新生成，完成后可导出');
      store.currentId.set(null);
      expect(flow.disabledReason).toBe('正在重新生成，完成后可导出');
    });
  });

  describe('saved', () => {
    beforeEach(async () => {
      api.exportOkr.mockResolvedValue(saved());
      await flow.export('md');
      await flush();
    });

    it('sends the open OKR and the format', () => {
      expect(api.exportOkr).toHaveBeenCalledWith({ okrId: 'okr-1', format: 'md' });
    });

    it('shows a success toast with the file name, the shortened path and the two buttons', () => {
      const toast = toasts.current()!;
      expect(toast.kind).toBe('success');
      expect(toast.message).toBe(
        '已导出为 Markdown：ClarityOKR-把发布频率提到每周 3 次-2026-10-11.md',
      );
      expect(toast.detailFull).toBe(PATH);
      expect(toast.detail).toContain('…');
      expect(toast.detail!.length).toBeLessThan(PATH.length);
      expect(toast.actions.map((a) => a.label)).toEqual(['在文件夹中显示', '复制路径']);
      expect(toast.autoDismissMs).toBe(8000);
    });

    it('in memory mode the message says 「（仅本次运行）」 (the path stays out of it)', async () => {
      api.getStorageMode.mockResolvedValue('memory');
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [{ provide: ClosedLoopApi, useValue: api }] });
      const memoryFlow = TestBed.inject(ExportFlow);
      TestBed.inject(ClosedLoopStore).currentId.set('okr-1');
      api.exportOkr.mockResolvedValue(saved('/tmp/m.md'));
      await memoryFlow.export('md');
      expect(TestBed.inject(ToastService).current()!.message).toBe(
        '已导出为 Markdown：m.md（仅本次运行）',
      );
      expect(TestBed.inject(ToastService).current()!.message).not.toContain('/tmp');
    });

    it('in normal and fresh-file mode there is no suffix', async () => {
      expect(toasts.current()!.message).not.toContain('仅本次运行');
    });

    it('JSON says JSON', async () => {
      api.exportOkr.mockResolvedValue(saved('/tmp/a.json', 'json'));
      await flow.export('json');
      expect(toasts.current()!.message).toBe('已导出为 JSON：a.json');
    });

    it('does not take the focus; it goes back to the control that started the export', () => {
      expect(focusTrigger).toHaveBeenCalled();
    });

    it('「在文件夹中显示」 reveals exactly that path', async () => {
      api.reveal.mockResolvedValue(ok({ revealed: true }));
      toasts.current()!.actions[0]!.run();
      await flush();
      expect(api.reveal).toHaveBeenCalledWith({ path: PATH });
    });

    it('a refused reveal (a newer export replaced the permission) is an error toast, without the path', async () => {
      api.reveal.mockResolvedValue({
        ok: false,
        error: { code: 'PATH_NOT_ALLOWED', message: 'x' },
      });
      toasts.current()!.actions[0]!.run();
      await flush();
      expect(toasts.current()!.kind).toBe('error');
      expect(toasts.current()!.message).toBe('没能在文件夹中显示这个文件。');
      expect(JSON.stringify(toasts.current())).not.toContain('Downloads');
    });

    it('「复制路径」 copies the full path, says so in the same button, and then goes back', async () => {
      const writeText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      const id = toasts.current()!.id;
      toasts.current()!.actions[1]!.run();
      await flush();
      expect(writeText).toHaveBeenCalledWith(PATH);
      expect(toasts.current()!.id).toBe(id); // same toast, same DOM node
      expect(toasts.current()!.actions[1]!.label).toBe('已复制');
      jest.advanceTimersByTime(2000);
      expect(toasts.current()!.actions[1]!.label).toBe('复制路径');
    });

    it('a clipboard that refuses is reported on the button', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: jest.fn().mockRejectedValue(new Error('no')) },
        configurable: true,
      });
      toasts.current()!.actions[1]!.run();
      await flush();
      expect(toasts.current()!.actions[1]!.label).toBe('复制失败');
    });

    it('a second export replaces the toast: only the latest path has buttons', async () => {
      const first = toasts.current()!;
      api.exportOkr.mockResolvedValue(saved('/tmp/second.md'));
      await flow.export('md');
      const second = toasts.current()!;
      expect(second.id).not.toBe(first.id);
      expect(second.detailFull).toBe('/tmp/second.md');
    });

    it('closing the toast with its button gives the focus back to the trigger', () => {
      focusTrigger.mockClear();
      toasts.current()!.onClose!();
      expect(focusTrigger).toHaveBeenCalled();
    });
  });

  describe('cancelled', () => {
    beforeEach(async () => {
      api.exportOkr.mockResolvedValue(ok({ outcome: 'cancelled' }));
      await flow.export('md');
      await flush();
    });

    it('is a neutral toast: no buttons, 5 seconds, not an error, not a success', () => {
      const toast = toasts.current()!;
      expect(toast.kind).toBe('neutral');
      expect(toast.message).toBe('已取消导出，没有保存文件。');
      expect(toast.actions).toEqual([]);
      expect(toast.detail).toBeUndefined();
      expect(toast.autoDismissMs).toBe(5000);
    });

    it('the focus goes back to the export button', () => {
      expect(focusTrigger).toHaveBeenCalled();
    });
  });

  describe('failed', () => {
    const table: Array<[ExportFailureCategory, string, string]> = [
      ['permission', '没有权限保存到这个位置，请换一个文件夹。', '重新选择位置'],
      ['disk_full', '磁盘已满，没有保存成功。', '重新选择位置'],
      ['not_found', '保存位置不存在或暂时不可用，请换一个文件夹。', '重新选择位置'],
      ['busy', '这个文件正在被其他程序使用，没有保存成功。', '重新选择位置'],
      ['exists', '同名文件已存在，请换个名字再导出', '重新选择位置'],
      ['other', '导出失败，请重试。', '重试'],
    ];

    it.each(table)(
      '%s → 「%s」, button 「%s」 + 「关闭」, never auto-dismissed',
      async (category, message, again) => {
        api.exportOkr.mockResolvedValue(ok({ outcome: 'failed', category }));
        await flow.export('json');
        await flush();
        const toast = toasts.current()!;
        expect(toast.kind).toBe('error');
        expect(toast.message).toBe(message);
        expect(toast.actions.map((a) => a.label)).toEqual([again]);
        expect(toast.closeLabel).toBe('关闭');
        expect(toast.autoDismissMs).toBeNull();
        expect(toast.detail).toBeUndefined();
        expect(focusTrigger).toHaveBeenCalled();
      },
    );

    it('the button runs the export again with the same format (and removes the old toast)', async () => {
      api.exportOkr.mockResolvedValueOnce(ok({ outcome: 'failed', category: 'exists' }));
      await flow.export('json');
      await flush();
      api.exportOkr.mockResolvedValueOnce(ok({ outcome: 'cancelled' }));
      toasts.current()!.actions[0]!.run();
      await flush();
      expect(api.exportOkr).toHaveBeenCalledTimes(2);
      expect(api.exportOkr).toHaveBeenLastCalledWith({ okrId: 'okr-1', format: 'json' });
      expect(toasts.current()!.kind).toBe('neutral');
    });

    it('an IPC error (not a category) is the generic 「导出失败，请重试。」 and shows no raw text', async () => {
      api.exportOkr.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL', message: '/secret/path EACCES' },
      });
      await flow.export('md');
      await flush();
      expect(toasts.current()!.message).toBe('导出失败，请重试。');
      expect(JSON.stringify(toasts.current())).not.toContain('secret');
    });
  });

  describe('loading (> 300ms)', () => {
    it('is not shown for a quick export', async () => {
      api.exportOkr.mockResolvedValue(ok({ outcome: 'cancelled' }));
      await flow.export('md');
      expect(flow.slow()).toBe(false);
      expect(flow.statusText()).toBe('');
    });

    it('turns on after 300ms with 「正在导出…」 and off when the reply is in', async () => {
      let reply: (value: unknown) => void = () => undefined;
      api.exportOkr.mockReturnValue(new Promise((r) => (reply = r)));
      const running = flow.export('md');
      expect(flow.busy()).toBe(true);
      jest.advanceTimersByTime(EXPORT_SLOW_MS - 1);
      expect(flow.slow()).toBe(false);
      jest.advanceTimersByTime(1);
      expect(flow.slow()).toBe(true);
      expect(flow.statusText()).toBe('正在导出…');
      reply(ok({ outcome: 'cancelled' }));
      await running;
      expect(flow.busy()).toBe(false);
      expect(flow.slow()).toBe(false);
      expect(flow.statusText()).toBe('');
    });

    it('ignores a second request while one is running', async () => {
      let reply: (value: unknown) => void = () => undefined;
      api.exportOkr.mockReturnValue(new Promise((r) => (reply = r)));
      const running = flow.export('md');
      await flow.export('json');
      await flow.copyMarkdown();
      await flush();
      expect(api.exportOkr).toHaveBeenCalledTimes(1);
      expect(api.copyMarkdown).not.toHaveBeenCalled();
      reply(ok({ outcome: 'cancelled' }));
      await running;
    });
  });

  describe('復制為 Markdown', () => {
    it('success: 「已复制到剪贴板。」 (8s, status)', async () => {
      api.copyMarkdown.mockResolvedValue(ok({ copied: true }));
      await flow.copyMarkdown();
      expect(api.copyMarkdown).toHaveBeenCalledWith({ okrId: 'okr-1' });
      const toast = toasts.current()!;
      expect(toast.kind).toBe('success');
      expect(toast.message).toBe('已复制到剪贴板。');
      expect(toast.autoDismissMs).toBe(8000);
    });

    it('failure: 「复制失败，请重试。」 as an alert with 「重试」 and 「关闭」; retry copies again', async () => {
      api.copyMarkdown.mockResolvedValueOnce({
        ok: false,
        error: { code: 'INTERNAL', message: 'x' },
      });
      await flow.copyMarkdown();
      const toast = toasts.current()!;
      expect(toast.kind).toBe('error');
      expect(toast.message).toBe('复制失败，请重试。');
      expect(toast.actions.map((a) => a.label)).toEqual(['重试']);
      expect(toast.closeLabel).toBe('关闭');
      api.copyMarkdown.mockResolvedValueOnce(ok({ copied: true }));
      toast.actions[0]!.run();
      await flush();
      expect(toasts.current()!.message).toBe('已复制到剪贴板。');
    });
  });
});
