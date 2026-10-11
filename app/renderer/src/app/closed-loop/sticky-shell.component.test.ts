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
  template: `<clarityokr-sticky-shell [okr]="okr" (addKr)="adds = adds + 1" />`,
})
class Host {
  okr: OkrStickyViewModel | null = null;
  adds = 0;
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

  it('shows the tablist (便签 / 历史) with the note panel selected and labelled by its tab', () => {
    expect(
      Array.from(root().querySelectorAll('[role="tab"]')).map((t) => t.textContent!.trim()),
    ).toEqual(['便签', '历史']);
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
    expect(press({ key: '2', ctrlKey: true }).defaultPrevented).toBe(false);
    expect(panel('note').hidden).toBe(false);
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

  it('forwards addKr from the note', async () => {
    q('sticky-add-kr').click();
    expect(fixture.componentInstance.adds).toBe(1);
  });
});
