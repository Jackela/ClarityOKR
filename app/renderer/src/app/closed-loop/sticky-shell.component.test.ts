import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { Logger } from '../core/services/logger.service';
import {
  OkrStickyService,
  type OkrStickyViewModel,
} from '../okr-sticky/services/okr-sticky.service';
import { EditModeStore } from '../okr-sticky/state/edit-mode.store';
import { ClosedLoopApi } from './closed-loop-api.service';
import { ClosedLoopStore } from './closed-loop.store';
import { StickyShellComponent } from './sticky-shell.component';
import { makeDetail, makeKr, makeListItem } from './testing/fixtures';

@Component({
  standalone: true,
  imports: [StickyShellComponent],
  template: `<clarityokr-sticky-shell [okr]="okr" />`,
})
class Host {
  okr: OkrStickyViewModel | null = null;
}

const view: OkrStickyViewModel = {
  id: 'okr-1',
  objective: '提升团队交付节奏',
  keyResults: [],
  generatedAt: '2026-10-09T08:00:00.000Z',
  lastEditedAt: null,
  hasManualEdits: false,
  regenerationPolicy: 'append',
};

describe('StickyShellComponent', () => {
  let fixture: ComponentFixture<Host>;
  let api: Record<string, jest.Mock>;
  let sticky: { openFromDetail: jest.Mock };

  const root = (): HTMLElement => fixture.nativeElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string): T =>
    root().querySelector(`[data-testid="${id}"]`) as T;
  const panel = (id: string): HTMLElement => root().querySelector(`#panel-${id}`) as HTMLElement;
  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    api = {
      open: jest.fn().mockResolvedValue({ ok: true, data: makeDetail([makeKr()]) }),
      getReview: jest.fn().mockResolvedValue({ ok: true, data: { review: null } }),
      saveReview: jest.fn(),
      getStorageMode: jest.fn().mockResolvedValue('normal'),
      list: jest.fn().mockResolvedValue({
        ok: true,
        data: {
          items: [makeListItem({ id: 'okr-1' }), makeListItem({ id: 'okr-2', title: '旧 OKR' })],
        },
      }),
    };
    sticky = { openFromDetail: jest.fn() };
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        { provide: ClosedLoopApi, useValue: api },
        { provide: OkrStickyService, useValue: sticky },
        { provide: Logger, useValue: { warn: jest.fn(), error: jest.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.componentInstance.okr = view;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => fixture.nativeElement.remove());

  it('shows the tablist (便签 / 复盘 / 历史) with the note panel selected and labelled by its tab', () => {
    expect(
      Array.from(root().querySelectorAll('[role="tab"]')).map((t) => t.textContent!.trim()),
    ).toEqual(['便签', '复盘', '历史']);
    expect(panel('note').getAttribute('role')).toBe('tabpanel');
    expect(panel('note').getAttribute('aria-labelledby')).toBe('tab-note');
    expect(panel('note').hidden).toBe(false);
    expect(panel('history').hidden).toBe(true);
    expect(q('sticky-objective').textContent).toBe('提升团队交付节奏');
  });

  it('switching to 历史 loads the list and keeps the note mounted (hidden)', async () => {
    q('tab-history').click();
    fixture.detectChanges();
    await settle();
    expect(api['list']).toHaveBeenCalledTimes(1);
    expect(panel('history').hidden).toBe(false);
    expect(panel('note').hidden).toBe(true);
    expect(panel('history').getAttribute('aria-labelledby')).toBe('tab-history');
    expect(root().querySelectorAll('[role="option"]')).toHaveLength(2);
    expect(panel('note').querySelector('[data-testid="sticky-objective"]')).not.toBeNull();
  });

  it('opening an OKR from the history switches back to the note and focuses its title', async () => {
    q('tab-history').click();
    fixture.detectChanges();
    await settle();
    api['open']!.mockResolvedValue({
      ok: true,
      data: makeDetail([makeKr({ objectiveId: 'okr-2' })], {
        id: 'okr-2',
        title: '旧 OKR',
        pinned: false,
      }),
    });
    root().querySelectorAll<HTMLElement>('[role="option"]')[1]!.click();
    await settle();
    await new Promise((resolve) => setTimeout(resolve, 5));
    fixture.detectChanges();
    expect(panel('note').hidden).toBe(false);
    expect(q('tab-note').getAttribute('aria-selected')).toBe('true');
    expect(sticky.openFromDetail).toHaveBeenCalled();
    expect(TestBed.inject(ClosedLoopStore).currentId()).toBe('okr-2');
    expect(document.activeElement).toBe(q('sticky-objective'));
  });

  it('Ctrl/⌘+3 opens 历史 and Ctrl/⌘+1 returns; other combinations are ignored', async () => {
    const press = (init: KeyboardEventInit): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      document.dispatchEvent(event);
      fixture.detectChanges();
      return event;
    };
    expect(press({ key: '3', ctrlKey: true }).defaultPrevented).toBe(true);
    await settle();
    expect(panel('history').hidden).toBe(false);
    expect(press({ key: '1', metaKey: true }).defaultPrevented).toBe(true);
    expect(panel('note').hidden).toBe(false);
    expect(press({ key: '3' }).defaultPrevented).toBe(false);
    expect(press({ key: '3', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    expect(press({ key: '2', ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);
    expect(panel('note').hidden).toBe(false);
  });

  it('Ctrl/⌘+2 opens 复盘 and reads the review of the open OKR', async () => {
    const event = new KeyboardEvent('keydown', {
      key: '2',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    fixture.detectChanges();
    await settle();
    expect(event.defaultPrevented).toBe(true);
    expect(panel('review').hidden).toBe(false);
    expect(panel('review').getAttribute('aria-labelledby')).toBe('tab-review');
    expect(q('tab-review').getAttribute('aria-selected')).toBe('true');
    expect(api['getReview']).toHaveBeenCalledWith({ okrId: 'okr-1' });
    expect(q('review-state').textContent).toContain('还没有复盘');
  });

  describe('leaving the review with unsaved text', () => {
    const type = async (text: string): Promise<void> => {
      q('tab-review').click();
      fixture.detectChanges();
      await settle();
      const field = q<HTMLTextAreaElement>('review-wentWell');
      field.value = text;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    };

    it('asks first; 继续编辑 stays on the review with the text kept', async () => {
      await type('写了一半');
      q('tab-note').click();
      fixture.detectChanges();
      const dialog = q('review-leave-dialog');
      expect(dialog.getAttribute('role')).toBe('alertdialog');
      expect(dialog.textContent).toContain('放弃未保存的复盘修改？');
      expect(dialog.textContent).toContain('你写的内容还没有保存。');
      expect(document.activeElement).toBe(q('dialog-cancel'));
      expect(q('dialog-cancel').textContent!.trim()).toBe('继续编辑');
      q('dialog-cancel').click();
      fixture.detectChanges();
      expect(q('review-leave-dialog')).toBeNull();
      expect(q('tab-review').getAttribute('aria-selected')).toBe('true');
      expect(q<HTMLTextAreaElement>('review-wentWell').value).toBe('写了一半');
    });

    it('放弃修改 leaves and drops the text; coming back shows the saved (empty) review', async () => {
      await type('写了一半');
      q('tab-history').click();
      fixture.detectChanges();
      q('dialog-confirm').click();
      fixture.detectChanges();
      await settle();
      expect(q('tab-history').getAttribute('aria-selected')).toBe('true');
      q('tab-review').click();
      fixture.detectChanges();
      await settle();
      expect(q<HTMLTextAreaElement>('review-wentWell').value).toBe('');
    });

    describe('a save is in flight when the user wants to leave (design ruling)', () => {
      let release: (value: unknown) => void = () => undefined;
      const savedRecord = {
        objectiveId: 'okr-1',
        wentWell: '写了一半',
        fellShort: '',
        nextSteps: '',
        snapshot: [],
        savedAt: '2026-10-10T08:00:00.000Z',
        snapshotAt: '2026-10-10T08:00:00.000Z',
      };
      const startSaveThenLeave = async (): Promise<void> => {
        await type('写了一半');
        api['saveReview']!.mockReturnValue(new Promise((r) => (release = r)));
        q('review-save').click();
        fixture.detectChanges();
        q('tab-history').click();
        fixture.detectChanges();
      };

      it('「放弃修改」 is aria-disabled with 正在保存，请稍候。 and does nothing', async () => {
        await startSaveThenLeave();
        const confirm = q('dialog-confirm');
        expect(confirm.getAttribute('aria-disabled')).toBe('true');
        expect(q('dialog-note').textContent).toBe('正在保存，请稍候。');
        expect(q('review-save').getAttribute('aria-busy')).toBe('true');
        confirm.click();
        fixture.detectChanges();
        expect(q('review-leave-dialog')).not.toBeNull();
        expect(q('tab-review').getAttribute('aria-selected')).toBe('true');
        expect(q<HTMLTextAreaElement>('review-wentWell').value).toBe('写了一半');
      });

      it('on success the dialog closes by itself and the leave goes on (and it IS saved)', async () => {
        await startSaveThenLeave();
        release({ ok: true, data: { review: savedRecord } });
        await settle();
        await settle();
        expect(q('review-leave-dialog')).toBeNull();
        expect(q('tab-history').getAttribute('aria-selected')).toBe('true');
        expect(api['saveReview']).toHaveBeenCalledTimes(1);
        api['getReview']!.mockResolvedValue({ ok: true, data: { review: savedRecord } });
        q('tab-review').click();
        fixture.detectChanges();
        await settle();
        expect(q<HTMLTextAreaElement>('review-wentWell').value).toBe('写了一半');
      });

      it('on failure 「放弃修改」 is clickable again and the text is still there', async () => {
        await startSaveThenLeave();
        release({ ok: false, error: { code: 'INTERNAL', message: 'x' } });
        await settle();
        await settle();
        const confirm = q('dialog-confirm');
        expect(confirm.getAttribute('aria-disabled')).toBeNull();
        expect(q('dialog-note')).toBeNull();
        expect(q('tab-review').getAttribute('aria-selected')).toBe('true');
        confirm.click();
        fixture.detectChanges();
        await settle();
        expect(q('tab-history').getAttribute('aria-selected')).toBe('true');
        expect(q('review-leave-dialog')).toBeNull();
      });

      it('Esc (继续编辑) while saving closes the dialog and the save still finishes on the review', async () => {
        await startSaveThenLeave();
        q('dialog-cancel').click();
        fixture.detectChanges();
        release({ ok: true, data: { review: savedRecord } });
        await settle();
        await settle();
        expect(q('tab-review').getAttribute('aria-selected')).toBe('true');
        expect(q('review-state').textContent).toContain('已保存');
      });

      it('the dialog is modal: the shell behind it is inert', async () => {
        await startSaveThenLeave();
        expect(q('tab-review').closest('[inert]')).not.toBeNull();
        q('dialog-cancel').click();
        fixture.detectChanges();
        expect(document.querySelectorAll('[inert]')).toHaveLength(0);
      });
    });

    it('Esc in the dialog keeps editing', async () => {
      await type('x');
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: '1', ctrlKey: true, bubbles: true }),
      );
      fixture.detectChanges();
      expect(q('review-leave-dialog')).not.toBeNull();
      q('review-leave-dialog').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
      fixture.detectChanges();
      expect(q('review-leave-dialog')).toBeNull();
      expect(q('tab-review').getAttribute('aria-selected')).toBe('true');
    });

    it('does not ask when nothing was typed', async () => {
      q('tab-review').click();
      fixture.detectChanges();
      await settle();
      q('tab-note').click();
      fixture.detectChanges();
      expect(q('review-leave-dialog')).toBeNull();
      expect(q('tab-note').getAttribute('aria-selected')).toBe('true');
    });
  });

  it('blocks opening other OKRs with the right reason while regenerating or editing text', async () => {
    const store = TestBed.inject(ClosedLoopStore);
    q('tab-history').click();
    fixture.detectChanges();
    await settle();
    store.operationBusy.set(true);
    fixture.detectChanges();
    expect(q('history-blocked').textContent).toContain('正在重新生成，完成后可切换。');
    store.operationBusy.set(false);
    TestBed.inject(EditModeStore).enterEditMode('x', []);
    fixture.detectChanges();
    expect(q('history-blocked').textContent).toContain('正在编辑文字，保存或取消后可切换。');
    TestBed.inject(EditModeStore).cancelEdits();
    fixture.detectChanges();
    expect(q('history-blocked')).toBeNull();
  });

  it('without an OKR the note tab shows the empty state', () => {
    fixture.componentInstance.okr = null;
    fixture.detectChanges();
    expect(q('note-empty').textContent).toContain('还没有 OKR');
    expect(q('note-empty').textContent).toContain(
      '告诉 ClarityOKR 你想实现什么，回答几个问题就能生成。',
    );
    expect(q('sticky-objective')).toBeNull();
  });
});
