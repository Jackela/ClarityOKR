/**
 * Closed-loop states of the note panel: period, overall progress, key result list, removed
 * section, not-pinned banner, loading / error. Uses the real store with a faked API.
 */
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ClosedLoopError, KeyResultRecord } from '@clarityokr/contracts';

import { ClosedLoopApi } from '../../closed-loop/closed-loop-api.service';
import { ClosedLoopStore } from '../../closed-loop/closed-loop.store';
import { makeDetail, makeKr } from '../../closed-loop/testing/fixtures';
import { Logger } from '../../core/services/logger.service';
import { OkrStickyService, type OkrStickyViewModel } from '../services/okr-sticky.service';
import { OkrStickyNoteComponent } from './okr-sticky-note.component';

const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (code: ClosedLoopError['code'] = 'INTERNAL') => ({
  ok: false as const,
  error: { code, message: 'x' } as ClosedLoopError,
});

const view: OkrStickyViewModel = {
  id: 'okr-1',
  objective: '提升团队交付节奏',
  keyResults: [{ id: 'kr-1', statement: '把迭代周期缩短到 3 周', metricLabel: null }],
  generatedAt: '2026-10-09T08:00:00.000Z',
  lastEditedAt: null,
  hasManualEdits: false,
  regenerationPolicy: 'append',
};

