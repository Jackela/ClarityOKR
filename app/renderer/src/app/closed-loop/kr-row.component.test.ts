import { Component, inject } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ClosedLoopError, KeyResultRecord, KrProgressInfo } from '@clarityokr/contracts';

import { Logger } from '../core/services/logger.service';
import { OkrStickyService } from '../okr-sticky/services/okr-sticky.service';
import { ClosedLoopApi } from './closed-loop-api.service';
import { ClosedLoopStore } from './closed-loop.store';
import { KrRowComponent } from './kr-row.component';
import { makeChange, makeDetail, makeEntry, makeInfo, makeKr } from './testing/fixtures';

@Component({
  standalone: true,
  imports: [KrRowComponent],
  template: `
    <ol>
      @for (kr of store.detail()?.objective?.keyResults ?? []; track kr.id; let i = $index) {
        <li
          clarityokr-kr-row
          [kr]="kr"
          [n]="i + 1"
          [info]="store.detail()?.progress?.[kr.id]"
          [blocked]="blocked"
          (addMetric)="metricRequests.push($event)"
        ></li>
      }
    </ol>
  `,
})
class Host {
  readonly store = inject(ClosedLoopStore);
  blocked = false;
  metricRequests: string[] = [];
}

const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (code: ClosedLoopError['code'] = 'INTERNAL') => ({
  ok: false as const,
  error: { code, message: 'x' } as ClosedLoopError,
});

