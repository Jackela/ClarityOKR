import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ReviewRecord } from '@clarityokr/contracts';

import { Logger } from '../core/services/logger.service';
import { OkrStickyService } from '../okr-sticky/services/okr-sticky.service';
import { ToastService } from '../shared/components/toast.service';
import { ClosedLoopApi } from './closed-loop-api.service';
import { ClosedLoopStore } from './closed-loop.store';
import { ReviewStore } from './review.store';
import { ReviewTabComponent } from './review-tab.component';
import { makeDetail, makeKr } from './testing/fixtures';

const ok = <T>(data: T) => ({ ok: true as const, data });
const T1 = '2026-10-10T06:20:00.000Z';

function review(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    objectiveId: 'okr-1',
    wentWell: '发布更稳',
    fellShort: '',
    nextSteps: '',
    snapshot: [
      {
        krId: 'kr-1',
        statement: '快照里的文字',
        successMetric: '快照里的度量',
        progress: 65,
        status: 'in_progress',
        removed: false,
      },
      {
        krId: 'old',
        statement: '后来被移除的 KR',
        successMetric: null,
        progress: 40,
        status: 'at_risk',
        removed: true,
      },
    ],
    savedAt: T1,
    snapshotAt: T1,
    ...overrides,
  };
}

describe('ReviewTabComponent (spec §5, T7, C4)', () => {
  let fixture: ComponentFixture<ReviewTabComponent>;
  let api: Record<string, jest.Mock>;
  let store: ClosedLoopStore;
  let toasts: ToastService;

  const root = (): HTMLElement => fixture.nativeElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
    root().querySelector(`[data-testid="${id}"]`);
  const text = (id: string): string => q(id)!.textContent!.replace(/\s+/g, ' ').trim();
  const area = (key: string): HTMLTextAreaElement => q<HTMLTextAreaElement>(`review-${key}`)!;
  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  };
  const type = async (key: string, value: string): Promise<void> => {
    area(key).value = value;
    area(key).dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  };

  async function show(
    options: {
      review?: ReviewRecord | null;
      krs?: ReturnType<typeof makeKr>[];
      mode?: string;
    } = {},
  ): Promise<void> {
    api['getReview']!.mockResolvedValue(ok({ review: options.review ?? null }));
    api['getStorageMode']!.mockResolvedValue(options.mode ?? 'normal');
    store.currentId.set('okr-1');
    store.detail.set(makeDetail(options.krs ?? [makeKr({ progress: 65, status: 'in_progress' })]));
    store.detailState.set('ready');
    fixture = TestBed.createComponent(ReviewTabComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await settle();
    await settle();
  }

  beforeEach(() => {
    api = { getReview: jest.fn(), saveReview: jest.fn(), getStorageMode: jest.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: ClosedLoopApi, useValue: api },
        { provide: OkrStickyService, useValue: { openFromDetail: jest.fn() } },
        { provide: Logger, useValue: { warn: jest.fn(), error: jest.fn() } },
      ],
    });
    store = TestBed.inject(ClosedLoopStore);
    toasts = TestBed.inject(ToastService);
  });

  afterEach(() => fixture?.nativeElement.remove());

  describe('states', () => {
    it('loading: skeleton in place of the snapshot and the text areas, aria-busy', async () => {
      api['getReview']!.mockReturnValue(new Promise(() => undefined));
      store.currentId.set('okr-1');
      fixture = TestBed.createComponent(ReviewTabComponent);
      fixture.detectChanges();
      await settle();
      expect(q('review-loading')!.getAttribute('aria-busy')).toBe('true');
      expect(root().querySelector('textarea')).toBeNull();
    });

    it('read error: centred 没能读取复盘。 with a working 重试', async () => {
      api['getReview']!.mockResolvedValue({ ok: false, error: { code: 'INTERNAL', message: 'x' } });
      store.currentId.set('okr-1');
      store.detail.set(makeDetail());
      fixture = TestBed.createComponent(ReviewTabComponent);
      fixture.detectChanges();
      await settle();
      expect(q('review-load-error')!.querySelector('[role="alert"]')!.textContent).toBe(
        '没能读取复盘。',
      );
      api['getReview']!.mockResolvedValue(ok({ review: null }));
      q('review-load-retry')!.click();
      await settle();
      expect(q('review-load-error')).toBeNull();
      expect(area('wentWell')).not.toBeNull();
    });

    it('no OKR open: the same empty state as the note', async () => {
      fixture = TestBed.createComponent(ReviewTabComponent);
      fixture.detectChanges();
      await settle();
      expect(q('review-no-okr')!.textContent).toContain('还没有 OKR');
    });

    it('default, never written: 还没有复盘, 保存时会固化为快照, empty areas, 保存复盘 disabled', async () => {
      await show();
      expect(text('review-state')).toBe('还没有复盘');
      expect(text('review-snapshot-tag')).toBe('保存时会固化为快照');
      expect(q('review-snapshot-note')).toBeNull();
      expect(['wentWell', 'fellShort', 'nextSteps'].map((k) => area(k).value)).toEqual([
        '',
        '',
        '',
      ]);
      expect(q<HTMLButtonElement>('review-save')!.disabled).toBe(true);
      expect(text('review-save')).toBe('保存复盘');
    });

    it('default, saved and unchanged: 已保存 · 时间, 快照 · 时间 + the note, text kept, still editable', async () => {
      await show({ review: review() });
      expect(text('review-state')).toMatch(/^已保存 · .+$/);
      expect(text('review-snapshot-tag')).toMatch(/^快照 · .+$/);
      expect(text('review-snapshot-note')).toBe('之后的进度变化不会改动这里。');
      expect(area('wentWell').value).toBe('发布更稳');
      expect(area('wentWell').readOnly).toBe(false);
      expect(q<HTMLButtonElement>('review-save')!.disabled).toBe(true);
    });

    it('editing: the state row says 有未保存的修改 (with a dot and text) and saving is allowed', async () => {
      await show();
      await type('wentWell', '这个周期发布很稳');
      expect(text('review-state')).toBe('有未保存的修改');
      expect(q('review-state')!.querySelector('.review__dot')).not.toBeNull();
      expect(q<HTMLButtonElement>('review-save')!.disabled).toBe(false);
    });

    it('all three sections blank after typing: 请至少填写一段 explains the disabled button', async () => {
      await show();
      await type('wentWell', '   ');
      expect(q<HTMLButtonElement>('review-save')!.disabled).toBe(true);
      expect(text('review-need-one')).toBe('请至少填写一段');
      expect(q<HTMLButtonElement>('review-save')!.getAttribute('aria-describedby')).toBe(
        'review-need-one',
      );
    });

    it('over 2000 (C4): content kept, 2px error border, ⚠ counter, error row, save disabled and described by it', async () => {
      await show();
      const long = '字'.repeat(2036);
      await type('fellShort', long);
      expect(area('fellShort').value).toBe(long);
      expect(text('review-fellShort-count')).toBe('⚠ 2036/2000');
      expect(text('review-fellShort-error')).toContain('超出 36 个字符，请删减后再保存。');
      expect(area('fellShort').classList).toContain('field__input--invalid');
      expect(area('fellShort').getAttribute('aria-invalid')).toBe('true');
      const save = q<HTMLButtonElement>('review-save')!;
      expect(save.disabled).toBe(true);
      expect(save.getAttribute('aria-describedby')).toBe(q('review-fellShort-error')!.id);
      expect(q('review-fellShort-alert')!.textContent).toContain('没做到超出 36 个字符。');
    });

    it('an OKR with no key results: replacement text, the review is still writable and saveable', async () => {
      await show({ krs: [] });
      expect(text('review-no-kr')).toBe('这条 OKR 还没有关键结果，没有进度可记录。');
      expect(q('review-snapshot')).toBeNull();
      await type('wentWell', '仍然可写');
      expect(q<HTMLButtonElement>('review-save')!.disabled).toBe(false);
    });

    it('no key result has progress: rows show — and an info line counts them', async () => {
      await show({ krs: [makeKr({ id: 'a' }), makeKr({ id: 'b', position: 1 })] });
      expect(text('review-unfilled')).toBe('有 2 个关键结果还没填写进度，快照里会记为「—」。');
      expect(root().querySelectorAll('.snap__progress')[0]!.textContent!.trim()).toBe('—');
      expect(text('review-overall')).toBe('整体进度 —');
    });
  });

  describe('snapshot', () => {
    it('before the first save it previews the live key results (removed ones are not in it)', async () => {
      await show({
        krs: [
          makeKr({
            id: 'a',
            statement: '实时的 KR',
            successMetric: '实时度量',
            progress: 80,
            status: 'in_progress',
          }),
          makeKr({ id: 'gone', position: 1, removedAt: '2026-10-03T08:00:00.000Z' }),
        ],
      });
      const rows = root().querySelectorAll('[data-testid="review-row"]');
      expect(rows).toHaveLength(1);
      expect(rows[0]!.textContent).toContain('实时的 KR');
      expect(rows[0]!.textContent).toContain('度量：实时度量');
      expect(rows[0]!.textContent).toContain('80%');
      expect(text('review-overall')).toBe('整体进度 80%');
    });

    it('a KR without a metric says 未设置度量 and is no 添加度量 button', async () => {
      await show();
      expect(root().querySelector('.snap__metric')!.textContent!.trim()).toBe('未设置度量');
      expect(root().querySelector('table button')).toBeNull();
    });

    it('after saving it shows the SNAPSHOT, not the live key results, incl. 已移除 rows', async () => {
      await show({
        review: review(),
        krs: [makeKr({ statement: '现在已被改写的文字', progress: 10 })],
      });
      const rows = Array.from(root().querySelectorAll('[data-testid="review-row"]'));
      expect(rows).toHaveLength(2);
      expect(rows[0]!.textContent).toContain('快照里的文字');
      expect(rows[0]!.textContent).toContain('度量：快照里的度量');
      expect(rows[0]!.textContent).not.toContain('现在已被改写的文字');
      expect(rows[1]!.textContent).toContain('已移除');
      expect(rows[1]!.textContent).toContain('40%');
      expect(rows[1]!.textContent).toContain('有风险');
      expect(text('review-overall')).toBe('整体进度 65%');
    });

    it('is a real table (序号, 关键结果, 进度, 状态 as column headers) with nothing focusable in it', async () => {
      await show({ review: review() });
      const table = root().querySelector('table')!;
      expect(
        Array.from(table.querySelectorAll('th[scope="col"]')).map((h) => h.textContent),
      ).toEqual(['序号', '关键结果', '进度', '状态']);
      expect(table.querySelectorAll('button, a, input, textarea, [tabindex]')).toHaveLength(0);
    });

    it('the status is a label (icon + text), not a button', async () => {
      await show({ review: review() });
      const tag = root().querySelector('.tag--in_progress')!;
      expect(tag.tagName).toBe('SPAN');
      expect(tag.textContent).toContain('进行中');
    });

    it('drift: when the note changed after the snapshot a hint with 去便签查看 appears', async () => {
      await show({
        review: review(),
        krs: [makeKr({ id: 'kr-1', statement: '改写了', progress: 65, status: 'in_progress' })],
      });
      expect(q('review-drift')!.textContent).toContain(
        '便签上的关键结果之后有更新（进度、状态、文字或度量），这里保持保存时的快照。',
      );
      const go = jest.fn();
      fixture.componentInstance.goNote.subscribe(go);
      q('review-go-note')!.click();
      expect(go).toHaveBeenCalledTimes(1);
    });

    it('no drift hint while the note equals the snapshot', async () => {
      await show({
        review: review({ snapshot: review().snapshot.filter((row) => !row.removed) }),
        krs: [
          makeKr({
            id: 'kr-1',
            statement: '快照里的文字',
            successMetric: '快照里的度量',
            progress: 65,
            status: 'in_progress',
          }),
        ],
      });
      expect(q('review-drift')).toBeNull();
    });
  });

  describe('form', () => {
    it('three labelled areas in order with the spec placeholders and a hidden position sentence', async () => {
      await show();
      const labels = Array.from(root().querySelectorAll('label')).map((l) => l.textContent!.trim());
      expect(labels).toEqual(['做得好', '没做到', '下一步']);
      expect(area('wentWell').placeholder).toBe('例如：这个周期里哪些事比预期顺利？');
      expect(area('fellShort').placeholder).toBe('例如：哪些目标没有达到，原因是什么？');
      expect(area('nextSteps').placeholder).toBe('例如：下个周期最先做的一件事是什么？');
      const describedBy = area('fellShort').getAttribute('aria-describedby')!;
      expect(document.getElementById(describedBy.split(' ').pop()!)!.textContent).toBe(
        '这是复盘的第 2 段，共 3 段',
      );
      expect(root().textContent).toContain('字数按字符计，一个 emoji 算 1 个字符。');
    });

    it('Tab order: three text areas, then the save button; nothing else focusable before them', async () => {
      await show({ review: review() });
      await type('wentWell', '改一下');
      const focusables = Array.from(
        root().querySelectorAll<HTMLElement>('textarea, button, a[href]'),
      )
        .filter((el) => !(el as HTMLButtonElement).disabled)
        .map((el) => el.getAttribute('data-testid'));
      // the drift hint's button sits between the snapshot and the areas only when it shows
      expect(focusables.filter((id) => id !== 'review-go-note')).toEqual([
        'review-wentWell',
        'review-fellShort',
        'review-nextSteps',
        'review-save',
      ]);
    });

    it('the objective in the context row is one ellipsised line whose title is the full text', async () => {
      await show();
      const h1 = q('review-objective')!;
      expect(h1.getAttribute('title')).toBe(store.detail()!.objective.title);
      expect(text('review-period')).toBe('未设置周期');
    });
  });

  describe('saving', () => {
    it('click saves, shows the toast 复盘已保存。 and flips status row + snapshot tag', async () => {
      await show();
      await type('wentWell', '发布更稳');
      api['saveReview']!.mockResolvedValue(ok({ review: review() }));
      q('review-save')!.click();
      await settle();
      expect(api['saveReview']).toHaveBeenCalledWith({
        okrId: 'okr-1',
        wentWell: '发布更稳',
        fellShort: '',
        nextSteps: '',
      });
      expect(toasts.current()).toMatchObject({ kind: 'success', message: '复盘已保存。' });
      expect(text('review-state')).toMatch(/^已保存 · /);
      expect(text('review-snapshot-tag')).toMatch(/^快照 · /);
      await new Promise((resolve) => setTimeout(resolve, 100)); // the live region is rewritten
      fixture.detectChanges();
      expect(text('review-saved-live')).toMatch(/^复盘已保存，进度快照为 .+ 时的状态。$/);
    });

    it('a second save with the same snapshot time is announced again (cleared, then rewritten)', async () => {
      await show({ review: review() });
      api['saveReview']!.mockResolvedValue(ok({ review: review() }));
      const sentence = /^复盘已保存，进度快照为 .+ 时的状态。$/;
      const wait = async (): Promise<void> => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        fixture.detectChanges();
      };
      await type('wentWell', '第一次');
      q('review-save')!.click();
      await settle();
      await wait();
      expect(text('review-saved-live')).toMatch(sentence);
      await type('wentWell', '第二次');
      q('review-save')!.click();
      await settle();
      // right after the save the region is EMPTY (that is what makes a screen reader speak again)
      expect(text('review-saved-live')).toBe('');
      await wait();
      expect(text('review-saved-live')).toMatch(sentence);
    });

    it('a save that finishes after the tab is gone shows no toast', async () => {
      await show();
      await type('wentWell', '好');
      let release: (value: unknown) => void = () => undefined;
      api['saveReview']!.mockReturnValue(new Promise((r) => (release = r)));
      const pending = fixture.componentInstance.save();
      fixture.destroy();
      release(ok({ review: review() }));
      await pending;
      expect(toasts.current()).toBeNull();
    });

    it('a save whose text was discarded meanwhile shows no toast and adopts nothing', async () => {
      await show();
      await type('wentWell', '好');
      let release: (value: unknown) => void = () => undefined;
      api['saveReview']!.mockReturnValue(new Promise((r) => (release = r)));
      const pending = fixture.componentInstance.save();
      TestBed.inject(ReviewStore).discard();
      release(ok({ review: review() }));
      await pending;
      expect(toasts.current()).toBeNull();
      expect(TestBed.inject(ReviewStore).review()).toBeNull();
    });

    it('while saving: button loading, areas read-only, 正在保存复盘… announced', async () => {
      await show();
      await type('wentWell', '好');
      let release: (value: unknown) => void = () => undefined;
      api['saveReview']!.mockReturnValue(new Promise((r) => (release = r)));
      q('review-save')!.click();
      fixture.detectChanges();
      expect(q('review-save')!.getAttribute('aria-busy')).toBe('true');
      expect(area('wentWell').readOnly).toBe(true);
      expect(root().textContent).toContain('正在保存复盘…');
      release(ok({ review: review() }));
      await settle();
      expect(area('wentWell').readOnly).toBe(false);
    });

    it('memory mode adds （仅本次运行） to the toast and the status row; normal mode does not', async () => {
      await show({ mode: 'memory' });
      await type('wentWell', '发布更稳');
      api['saveReview']!.mockResolvedValue(ok({ review: review() }));
      q('review-save')!.click();
      await settle();
      expect(toasts.current()!.message).toBe('复盘已保存（仅本次运行）。');
      expect(text('review-state')).toMatch(/^已保存（仅本次运行）· /);
    });

    it('fresh-file mode keeps the normal wording', async () => {
      await show({ mode: 'fresh-file' });
      await type('wentWell', '发布更稳');
      api['saveReview']!.mockResolvedValue(ok({ review: review() }));
      q('review-save')!.click();
      await settle();
      expect(toasts.current()!.message).toBe('复盘已保存。');
    });

    it('failure: red alert bar with 重试, the text is still there, no raw error, no toast', async () => {
      await show();
      await type('wentWell', '我写的内容');
      api['saveReview']!.mockResolvedValue({
        ok: false,
        error: { code: 'INTERNAL', message: 'SQLITE_BUSY: /secret/path.db' },
      });
      q('review-save')!.click();
      await settle();
      const bar = q('review-save-failed')!;
      expect(bar.getAttribute('role')).toBe('alert');
      expect(bar.textContent).toContain('没能保存复盘，你写的内容还在。');
      expect(root().textContent).not.toContain('SQLITE');
      expect(area('wentWell').value).toBe('我写的内容');
      expect(toasts.current()).toBeNull();
      api['saveReview']!.mockResolvedValue(ok({ review: review() }));
      q('review-save-retry')!.click();
      await settle();
      expect(q('review-save-failed')).toBeNull();
      expect(toasts.current()!.message).toBe('复盘已保存。');
    });

    it('main-side over-limit rejection: 没能保存：内容超出字数上限。 and no retry button', async () => {
      await show();
      await type('wentWell', '好');
      api['saveReview']!.mockResolvedValue({
        ok: false,
        error: { code: 'INVALID_REQUEST', reason: 'too_long', field: 'wentWell', message: 'x' },
      });
      q('review-save')!.click();
      await settle();
      expect(q('review-save-failed')!.textContent).toContain('没能保存：内容超出字数上限。');
      expect(q('review-save-retry')).toBeNull();
    });

    describe('Ctrl/⌘+S', () => {
      const press = (init: KeyboardEventInit): KeyboardEvent => {
        const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
        document.dispatchEvent(event);
        return event;
      };

      it('saves', async () => {
        await show();
        await type('wentWell', '好');
        api['saveReview']!.mockResolvedValue(ok({ review: review() }));
        expect(press({ key: 's', ctrlKey: true }).defaultPrevented).toBe(true);
        await settle();
        expect(api['saveReview']).toHaveBeenCalledTimes(1);
        press({ key: 's', metaKey: true });
        await type('wentWell', '好好');
        press({ key: 's', metaKey: true });
        await settle();
        expect(api['saveReview']).toHaveBeenCalledTimes(2);
      });

      it('does nothing when saving is not allowed (over the limit, unchanged, all blank)', async () => {
        await show();
        press({ key: 's', ctrlKey: true });
        await type('wentWell', '字'.repeat(2001));
        press({ key: 's', ctrlKey: true });
        await type('wentWell', ' ');
        press({ key: 's', ctrlKey: true });
        await settle();
        expect(api['saveReview']).not.toHaveBeenCalled();
      });

      it('ignores Ctrl+S while an IME is composing', async () => {
        await show();
        await type('wentWell', '好');
        press({ key: 's', ctrlKey: true, isComposing: true });
        await settle();
        expect(api['saveReview']).not.toHaveBeenCalled();
      });

      it('ignores other combinations', async () => {
        await show();
        await type('wentWell', '好');
        press({ key: 's' });
        press({ key: 's', ctrlKey: true, shiftKey: true });
        press({ key: 's', ctrlKey: true, altKey: true });
        await settle();
        expect(api['saveReview']).not.toHaveBeenCalled();
      });
    });
  });

  it('switching to another OKR reads its review and drops the typed text', async () => {
    await show();
    await type('wentWell', '属于第一个');
    api['getReview']!.mockResolvedValue(ok({ review: null }));
    store.currentId.set('okr-2');
    fixture.detectChanges();
    await settle();
    await settle();
    expect(api['getReview']).toHaveBeenLastCalledWith({ okrId: 'okr-2' });
    expect(area('wentWell').value).toBe('');
  });
});
