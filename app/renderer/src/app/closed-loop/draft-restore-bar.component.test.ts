import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type {
  DraftGetReply,
  DraftRow,
  ResolvedDraftRow,
  RestoreTarget,
} from '@clarityokr/contracts';

import { ClosedLoopApi } from './closed-loop-api.service';
import { DraftRestoreBarComponent } from './draft-restore-bar.component';
import { DraftRestoreHosts, type DraftRestoreHost } from './draft-restore';

@Component({
  standalone: true,
  imports: [DraftRestoreBarComponent],
  template: `<h1 id="main-heading" tabindex="-1">ClarityOKR</h1>
    <clarityokr-draft-restore-bar />`,
})
class Host {}

const TITLE = '提升团队交付效率与质量，并把发布节奏稳定在每周两次以上的长期目标';
const textEdit: ResolvedDraftRow = {
  key: 'textEdit:o1:k2',
  row: {
    kind: 'textEdit',
    okrId: 'o1',
    krId: 'k2',
    base: { statement: 'a', successMetric: '' },
    draft: { statement: 'b', successMetric: '' },
  },
  okrTitle: TITLE,
  krIndex: 2,
};
const review: ResolvedDraftRow = {
  key: 'review:o1',
  row: {
    kind: 'review',
    okrId: 'o1',
    base: { wentWell: '', fellShort: '', nextSteps: '' },
    draft: { wentWell: 'x', fellShort: '', nextSteps: '' },
  },
  okrTitle: TITLE,
  period: '2026-Q4',
};
const reviewNoPeriod: ResolvedDraftRow = { ...review, period: null } as ResolvedDraftRow;

