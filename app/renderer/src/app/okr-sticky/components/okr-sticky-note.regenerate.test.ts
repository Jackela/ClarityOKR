/**
 * §3.7 regeneration on the note tab: menu, selection mode, confirm dialog, running state,
 * result banners, failure banner and the 「新增」 tag. Real store and flow, faked API.
 */
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ClosedLoopError, KeyResultRecord, RegenerateSummary } from '@clarityokr/contracts';

import { ClosedLoopApi } from '../../closed-loop/closed-loop-api.service';
import { RegenerateFlow } from '../../closed-loop/regenerate-flow.service';
import { makeDetail, makeKr } from '../../closed-loop/testing/fixtures';
import { Logger } from '../../core/services/logger.service';
import { OkrStickyService, type OkrStickyViewModel } from '../services/okr-sticky.service';
import { EditModeStore } from '../state/edit-mode.store';
import { OkrStickyNoteComponent } from './okr-sticky-note.component';

const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (code: ClosedLoopError['code']) => ({
  ok: false as const,
  error: { code, message: 'x' } as ClosedLoopError,
});

const view: OkrStickyViewModel = {
  id: 'okr-1',
  objective: '提升团队交付节奏',
  keyResults: [
    { id: 'kr-1', statement: 'A', metricLabel: null },
    { id: 'kr-2', statement: 'B', metricLabel: null },
    { id: 'kr-3', statement: 'C', metricLabel: null },
  ],
  generatedAt: '2026-10-09T08:00:00.000Z',
  lastEditedAt: null,
  hasManualEdits: false,
  regenerationPolicy: 'overwrite',
};

const krs = (): KeyResultRecord[] => [
  makeKr({ id: 'kr-1', statement: 'A', position: 0, progress: 40 }),
  makeKr({ id: 'kr-2', statement: 'B', position: 1 }),
  makeKr({ id: 'kr-3', statement: 'C', position: 2 }),
];

const summary = (over: Partial<RegenerateSummary> = {}): RegenerateSummary => ({
  outcome: 'updated',
  requested: 3,
  kept: 3,
  added: 0,
  removed: 0,
  missingIds: 0,
  addedIds: [],
  touchedIds: ['kr-1', 'kr-2', 'kr-3'],
  ...over,
});