describe('OkrStickyNoteComponent closed-loop states', () => {
  let fixture: ComponentFixture<OkrStickyNoteComponent>;
  let api: Record<string, jest.Mock>;
  let store: ClosedLoopStore;

  const root = (): HTMLElement => fixture.nativeElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string): T =>
    root().querySelector(`[data-testid="${id}"]`) as T;
  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  };

  async function show(
    krs: KeyResultRecord[],
    objective: Partial<ReturnType<typeof makeDetail>['objective']> = {},
  ) {
    api['open']!.mockResolvedValue(ok(makeDetail(krs, objective)));
    fixture.componentInstance.okr = view;
    fixture.componentInstance.ngOnChanges();
    fixture.detectChanges();
    await settle();
  }

  beforeEach(async () => {
    api = {
      open: jest.fn(),
      pin: jest.fn(),
      setPeriod: jest.fn(),
      setProgress: jest.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [OkrStickyNoteComponent],
      providers: [
        { provide: ClosedLoopApi, useValue: api },
        { provide: OkrStickyService, useValue: { openFromDetail: jest.fn() } },
        { provide: Logger, useValue: { warn: jest.fn(), error: jest.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(OkrStickyNoteComponent);
    document.body.appendChild(fixture.nativeElement);
    store = TestBed.inject(ClosedLoopStore);
  });

  afterEach(() => fixture.nativeElement.remove());

  describe('page states', () => {
    it('loading: the objective and a busy skeleton, no empty page', () => {
      api['open']!.mockReturnValue(new Promise(() => undefined));
      fixture.componentInstance.okr = view;
      fixture.componentInstance.ngOnChanges();
      fixture.detectChanges();
      expect(q('sticky-objective').textContent).toBe('提升团队交付节奏');
      expect(q('detail-loading').getAttribute('aria-busy')).toBe('true');
      expect(root().querySelector('section')!.getAttribute('aria-busy')).toBe('true');
      expect(q('overall-progress')).toBeNull();
    });

    it('error: alert with 重试 and no raw error text; retry loads the OKR', async () => {
      api['open']!.mockResolvedValue(fail());
      fixture.componentInstance.okr = view;
      fixture.componentInstance.ngOnChanges();
      fixture.detectChanges();
      await settle();
      expect(q('detail-error').querySelector('[role="alert"]')!.textContent).toContain(
        '没能读取这条 OKR。',
      );
      expect(q('detail-error').textContent).not.toContain('INTERNAL');
      api['open']!.mockResolvedValue(ok(makeDetail()));
      q('detail-retry').click();
      await settle();
      expect(q('detail-error')).toBeNull();
      expect(root().querySelectorAll('[data-testid="sticky-key-result"]')).toHaveLength(1);
    });

    it('an OKR without key results shows the empty list text but keeps overall progress "—"', async () => {
      await show([]);
      expect(q('kr-empty').textContent).toContain('还没有关键结果');
      expect(q('overall-value').textContent!.trim()).toBe('—');
      expect(q('sticky-add-kr')).not.toBeNull();
    });
  });

  describe('ready', () => {
    it('shows overall progress from the stored KRs, ignoring removed ones', async () => {
      await show([
        makeKr({ id: 'a', progress: 65, status: 'in_progress' }),
        makeKr({ id: 'b', position: 1, progress: 71, status: 'in_progress' }),
        makeKr({ id: 'c', position: 2, progress: null }),
        makeKr({ id: 'd', position: 3, progress: 40, removedAt: '2026-10-03T08:00:00.000Z' }),
      ]);
      expect(q('overall-value').textContent!.trim()).toBe('68%');
      expect(q('overall-summary').textContent!.trim()).toBe('3 个关键结果中 2 个已填写进度');
      expect(root().querySelector('[role="progressbar"]')!.getAttribute('aria-valuetext')).toBe(
        '整体进度 68%',
      );
      expect(q('kr-list').tagName).toBe('OL');
      expect(root().querySelectorAll('[data-testid="sticky-key-result"]')).toHaveLength(3);
      expect(root().querySelector('h2')!.textContent!.trim()).toBe('关键结果 3');
    });

    it('has no owner / metric badges and no English date format', async () => {
      await show([makeKr({ successMetric: '周期 <= 21 天' })]);
      expect(root().querySelectorAll('[data-testid="sticky-kr-badge"]')).toHaveLength(0);
      expect(root().textContent).not.toMatch(/Oct|Jan|AM|PM/);
      expect(root().textContent).not.toContain('负责人');
    });

    it('has a single 添加 control and the regenerate entry in the section head', async () => {
      await show([makeKr()]);
      expect(root().querySelectorAll('[data-testid="sticky-add-kr"]')).toHaveLength(1);
      expect(q('sticky-add-kr').textContent).toContain('添加');
      expect(q('regenerate-button')).not.toBeNull();
    });

    it('「＋ 添加」 opens the text form with one more, empty, focused key result (§3.10)', async () => {
      await show([makeKr({ id: 'a' })]);
      q('sticky-add-kr').click();
      fixture.detectChanges();
      await settle();
      const statements = Array.from(
        root().querySelectorAll<HTMLTextAreaElement>('textarea[data-testid^="edit-kr-"]'),
      );
      expect(statements).toHaveLength(2);
      expect(statements[1]!.value).toBe('');
      expect(statements[1]!.placeholder).toBe('写下一个可衡量的关键结果');
      expect(document.activeElement).toBe(statements[1]);
      // nothing changed in the data yet
      expect(fixture.componentInstance.editor.isDirty()).toBe(true);
      expect(fixture.componentInstance.editor.isValid()).toBe(false);
      expect(q<HTMLButtonElement>('edit-save').disabled).toBe(true);
    });

    it('"添加度量" opens the text editor', async () => {
      await show([makeKr()]);
      q('kr-add-metric').click();
      fixture.detectChanges();
      expect(fixture.componentInstance.editor.isEditing()).toBe(true);
      expect(q('kr-list')).toBeNull();
    });

    it('shows 最近编辑 in the Chinese relative format when edited', async () => {
      api['open']!.mockResolvedValue(ok(makeDetail()));
      fixture.componentInstance.okr = { ...view, lastEditedAt: new Date().toISOString() };
      fixture.componentInstance.ngOnChanges();
      fixture.detectChanges();
      await settle();
      expect(q('sticky-last-edited').textContent!.trim()).toMatch(/^最近编辑 今天 \d\d:\d\d$/);
    });
  });

  describe('removed key results', () => {
    const krs = [
      makeKr({ id: 'a', progress: 50, status: 'in_progress' }),
      makeKr({
        id: 'b',
        position: 1,
        statement: '旧的关键结果',
        successMetric: '旧度量',
        progress: 40,
        status: 'at_risk',
        removedAt: new Date(2026, 9, 3, 9).toISOString(),
      }),
    ];

    it('is collapsed by default, with a labelled toggle and no editing buttons inside', async () => {
      await show(krs);
      const toggle = q('removed-toggle');
      expect(toggle.textContent).toContain('已移除的关键结果（1）');
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(toggle.getAttribute('aria-controls')).toBe('removed-list');
      expect(q('removed-key-result')).toBeNull();
      toggle.click();
      fixture.detectChanges();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      const item = q('removed-key-result');
      expect(item.textContent).toContain('旧的关键结果');
      expect(item.textContent).toContain('度量：旧度量');
      expect(item.textContent).toContain('已移除 · 10-03');
      expect(item.textContent).toContain('最后进度 40% · 有风险');
      // #53: the only control is the read-only 「进度记录」 toggle
      const controls = Array.from(item.querySelectorAll('button, input'));
      expect(controls.map((c) => c.getAttribute('data-testid'))).toEqual(['removed-history-toggle']);
      expect(controls[0]!.getAttribute('aria-label')).toBe('旧的关键结果 的进度记录（已移除）');
      expect(q('removed-section').textContent).toContain('已移除的关键结果不计入整体进度。');
      // not part of the numbered list and not counted
      expect(root().querySelectorAll('[data-testid="sticky-key-result"]')).toHaveLength(1);
    });

    it('shows 最后进度 — for a removed KR without progress and hides the empty metric', async () => {
      await show([
        makeKr({ id: 'a' }),
        makeKr({ id: 'b', position: 1, removedAt: '2026-10-03T08:00:00.000Z' }),
      ]);
      q('removed-toggle').click();
      fixture.detectChanges();
      expect(q('removed-key-result').textContent).toContain('最后进度 — · 未开始');
      expect(q('removed-key-result').textContent).not.toContain('度量');
      expect(q('removed-key-result').textContent).not.toContain('添加度量');
    });

    it('an OKR with only removed key results: empty list text, 「—」, section collapsed (B1)', async () => {
      await show([
        makeKr({ id: 'a', removedAt: '2026-10-03T08:00:00.000Z' }),
        makeKr({ id: 'b', position: 1, removedAt: '2026-10-03T08:00:00.000Z' }),
      ]);
      expect(q('kr-empty').textContent).toContain('还没有关键结果');
      expect(q('overall-value').textContent!.trim()).toBe('—');
      expect(q('removed-toggle').getAttribute('aria-expanded')).toBe('false');
      expect(q('removed-toggle').textContent).toContain('已移除的关键结果（2）');
      expect(q('removed-key-result')).toBeNull();
    });

    it('the section is absent when nothing was removed', async () => {
      await show([makeKr()]);
      expect(q('removed-section')).toBeNull();
    });
  });

  describe('period', () => {
    it('saves the chosen quarter and announces it', async () => {
      await show([makeKr()]);
      api['setPeriod']!.mockResolvedValue(
        ok({ period: '2026-Q3', updatedAt: '2026-10-10T00:00:00.000Z' }),
      );
      q('period-picker').click();
      fixture.detectChanges();
      const target = Array.from(root().querySelectorAll<HTMLElement>('[role="option"]')).find((o) =>
        o.textContent!.includes('2026-Q3'),
      )!;
      target.click();
      await settle();
      expect(api['setPeriod']).toHaveBeenCalledWith({ okrId: 'okr-1', period: '2026-Q3' });
      expect(q('period-live').textContent).toBe('周期已设为 2026-Q3。');
      expect(q('period-picker').textContent).toContain('2026-Q3');
    });

    it('announces 已取消周期。 when set to 不设置', async () => {
      await show([makeKr()], { period: '2026-Q3' });
      api['setPeriod']!.mockResolvedValue(
        ok({ period: null, updatedAt: '2026-10-10T00:00:00.000Z' }),
      );
      q('period-picker').click();
      fixture.detectChanges();
      root().querySelectorAll<HTMLElement>('[role="option"]')[0]!.click();
      await settle();
      expect(q('period-live').textContent).toBe('已取消周期。');
      expect(q('period-picker').textContent).toContain('不设置周期');
    });

    it('reports a failed save in the live region and keeps the old period', async () => {
      await show([makeKr()], { period: '2026-Q3' });
      api['setPeriod']!.mockResolvedValue(fail());
      q('period-picker').click();
      fixture.detectChanges();
      root().querySelectorAll<HTMLElement>('[role="option"]')[1]!.click();
      await settle();
      expect(q('period-live').textContent).toBe('没能保存周期，请重试。');
      expect(q('period-picker').textContent).toContain('2026-Q3');
    });
  });

  describe('not-pinned banner (from history)', () => {
    beforeEach(async () => {
      await show([makeKr()], { pinned: false });
      store.openedFromHistory.set(true);
      fixture.detectChanges();
    });

    it('appears first with the spec copy when an unpinned OKR was opened from the history', () => {
      const banner = q('pin-banner');
      expect(banner.textContent).toContain('这不是置顶便签。');
      expect(q('pin-button').textContent!.trim()).toBe('设为置顶便签');
      expect(root().querySelector('section')!.firstElementChild).toBe(banner);
    });

    it('is not shown for the pinned note or when not opened from the history', () => {
      store.openedFromHistory.set(false);
      fixture.detectChanges();
      expect(q('pin-banner')).toBeNull();
    });

    it('pins: shows the status text, then disappears after 6 seconds', async () => {
      jest.useFakeTimers();
      try {
        api['pin']!.mockResolvedValue(ok({ okrId: 'okr-1', pinned: true }));
        q('pin-button').click();
        await jest.advanceTimersByTimeAsync(0);
        fixture.detectChanges();
        const done = q('pin-banner-done');
        expect(done.getAttribute('role')).toBe('status');
        expect(done.textContent).toContain('已设为置顶便签，下次打开会先显示这一条。');
        await jest.advanceTimersByTimeAsync(6100);
        fixture.detectChanges();
        expect(q('pin-banner-done')).toBeNull();
        expect(q('pin-banner')).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it('failure: alert banner with 重试 that pins on the second try', async () => {
      api['pin']!.mockResolvedValueOnce(fail());
      q('pin-button').click();
      await settle();
      const failed = q('pin-banner-failed');
      expect(failed.getAttribute('role')).toBe('alert');
      expect(failed.textContent).toContain('没能设为置顶便签，请重试。');
      api['pin']!.mockResolvedValueOnce(ok({ okrId: 'okr-1', pinned: true }));
      q('pin-retry').click();
      await settle();
      expect(q('pin-banner-done')).not.toBeNull();
      expect(api['pin']).toHaveBeenCalledTimes(2);
    });
  });

  it('focusTitle puts focus on the tabindex -1 heading', async () => {
    await show([makeKr()]);
    const title = q('sticky-objective');
    expect(title.tabIndex).toBe(-1);
    fixture.componentInstance.focusTitle();
    expect(document.activeElement).toBe(title);
  });

  it('while a regeneration runs the rows are blocked', async () => {
    await show([makeKr()]);
    fixture.componentInstance.busy.set(true);
    fixture.detectChanges();
    expect(q('kr-progress-value').getAttribute('aria-disabled')).toBe('true');
    expect(q('regenerate-button').getAttribute('aria-disabled')).toBe('true');
  });
});