describe('DraftRestoreBarComponent (#110, spec S3§12)', () => {
  let fixture: ComponentFixture<Host>;
  let api: Record<string, jest.Mock>;
  let host: DraftRestoreHost & { targetOf: jest.Mock; apply: jest.Mock; focusHeading: jest.Mock };
  const q = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
    (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);
  const all = (id: string): HTMLElement[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll(`[data-testid="${id}"]`));
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 4; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
    }
  };

  async function create(
    reply: DraftGetReply,
    target: RestoreTarget | ((row: DraftRow) => RestoreTarget) = 'untouched',
  ): Promise<void> {
    api = {
      getDraft: jest.fn().mockResolvedValue({ ok: true, data: reply }),
      settleDraft: jest.fn().mockResolvedValue({ ok: true, data: { remaining: 0 } }),
    };
    host = {
      targetOf: jest.fn(typeof target === 'function' ? target : () => target),
      apply: jest.fn().mockResolvedValue(true),
      focusHeading: jest.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: ClosedLoopApi, useValue: api }],
    }).compileComponents();
    TestBed.inject(DraftRestoreHosts).register(host);
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await settle();
  }

  afterEach(() => TestBed.resetTestingModule());

  it('no draft → no bar', async () => {
    await create({ rows: [], deletedCount: 0 });
    expect(q('draft-bar')).toBeNull();
  });

  it('shows the copy, one line per row in order, focus on 恢复 once, no ✕', async () => {
    await create({ rows: [textEdit, review], deletedCount: 0 });
    const bar = q('draft-bar')!;
    expect(bar.getAttribute('role')).toBe('region');
    expect(bar.getAttribute('aria-labelledby')).toBe('draft-restore-title');
    expect(bar.getAttribute('aria-describedby')).toBe('draft-restore-body');
    expect(bar.textContent).toContain('上次没保存的内容还在');
    expect(bar.textContent).toContain('注销或关机时，这些内容还没保存：');
    const lines = all('draft-line');
    expect(lines.map((l) => l.querySelector('[aria-hidden="true"]')!.textContent)).toEqual([
      '「提升团队交付效率与…」第 2 个关键结果的文字',
      '2026-Q4 的复盘',
    ]);
    // the full title for hover and the screen reader
    expect(lines[0].getAttribute('title')).toBe(`「${TITLE}」第 2 个关键结果的文字`);
    expect(lines[0].querySelector('.sr-only')!.textContent).toBe(
      `「${TITLE}」第 2 个关键结果的文字`,
    );
    expect(q('draft-restore')!.textContent!.trim()).toBe('恢复');
    expect(q('draft-discard')!.textContent!.trim()).toBe('放弃');
    expect(document.activeElement).toBe(q('draft-restore'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    fixture.detectChanges();
    expect(q('draft-live')!.textContent).toBe(
      '上次没保存的内容还在 注销或关机时，这些内容还没保存：',
    );
    // Esc does not close it
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(q('draft-bar')).not.toBeNull();
  });

  it('review without a period: 「{OKR 标题}」的复盘 (title cut the same way)', async () => {
    await create({ rows: [reviewNoPeriod], deletedCount: 0 });
    expect(all('draft-line')[0].querySelector('[aria-hidden="true"]')!.textContent).toBe(
      '「提升团队交付效率与…」的复盘',
    );
  });

  it('deleted rows add 「另有 n 条对应的内容已删除，无法恢复。」', async () => {
    await create({ rows: [review], deletedCount: 12 });
    expect(q('draft-deleted')!.textContent!.trim()).toBe('另有 12 条对应的内容已删除，无法恢复。');
  });

  it('restore case 2 (untouched): restores at once, settles, announces, bar gone', async () => {
    await create({ rows: [textEdit, review], deletedCount: 0 }, 'untouched');
    q('draft-restore')!.click();
    await settle();
    expect(q('draft-replace-dialog')).toBeNull();
    expect(host.apply).toHaveBeenCalledWith([textEdit.row, review.row]);
    expect(api.settleDraft).toHaveBeenCalledWith({ keys: ['textEdit:o1:k2', 'review:o1'] });
    expect(q('draft-bar')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 100));
    fixture.detectChanges();
    expect(q('draft-live')!.textContent).toBe('已恢复上次没保存的内容。');
  });

  it('restore case 1 (new unsaved edits): asks first, 「保留现在的」 is the default and keeps everything', async () => {
    await create({ rows: [textEdit], deletedCount: 0 }, 'dirty');
    q('draft-restore')!.click();
    await settle();
    const dialog = q('draft-replace-dialog')!;
    expect(dialog.textContent).toContain('用上次没保存的内容替换现在的修改？');
    expect(document.activeElement!.textContent!.trim()).toBe('保留现在的');
    expect(host.apply).not.toHaveBeenCalled();
    q('dialog-cancel')!.click();
    await settle();
    expect(q('draft-replace-dialog')).toBeNull();
    expect(q('draft-bar')).not.toBeNull();
    expect(api.settleDraft).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(q('draft-restore'));
    // 替换 restores over the edits
    q('draft-restore')!.click();
    await settle();
    expect(q('dialog-confirm')!.textContent!.trim()).toBe('替换');
    q('dialog-confirm')!.click();
    await settle();
    expect(host.apply).toHaveBeenCalledWith([textEdit.row]);
    expect(q('draft-bar')).toBeNull();
  });

  it('restore case 3 (already saved): that row is voided silently; the others still restore', async () => {
    await create({ rows: [textEdit, review], deletedCount: 0 }, (row) =>
      row.kind === 'textEdit' ? 'saved' : 'untouched',
    );
    q('draft-restore')!.click();
    await settle();
    expect(api.settleDraft).toHaveBeenNthCalledWith(1, { keys: ['textEdit:o1:k2'] });
    expect(host.apply).toHaveBeenCalledWith([review.row]);
  });

  it('restore case 3, only row: the bar folds away and the focus goes to the heading', async () => {
    await create({ rows: [textEdit], deletedCount: 0 }, 'saved');
    q('draft-restore')!.click();
    await settle();
    expect(host.apply).not.toHaveBeenCalled();
    expect(q('draft-bar')).toBeNull();
    expect(host.focusHeading).toHaveBeenCalled();
    expect(q('draft-live')!.textContent).not.toContain('已恢复');
  });

  it('restore failure: bar and draft stay, one alert line, focus back on 恢复', async () => {
    await create({ rows: [review], deletedCount: 0 });
    host.apply.mockResolvedValue(false);
    q('draft-restore')!.click();
    await settle();
    q('draft-restore')!.click();
    await settle();
    expect(all('draft-error')).toHaveLength(1);
    expect(q('draft-error')!.getAttribute('role')).toBe('alert');
    expect(q('draft-error')!.textContent!.trim()).toBe('⚠ 没能恢复，请再试一次。');
    expect(api.settleDraft).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(q('draft-restore'));
  });

  it('放弃 asks first; 「先留着」 is the default and keeps the draft', async () => {
    await create({ rows: [review], deletedCount: 0 });
    q('draft-discard')!.click();
    await settle();
    const dialog = q('draft-discard-dialog')!;
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    expect(dialog.textContent).toContain('放弃上次没保存的内容？');
    expect(dialog.textContent).toContain('放弃后这些内容找不回来。');
    expect(document.activeElement!.textContent!.trim()).toBe('先留着');
    q('dialog-cancel')!.click();
    await settle();
    expect(q('draft-bar')).not.toBeNull();
    expect(api.settleDraft).not.toHaveBeenCalled();
  });

  it('放弃 confirmed: deletes the draft, focus to the heading, announces', async () => {
    await create({ rows: [review], deletedCount: 0 });
    q('draft-discard')!.click();
    await settle();
    q('dialog-confirm')!.click();
    await settle();
    expect(api.settleDraft).toHaveBeenCalledWith({ all: true });
    expect(q('draft-bar')).toBeNull();
    expect(host.focusHeading).toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 100));
    fixture.detectChanges();
    expect(q('draft-live')!.textContent).toBe('已放弃上次没保存的内容。');
  });

  it('放弃 failure: ⚠ 没能放弃，请再试一次。 and the draft stays', async () => {
    await create({ rows: [review], deletedCount: 0 });
    api.settleDraft.mockResolvedValue({ ok: false, error: { code: 'INTERNAL', message: 'x' } });
    q('draft-discard')!.click();
    await settle();
    q('dialog-confirm')!.click();
    await settle();
    expect(q('draft-error')!.textContent!.trim()).toBe('⚠ 没能放弃，请再试一次。');
    expect(q('draft-bar')).not.toBeNull();
    expect(document.activeElement).toBe(q('draft-discard'));
  });
});