describe('OkrStickyNoteComponent regeneration (§3.7)', () => {
  let fixture: ComponentFixture<OkrStickyNoteComponent>;
  let api: Record<string, jest.Mock>;
  let sticky: { openFromDetail: jest.Mock };

  const root = (): HTMLElement => fixture.nativeElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string): T =>
    document.querySelector(`[data-testid="${id}"]`) as T;
  const all = (id: string) =>
    Array.from(root().querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  };

  async function show(list = krs()): Promise<void> {
    api['open']!.mockResolvedValue(ok(makeDetail(list)));
    fixture.componentInstance.okr = view;
    fixture.componentInstance.ngOnChanges();
    fixture.detectChanges();
    await settle();
  }

  async function openMenu(index: 0 | 1): Promise<void> {
    q('regenerate-button').click();
    fixture.detectChanges();
    q(`regenerate-button-option-${index}`).click();
    await settle();
  }

  beforeEach(async () => {
    api = {
      open: jest.fn(),
      pin: jest.fn(),
      setPeriod: jest.fn(),
      setProgress: jest.fn(),
      regenerateKrs: jest.fn(),
    };
    sticky = { openFromDetail: jest.fn() };
    await TestBed.configureTestingModule({
      imports: [OkrStickyNoteComponent],
      providers: [
        { provide: ClosedLoopApi, useValue: api },
        { provide: OkrStickyService, useValue: sticky },
        { provide: Logger, useValue: { warn: jest.fn(), error: jest.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(OkrStickyNoteComponent);
    document.body.appendChild(fixture.nativeElement);
  });

  afterEach(() => {
    TestBed.inject(RegenerateFlow).dismiss();
    TestBed.inject(RegenerateFlow).stopSelecting();
    fixture.nativeElement.remove();
  });

  it('entry: 「↻ 重新生成 ▾」 menu button with the two items', async () => {
    await show();
    const button = q('regenerate-button');
    expect(button.textContent!.replace(/\s+/g, ' ')).toContain('↻ 重新生成');
    expect(q('regen-icon')).not.toBeNull();
    expect(q('regen-spinner')).toBeNull();
    expect(q('edit-button').getAttribute('aria-disabled')).toBeNull();
    expect(q('sticky-add-kr').getAttribute('aria-disabled')).toBeNull();
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    button.click();
    fixture.detectChanges();
    expect(q('regenerate-button-option-0').textContent).toContain('重新生成选中的关键结果…');
    expect(q('regenerate-button-option-1').textContent).toContain('重新生成全部关键结果…');
  });

  it('all: danger confirm with the spec copy, 「取消」 focused; 取消 sends nothing', async () => {
    await show();
    await openMenu(1);
    const dialog = q('regen-dialog');
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    expect(dialog.textContent).toContain('重新生成全部关键结果？');
    expect(dialog.textContent).toContain('对应不上的会被标为「已移除」');
    expect(q('dialog-confirm').className).toContain('dialog__btn--danger');
    expect(document.activeElement).toBe(q('dialog-cancel'));
    q('dialog-cancel').click();
    await settle();
    expect(q('regen-dialog')).toBeNull();
    expect(api['regenerateKrs']).not.toHaveBeenCalled();
  });

  it('selection mode: checkboxes, count, disabled confirm with hint, Ctrl+A, Esc leaves', async () => {
    await show();
    await openMenu(0);
    expect(all('kr-select')).toHaveLength(3);
    expect(q('regen-selected-count').textContent).toContain('已选 0 条');
    const go = q('regen-select-confirm');
    expect(go.getAttribute('aria-disabled')).toBe('true');
    expect(go.getAttribute('aria-describedby')).toBe('regen-hint');
    expect(q('regen-select-bar').textContent).toContain('请至少选一条');
    go.click();
    await settle();
    expect(q('regen-dialog')).toBeNull();
    // inline edits are off while selecting
    expect(all('kr-progress-value')[0]!.getAttribute('aria-disabled')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }));
    await settle();
    expect(q('regen-selected-count').textContent).toContain('已选 3 条');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(q('regen-select-bar')).toBeNull();
    expect(all('kr-select')).toHaveLength(0);
  });

  it('partial: confirm names n, only the selected rows show skeletons, banner after', async () => {
    await show();
    await openMenu(0);
    all('kr-select')[1]!.click();
    await settle();
    expect(q('regen-selected-count').textContent).toContain('已选 1 条');
    q('regen-select-confirm').click();
    await settle();
    expect(q('regen-dialog').textContent).toContain('重新生成所选的 1 条关键结果？');
    expect(q('dialog-confirm').className).not.toContain('dialog__btn--danger');
    let resolve: (v: unknown) => void = () => undefined;
    api['regenerateKrs']!.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    q('dialog-confirm').click();
    await settle();
    expect(api['regenerateKrs']).toHaveBeenCalledWith({ okrId: 'okr-1', krIds: ['kr-2'] });
    expect(all('kr-skeleton')).toHaveLength(1);
    expect(all('sticky-key-result')).toHaveLength(2);
    expect(q('regen-progress')).not.toBeNull();
    expect(root().querySelector('section')!.getAttribute('aria-busy')).toBe('true');
    expect((document.querySelector('.regen-live') as HTMLElement).textContent).toContain(
      '正在重新生成关键结果…',
    );
    expect(q('regenerate-button').getAttribute('aria-disabled')).toBe('true');
    // Only the spinner while running: it replaces ↻ (§3.7).
    expect(q('regen-spinner')).not.toBeNull();
    expect(q('regen-icon')).toBeNull();
    expect(q('regenerate-button').textContent).not.toContain('↻');
    // Every other edit control is disabled and says so.
    for (const id of ['edit-button', 'sticky-add-kr']) {
      expect(q(id).getAttribute('aria-disabled')).toBe('true');
    }
    q('sticky-add-kr').click();
    q('edit-button').click();
    fixture.detectChanges();
    expect(TestBed.inject(EditModeStore).isEditing()).toBe(false);
    // N19: the quarter picker is disabled and a change is ignored while regenerating.
    const picker = q('period-picker');
    expect(picker.getAttribute('aria-disabled')).toBe('true');
    expect(picker.hasAttribute('disabled')).toBe(false);
    expect(picker.getAttribute('title')).toBe('正在重新生成，完成后可用');
    const before = picker.textContent;
    for (const key of ['ArrowDown', 'Enter', ' ']) {
      picker.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }
    picker.click();
    fixture.detectChanges();
    expect(picker.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(picker.textContent).toBe(before);
    for (const id of ['edit-button', 'sticky-add-kr']) {
      expect(q(id).hasAttribute('disabled')).toBe(false);
      expect(q(id).getAttribute('title')).toBe('正在重新生成，完成后可用');
    }
    api['setPeriod']!.mockClear();
    await fixture.componentInstance.onPeriod('2026-Q4');
    expect(api['setPeriod']).not.toHaveBeenCalled();
    const detail = makeDetail(krs().map((k) => (k.id === 'kr-2' ? { ...k, statement: 'B2' } : k)));
    resolve(
      ok({ detail, summary: summary({ outcome: 'partial_updated', requested: 1, kept: 1 }) }),
    );
    await settle();
    expect(all('kr-skeleton')).toHaveLength(0);
    const banner = q('regen-banner');
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.textContent).toContain(
      '已重新生成所选的 1 条关键结果：文字和度量已更新，进度和状态保留。请确认进度是否仍然准确。',
    );
    expect(sticky.openFromDetail).toHaveBeenCalledWith(detail);
  });

  it('changed with missing ids: warn banner, 「新增」 tag, 查看已移除 opens and focuses the section', async () => {
    await show();
    const after = [
      makeKr({ id: 'kr-1', statement: 'A2', position: 0, progress: 40 }),
      makeKr({ id: 'kr-new', statement: 'N', position: 1 }),
      makeKr({ id: 'kr-2', statement: 'B', position: 1, removedAt: '2026-10-13T08:00:00.000Z' }),
      makeKr({ id: 'kr-3', statement: 'C', position: 2, removedAt: '2026-10-13T08:00:00.000Z' }),
    ];
    api['regenerateKrs']!.mockResolvedValueOnce(
      ok({
        detail: makeDetail(after),
        summary: summary({
          outcome: 'changed',
          kept: 1,
          added: 1,
          removed: 2,
          missingIds: 1,
          addedIds: ['kr-new'],
        }),
      }),
    );
    await openMenu(1);
    q('dialog-confirm').click();
    await settle();
    const banner = q('regen-banner');
    expect(banner.className).toContain('regen-banner--warn');
    expect(banner.textContent).toContain('重新生成完成：保留 1 条，新增 1 条，移除 2 条。');
    expect(banner.textContent).toContain('其中 1 条没有返回编号，已按新增处理');
    expect(all('kr-new-tag')).toHaveLength(1);
    q('regen-view-removed').click();
    await settle();
    expect(q('removed-toggle').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(q('removed-toggle'));
    q('regen-dismiss').click();
    await settle();
    expect(q('regen-banner')).toBeNull();
    expect(all('kr-new-tag')).toHaveLength(0);
  });

  it('clears the undo history after a regeneration (§3.9a)', async () => {
    await show();
    const editor = TestBed.inject(EditModeStore);
    const clear = jest.spyOn(editor, 'clearHistory');
    api['regenerateKrs']!.mockResolvedValueOnce(
      ok({ detail: makeDetail(krs()), summary: summary() }),
    );
    await openMenu(1);
    clear.mockClear();
    q('dialog-confirm').click();
    await settle();
    expect(clear).toHaveBeenCalled();
    expect(q('regen-banner').textContent).toContain('已重新生成 3 条关键结果');
  });

  it('failure: role=alert red banner, list unchanged, details hold the code, 重试 sends again', async () => {
    await show();
    api['regenerateKrs']!.mockResolvedValueOnce(fail('REGENERATE_FAILED'));
    await openMenu(1);
    q('dialog-confirm').click();
    await settle();
    const banner = q('regen-failed');
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.textContent).toContain('重新生成失败，原来的关键结果没有改动。');
    expect(banner.querySelector('.regen-banner__main')!.textContent!.trim()).toMatch(/^⚠/);
    expect(banner.textContent).not.toContain('x');
    expect(q('regen-details').textContent).toContain('查看详情');
    expect(
      all('sticky-key-result').map((r) =>
        // the 「7 天未更新」 badge depends on the real clock passing the fixture date
        r
          .querySelector('[data-testid="kr-statement"]')!
          .textContent!.replace('7 天未更新', '')
          .trim(),
      ),
    ).toEqual(['A', 'B', 'C']);
    api['regenerateKrs']!.mockResolvedValueOnce(
      ok({ detail: makeDetail(krs()), summary: summary() }),
    );
    q('regen-retry').click();
    await settle();
    expect(api['regenerateKrs']).toHaveBeenCalledTimes(2);
    expect(q('regen-failed')).toBeNull();
    expect(q('regen-banner')).not.toBeNull();
  });

  it('a rejected call is a failure too (no raw error)', async () => {
    await show();
    api['regenerateKrs']!.mockImplementationOnce(async () => {
      throw new Error('boom /secret/path');
    });
    await openMenu(1);
    q('dialog-confirm').click();
    await settle();
    expect(q('regen-failed').textContent).not.toContain('secret');
  });

  it('empty list: 「重新生成全部关键结果…」 opens the confirm', async () => {
    await show([]);
    q('kr-empty-regenerate').click();
    await settle();
    expect(q('regen-dialog')).not.toBeNull();
  });
});