describe('KrRowComponent', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let api: Record<string, jest.Mock>;

  const root = (): HTMLElement => fixture.nativeElement;
  const q = <T extends HTMLElement = HTMLElement>(testId: string, within: ParentNode = root()): T =>
    within.querySelector(`[data-testid="${testId}"]`) as T;
  const rows = (): HTMLElement[] => Array.from(root().querySelectorAll('li'));

  async function load(
    krs: KeyResultRecord[],
    progress: Record<string, KrProgressInfo> = {},
  ): Promise<void> {
    const detail = makeDetail(krs);
    detail.progress = { ...detail.progress, ...progress };
    host.store.detail.set(detail);
    host.store.detailState.set('ready');
    host.store.currentId.set('okr-1');
    fixture.detectChanges();
  }

  async function settle(): Promise<void> {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }

  function key(el: Element, k: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
      key: k,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    el.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  function type(input: HTMLInputElement, text: string): void {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  async function openEditor(): Promise<HTMLInputElement> {
    q('kr-progress-value').click();
    fixture.detectChanges();
    return q<HTMLInputElement>('kr-progress-input');
  }

  beforeEach(async () => {
    api = {
      setProgress: jest.fn(),
      revertProgress: jest.fn(),
      replaceProgress: jest.fn(),
      open: jest.fn().mockResolvedValue(fail()),
    };
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        { provide: ClosedLoopApi, useValue: api },
        { provide: OkrStickyService, useValue: { openFromDetail: jest.fn() } },
        { provide: Logger, useValue: { warn: jest.fn(), error: jest.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => fixture.nativeElement.remove());

  describe('display', () => {
    it('new key result: 未开始, empty track, — and no 0% or "设置状态"', async () => {
      await load([makeKr()]);
      expect(q('kr-status').textContent).toContain('未开始');
      expect(root().textContent).not.toContain('设置状态');
      expect(q('kr-progress-value').textContent!.trim()).toBe('—');
      expect(q('kr-progress-value').getAttribute('aria-label')).toBe(
        '编辑进度，关键结果 1，当前未填写',
      );
      expect(root().textContent).not.toContain('0%');
      const bar = root().querySelector('[role="progressbar"]')!;
      expect(bar.hasAttribute('aria-valuenow')).toBe(false);
      expect(bar.getAttribute('aria-valuetext')).toBe('未填写');
      expect(bar.getAttribute('aria-label')).toBe('关键结果 1 进度');
      expect(q('kr-update-line')).toBeNull();
    });

    it('shows progress, status, metric and the bar value', async () => {
      await load([makeKr({ progress: 65, status: 'in_progress', successMetric: '周期 <= 21 天' })]);
      expect(q('kr-progress-value').textContent!.trim()).toBe('65%');
      expect(q('kr-progress-value').getAttribute('aria-label')).toBe(
        '编辑进度，关键结果 1，当前 65%',
      );
      expect(q('kr-status').textContent).toContain('进行中');
      expect(q('kr-status').getAttribute('aria-label')).toBe('关键结果 1 状态，当前进行中，更改');
      const bar = root().querySelector('[role="progressbar"]')!;
      expect(bar.getAttribute('aria-valuenow')).toBe('65');
      expect(bar.getAttribute('aria-valuetext')).toBe('65%，进行中');
      expect(q('kr-metric').textContent!.trim()).toBe('度量：周期 <= 21 天');
      expect(q('kr-metric').getAttribute('title')).toBe('周期 <= 21 天');
      expect(q('kr-add-metric')).toBeNull();
    });

    it('an empty metric is an "add metric" button, not an empty line', async () => {
      await load([makeKr({ id: 'a' }), makeKr({ id: 'b', position: 1, successMetric: 'x' })]);
      const button = q('kr-add-metric', rows()[0]);
      expect(button.getAttribute('aria-label')).toBe('添加度量，关键结果 1');
      expect(rows()[0]!.textContent).not.toContain('度量：');
      button.click();
      expect(host.metricRequests).toEqual(['a']);
      expect(q('kr-add-metric', rows()[1])).toBeNull();
    });

    it('numbers rows and renders statuses with their icons', async () => {
      await load([
        makeKr({ id: 'a', status: 'not_started' }),
        makeKr({ id: 'b', position: 1, status: 'at_risk', progress: 10 }),
        makeKr({ id: 'c', position: 2, status: 'done', progress: 100 }),
      ]);
      expect(rows().map((r) => q('kr-status', r).textContent!.replace(/\s+/g, ''))).toEqual([
        '○未开始▾',
        '△有风险▾',
        '✓已完成▾',
      ]);
      expect(rows().map((r) => r.querySelector('.kr__num')!.textContent)).toEqual(['1', '2', '3']);
    });

    it('keeps value button before the status label in the DOM (Tab order T1)', async () => {
      await load([makeKr({ progress: 50, status: 'in_progress' })], {
        'kr-1': makeInfo({
          latest: makeEntry(),
          before: { value: 10, status: 'in_progress' },
          canRevert: true,
        }),
      });
      const focusables = Array.from(rows()[0]!.querySelectorAll<HTMLElement>('button')).map((b) =>
        b.getAttribute('data-testid'),
      );
      expect(focusables).toEqual([
        'kr-add-metric',
        'kr-progress-value',
        'kr-status',
        'kr-edit-last',
        'kr-revert-last',
      ]);
    });
  });

  describe('status menu', () => {
    it('offers exactly the four statuses, writes the chosen one and keeps the value', async () => {
      await load([makeKr({ progress: 40, status: 'in_progress' })]);
      api['setProgress']!.mockResolvedValue(
        ok(makeChange(makeKr({ progress: 40, status: 'at_risk' }), { canRevert: true })),
      );
      q('kr-status').click();
      fixture.detectChanges();
      const options = Array.from(root().querySelectorAll<HTMLElement>('[role="menuitemradio"]'));
      expect(options.map((o) => o.querySelector('.popup__label')!.textContent)).toEqual([
        '未开始',
        '进行中',
        '有风险',
        '已完成',
      ]);
      options[2]!.click();
      await settle();
      expect(api['setProgress']).toHaveBeenCalledWith({ krId: 'kr-1', status: 'at_risk' });
      expect(q('kr-status').textContent).toContain('有风险');
      expect(q('kr-progress-value').textContent!.trim()).toBe('40%');
      expect(q('kr-live').textContent).toBe('关键结果 1 状态已改为有风险。');
    });

    it('does nothing when the current status is chosen again', async () => {
      await load([makeKr({ status: 'in_progress', progress: 1 })]);
      q('kr-status').click();
      fixture.detectChanges();
      root().querySelectorAll<HTMLElement>('[role="menuitemradio"]')[1]!.click();
      await settle();
      expect(api['setProgress']).not.toHaveBeenCalled();
    });

    it('does not change the progress when the status becomes 已完成 (no auto 100%)', async () => {
      await load([makeKr({ progress: 70, status: 'in_progress' })]);
      api['setProgress']!.mockResolvedValue(
        ok(makeChange(makeKr({ progress: 70, status: 'done' }))),
      );
      q('kr-status').click();
      fixture.detectChanges();
      root().querySelectorAll<HTMLElement>('[role="menuitemradio"]')[3]!.click();
      await settle();
      expect(q('kr-progress-value').textContent!.trim()).toBe('70%');
    });
  });

  describe('inline progress input (T4)', () => {
    beforeEach(async () => {
      await load([makeKr({ progress: 40, status: 'in_progress' })]);
    });

    it('Enter on the value button opens a focused, selected input; Esc cancels back to the button', async () => {
      const button = q('kr-progress-value');
      button.focus();
      key(button, 'Enter'); // a real <button> turns Enter into click
      button.click();
      fixture.detectChanges();
      const input = q<HTMLInputElement>('kr-progress-input');
      expect(document.activeElement).toBe(input);
      expect(input.value).toBe('40');
      expect(input.getAttribute('aria-label')).toBe('关键结果 1 进度百分比，0 到 100 的整数');
      const esc = key(input, 'Escape');
      expect(esc.defaultPrevented).toBe(true);
      await settle();
      expect(q('kr-progress-input')).toBeNull();
      expect(document.activeElement).toBe(q('kr-progress-value'));
      expect(api['setProgress']).not.toHaveBeenCalled();
    });

    it('commits a valid value on Enter, returns focus to the button and announces it', async () => {
      api['setProgress']!.mockResolvedValue(
        ok(
          makeChange(
            makeKr({ progress: 65, status: 'in_progress' }),
            { canRevert: true },
            true,
            65,
          ),
        ),
      );
      const input = await openEditor();
      type(input, '65');
      key(input, 'Enter');
      await settle();
      expect(api['setProgress']).toHaveBeenCalledWith({
        krId: 'kr-1',
        status: 'in_progress',
        value: 65,
      });
      expect(q('kr-progress-input')).toBeNull();
      expect(q('kr-progress-value').textContent!.trim()).toBe('65%');
      expect(document.activeElement).toBe(q('kr-progress-value'));
      expect(q('kr-live').textContent).toBe('关键结果 1 进度已更新为 65%。');
      expect(root().querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe(
        '65',
      );
    });

    it('does not change the status when the progress becomes 100', async () => {
      api['setProgress']!.mockResolvedValue(
        ok(makeChange(makeKr({ progress: 100, status: 'in_progress' }), { canRevert: true })),
      );
      const input = await openEditor();
      type(input, '100');
      key(input, 'Enter');
      await settle();
      expect(q('kr-status').textContent).toContain('进行中');
    });

    it('empty input clears the progress (value null) and announces it', async () => {
      api['setProgress']!.mockResolvedValue(
        ok(makeChange(makeKr({ progress: null, status: 'in_progress' }), { canRevert: true })),
      );
      const input = await openEditor();
      type(input, '');
      key(input, 'Enter');
      await settle();
      expect(api['setProgress']).toHaveBeenCalledWith({
        krId: 'kr-1',
        status: 'in_progress',
        value: null,
      });
      expect(q('kr-progress-value').textContent!.trim()).toBe('—');
      expect(q('kr-live').textContent).toBe('关键结果 1 进度已清空。');
    });

    it.each([
      ['-5', '进度不能小于 0'],
      ['101', '进度不能超过 100'],
      ['abc', '请输入 0–100 的整数'],
      ['12a', '请输入 0–100 的整数'],
      ['50%', '请输入 0–100 的整数'],
      ['12.5', '请输入整数，不要带小数点'],
    ])(
      'rejects %j: shows the alert, marks it invalid and does not submit on Enter',
      async (text, message) => {
        const input = await openEditor();
        type(input, text);
        const error = q('kr-input-error');
        expect(error.getAttribute('role')).toBe('alert');
        expect(error.textContent).toContain(message);
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(input.getAttribute('aria-describedby')).toBe(error.id);
        key(input, 'Enter');
        await settle();
        expect(api['setProgress']).not.toHaveBeenCalled();
        expect(q('kr-progress-input')).not.toBeNull();
      },
    );

    it('clears the error as soon as the input is valid again', async () => {
      const input = await openEditor();
      type(input, 'abc');
      expect(q('kr-input-error')).not.toBeNull();
      type(input, '12');
      expect(q('kr-input-error')).toBeNull();
      expect(input.hasAttribute('aria-invalid')).toBe(false);
    });

    it.each(['0', '100'])('accepts the boundary %s', async (text) => {
      api['setProgress']!.mockResolvedValue(ok(makeChange(makeKr({ progress: Number(text) }))));
      const input = await openEditor();
      type(input, text);
      key(input, 'Enter');
      await settle();
      expect(api['setProgress']).toHaveBeenCalledWith(
        expect.objectContaining({ value: Number(text) }),
      );
    });

    it('↑ ↓ change by 1, Shift by 10, clamped to 0..100', async () => {
      const input = await openEditor();
      key(input, 'ArrowUp');
      expect(input.value).toBe('41');
      key(input, 'ArrowDown');
      key(input, 'ArrowDown');
      expect(input.value).toBe('39');
      key(input, 'ArrowUp', { shiftKey: true });
      expect(input.value).toBe('49');
      type(input, '95');
      key(input, 'ArrowUp', { shiftKey: true });
      expect(input.value).toBe('100');
      type(input, '3');
      key(input, 'ArrowDown', { shiftKey: true });
      expect(input.value).toBe('0');
    });

    it('commits a valid value when focus leaves, but keeps an invalid one open', async () => {
      api['setProgress']!.mockResolvedValue(ok(makeChange(makeKr({ progress: 55 }))));
      let input = await openEditor();
      type(input, '55');
      input.dispatchEvent(new Event('blur'));
      await settle();
      expect(api['setProgress']).toHaveBeenCalledTimes(1);

      input = await openEditor();
      type(input, 'oops');
      input.dispatchEvent(new Event('blur'));
      await settle();
      expect(api['setProgress']).toHaveBeenCalledTimes(1);
      expect(q('kr-progress-input')).not.toBeNull();
    });

    it('is blocked (aria-disabled, no input) while the note is busy', async () => {
      host.blocked = true;
      fixture.detectChanges();
      const button = q('kr-progress-value');
      expect(button.getAttribute('aria-disabled')).toBe('true');
      button.click();
      fixture.detectChanges();
      expect(q('kr-progress-input')).toBeNull();
      expect(q('kr-status').getAttribute('aria-disabled')).toBe('true');
    });
  });

  describe('latest update, edit and revert', () => {
    const setEntry = makeEntry({
      id: 5,
      value: 65,
      status: 'in_progress',
      recordedAt: new Date().toISOString(),
    });

    it('shows the sentence and enables 修改这次 / 撤回这次 when the latest entry is a set', async () => {
      await load([makeKr({ progress: 65, status: 'in_progress' })], {
        'kr-1': makeInfo({
          latest: setEntry,
          before: { value: 40, status: 'in_progress' },
          canRevert: true,
        }),
      });
      expect(q('kr-update-line').textContent).toContain('最近更新 40% → 65%');
      for (const id of ['kr-edit-last', 'kr-revert-last']) {
        expect(q(id).hasAttribute('aria-disabled')).toBe(false);
        expect(q(id).classList.contains('kr__link--disabled')).toBe(false);
        expect(q(id).hasAttribute('disabled')).toBe(false);
      }
      expect(q('kr-edit-last').getAttribute('aria-label')).toBe('修改这次，关键结果 1');
      expect(q('kr-revert-last').getAttribute('aria-label')).toBe('撤回这次，关键结果 1');
      expect(q('kr-revert-reason')).toBeNull();
    });

    it('reverts: calls the channel, restores value AND status and announces both', async () => {
      await load([makeKr({ progress: 100, status: 'done' })], {
        'kr-1': makeInfo({
          latest: setEntry,
          before: { value: 70, status: 'at_risk' },
          canRevert: true,
        }),
      });
      api['revertProgress']!.mockResolvedValue(
        ok(
          makeChange(makeKr({ progress: 70, status: 'at_risk' }), {
            latest: makeEntry({
              id: 6,
              kind: 'revert',
              value: 70,
              status: 'at_risk',
              revertsEntryId: 5,
            }),
            before: { value: 100, status: 'done' },
            canRevert: false,
          }),
        ),
      );
      q('kr-revert-last').click();
      await settle();
      expect(api['revertProgress']).toHaveBeenCalledWith({ krId: 'kr-1' });
      expect(q('kr-status').textContent).toContain('有风险');
      expect(q('kr-progress-value').textContent!.trim()).toBe('70%');
      expect(root().querySelector('[role="progressbar"]')!.getAttribute('aria-valuetext')).toBe(
        '70%，有风险',
      );
      expect(q('kr-live').textContent).toBe(
        '已撤回关键结果 1 的上一次进度更新，进度恢复为 70%，状态恢复为有风险。',
      );
    });

    it('after a revert both buttons are aria-disabled (still focusable), with the reason linked', async () => {
      await load([makeKr({ progress: 70, status: 'at_risk' })], {
        'kr-1': makeInfo({
          latest: makeEntry({ kind: 'revert', value: 70, status: 'at_risk' }),
          before: { value: 100, status: 'done' },
          canRevert: false,
        }),
      });
      const reason = q('kr-revert-reason');
      expect(reason.textContent!.trim()).toBe('已撤回的更新不能再次撤回，请先更新进度。');
      for (const id of ['kr-edit-last', 'kr-revert-last']) {
        const b = q<HTMLButtonElement>(id);
        expect(b.getAttribute('aria-disabled')).toBe('true');
        expect(b.disabled).toBe(false);
        // the visual disabled state (secondary colour, no underline) hangs on this class (§3.6)
        expect(b.classList.contains('kr__link--disabled')).toBe(true);
        expect(b.getAttribute('aria-describedby')).toBe(reason.id);
        b.click();
      }
      await settle();
      expect(api['revertProgress']).not.toHaveBeenCalled();
      expect(q('kr-progress-input')).toBeNull();
      // the user can still write a new progress directly
      q('kr-progress-value').click();
      fixture.detectChanges();
      expect(q('kr-progress-input')).not.toBeNull();
    });

    it('每个 KR 独立: one reverted KR does not disable the other', async () => {
      await load(
        [makeKr({ id: 'a', progress: 70 }), makeKr({ id: 'b', position: 1, progress: 30 })],
        {
          a: makeInfo({ latest: makeEntry({ krId: 'a', kind: 'revert' }), canRevert: false }),
          b: makeInfo({
            latest: makeEntry({ krId: 'b' }),
            before: { value: 1, status: 'in_progress' },
            canRevert: true,
          }),
        },
      );
      expect(q('kr-revert-last', rows()[0]).getAttribute('aria-disabled')).toBe('true');
      expect(q('kr-revert-last', rows()[1]).hasAttribute('aria-disabled')).toBe(false);
    });

    it('修改这次 opens the input and submits through the replace channel', async () => {
      await load([makeKr({ progress: 65, status: 'in_progress' })], {
        'kr-1': makeInfo({
          latest: setEntry,
          before: { value: 40, status: 'in_progress' },
          canRevert: true,
        }),
      });
      api['replaceProgress']!.mockResolvedValue(
        ok(makeChange(makeKr({ progress: 66, status: 'in_progress' }), { canRevert: true })),
      );
      q('kr-edit-last').click();
      fixture.detectChanges();
      const input = q<HTMLInputElement>('kr-progress-input');
      expect(input.value).toBe('65');
      type(input, '66');
      key(input, 'Enter');
      await settle();
      expect(api['replaceProgress']).toHaveBeenCalledWith({ krId: 'kr-1', value: 66 });
      expect(api['setProgress']).not.toHaveBeenCalled();
      expect(q('kr-live').textContent).toBe('关键结果 1 进度已更新为 66%。');
    });

    it('stays silent when the replace is a no-op (changed:false)', async () => {
      await load([makeKr({ progress: 65, status: 'in_progress' })], {
        'kr-1': makeInfo({ latest: setEntry, canRevert: true }),
      });
      api['replaceProgress']!.mockResolvedValue(
        ok(makeChange(makeKr({ progress: 65 }), {}, false)),
      );
      q('kr-edit-last').click();
      fixture.detectChanges();
      key(q('kr-progress-input'), 'Enter');
      await settle();
      expect(q('kr-live').textContent).toBe('');
    });
  });

  describe('done but not 100% hint', () => {
    it.each([
      [70, '状态是「已完成」，但进度是 70%。'],
      [null, '状态是「已完成」，但进度还没填写。'],
    ])(
      'shows the hint for done with progress %s and never blocks anything',
      async (progress, text) => {
        await load([makeKr({ status: 'done', progress })]);
        expect(q('kr-done-hint').textContent).toContain(text);
        expect(q('kr-set-100').getAttribute('aria-label')).toBe('把关键结果 1 的进度改为 100%');
        expect(q('kr-progress-value').getAttribute('aria-disabled')).toBeNull();
      },
    );

    it.each([
      ['done', 100],
      ['in_progress', 70],
      ['at_risk', null],
      ['not_started', 20],
    ] as const)('hides the hint for %s / %s', async (status, progress) => {
      await load([makeKr({ status, progress })]);
      expect(q('kr-done-hint')).toBeNull();
    });

    it('改为 100% writes 100 with the current status and the hint disappears', async () => {
      await load([makeKr({ status: 'done', progress: 70 })]);
      api['setProgress']!.mockResolvedValue(
        ok(makeChange(makeKr({ status: 'done', progress: 100 }), { canRevert: true })),
      );
      q('kr-set-100').click();
      await settle();
      expect(api['setProgress']).toHaveBeenCalledWith({ krId: 'kr-1', status: 'done', value: 100 });
      expect(q('kr-done-hint')).toBeNull();
    });

    it('announces once when the hint appears (not on first render, not while it stays)', async () => {
      await load([makeKr({ status: 'done', progress: 100 })]);
      expect(q('kr-live').textContent).toBe('');
      host.store.detail.set(makeDetail([makeKr({ status: 'done', progress: 80 })]));
      fixture.detectChanges();
      expect(q('kr-live').textContent).toBe('关键结果 1：状态是已完成，但进度不是 100。');
      expect(q('kr-live').getAttribute('role')).toBe('status');
    });

    it('does not announce when the OKR is opened with an existing hint', async () => {
      await load([makeKr({ status: 'done', progress: 80 })]);
      expect(q('kr-done-hint')).not.toBeNull();
      expect(q('kr-live').textContent).toBe('');
    });
  });

  describe('save failure', () => {
    beforeEach(async () => {
      await load([makeKr({ progress: 40, status: 'in_progress' })]);
    });

    it('rolls back to the old value and shows an alert with retry / discard', async () => {
      api['setProgress']!.mockResolvedValue(fail());
      const input = await openEditor();
      type(input, '80');
      key(input, 'Enter');
      await settle();
      expect(q('kr-progress-value').textContent!.trim()).toBe('40%');
      const failed = q('kr-save-failed');
      expect(failed.getAttribute('role')).toBe('alert');
      expect(failed.textContent).toContain('没能保存，进度没有改动。');
      expect(failed.textContent).not.toContain('INTERNAL');
    });

    it('retry repeats the same write and clears the message on success', async () => {
      api['setProgress']!.mockResolvedValueOnce(fail());
      const input = await openEditor();
      type(input, '80');
      key(input, 'Enter');
      await settle();
      api['setProgress']!.mockResolvedValueOnce(
        ok(makeChange(makeKr({ progress: 80, status: 'in_progress' }))),
      );
      q('kr-retry').click();
      await settle();
      expect(api['setProgress']).toHaveBeenCalledTimes(2);
      expect(api['setProgress']!.mock.calls[1]).toEqual(api['setProgress']!.mock.calls[0]);
      expect(q('kr-save-failed')).toBeNull();
      expect(q('kr-progress-value').textContent!.trim()).toBe('80%');
    });

    it('discard just removes the message', async () => {
      api['setProgress']!.mockResolvedValue(fail());
      const input = await openEditor();
      type(input, '80');
      key(input, 'Enter');
      await settle();
      q('kr-discard').click();
      fixture.detectChanges();
      expect(q('kr-save-failed')).toBeNull();
      expect(q('kr-progress-value').textContent!.trim()).toBe('40%');
    });

    it.each(['LATEST_IS_REVERT', 'NOTHING_TO_REVERT', 'NOT_FOUND', 'KEY_RESULT_REMOVED'] as const)(
      'a stale-state error (%s) shows no retry row, only a status line',
      async (code) => {
        api['setProgress']!.mockResolvedValue({
          ok: false,
          error: { code, message: 'x' },
        });
        const input = await openEditor();
        type(input, '80');
        key(input, 'Enter');
        await settle();
        expect(q('kr-save-failed')).toBeNull();
        expect(q('kr-retry')).toBeNull();
        expect(q('kr-live').textContent).toContain('已刷新为最新状态');
      },
    );

    it('a failed status change and a failed revert show the same message', async () => {
      api['setProgress']!.mockResolvedValue(fail());
      q('kr-status').click();
      fixture.detectChanges();
      root().querySelectorAll<HTMLElement>('[role="menuitemradio"]')[3]!.click();
      await settle();
      expect(q('kr-save-failed')).not.toBeNull();
      expect(q('kr-status').textContent).toContain('进行中');

      await load([makeKr({ progress: 40 })], {
        'kr-1': makeInfo({
          latest: makeEntry(),
          before: { value: 1, status: 'in_progress' },
          canRevert: true,
        }),
      });
      api['revertProgress']!.mockResolvedValue(fail());
      q('kr-revert-last').click();
      await settle();
      expect(q('kr-save-failed')).not.toBeNull();
    });
  });

  describe('saving indicator', () => {
    it('shows a spinner and aria-busy only after 300ms', async () => {
      jest.useFakeTimers();
      try {
        await load([makeKr({ progress: 40, status: 'in_progress' })]);
        let resolve: (v: unknown) => void = () => undefined;
        api['setProgress']!.mockImplementation(() => new Promise((r) => (resolve = r)));
        const input = await openEditor();
        type(input, '50');
        key(input, 'Enter');
        await jest.advanceTimersByTimeAsync(100);
        fixture.detectChanges();
        expect(q('kr-progress-value').getAttribute('aria-busy')).toBe('true');
        expect(root().querySelector('.kr__spinner')).toBeNull();
        await jest.advanceTimersByTimeAsync(250);
        fixture.detectChanges();
        expect(root().querySelector('.kr__spinner')).not.toBeNull();
        resolve(ok(makeChange(makeKr({ progress: 50, status: 'in_progress' }))));
        await jest.advanceTimersByTimeAsync(0);
        fixture.detectChanges();
        expect(root().querySelector('.kr__spinner')).toBeNull();
        expect(q('kr-progress-value').getAttribute('aria-busy')).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
