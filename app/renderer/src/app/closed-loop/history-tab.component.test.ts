import { Component, inject } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { OkrListItem } from '@clarityokr/contracts';

import { Logger } from '../core/services/logger.service';
import { OkrStickyService } from '../okr-sticky/services/okr-sticky.service';
import { ClosedLoopApi } from './closed-loop-api.service';
import { ClosedLoopStore } from './closed-loop.store';
import { HistoryTabComponent } from './history-tab.component';
import { makeDetail, makeListItem } from './testing/fixtures';

@Component({
  standalone: true,
  imports: [HistoryTabComponent],
  template: `<clarityokr-history-tab [blockedReason]="blocked" (opened)="opened.push($event)" />`,
})
class Host {
  readonly store = inject(ClosedLoopStore);
  blocked: string | null = null;
  opened: string[] = [];
}

const items = (n: number): OkrListItem[] =>
  Array.from({ length: n }, (_, i) =>
    makeListItem({
      id: `okr-${i + 1}`,
      title: `目标 ${i + 1}`,
      updatedAt: new Date(2026, 9, 9, 12, 0, 0).toISOString(),
    }),
  );

describe('HistoryTabComponent', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let api: Record<string, jest.Mock>;
  let sticky: { openFromDetail: jest.Mock };

  const root = (): HTMLElement => fixture.nativeElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string): T =>
    root().querySelector(`[data-testid="${id}"]`) as T;
  const options = (): HTMLElement[] => Array.from(root().querySelectorAll('[role="option"]'));
  const key = (el: Element, k: string, init: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {
      key: k,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    el.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  };
  const settle = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  };
  function show(list: OkrListItem[], currentId: string | null = null): void {
    host.store.list.set(list);
    host.store.listState.set('ready');
    host.store.currentId.set(currentId);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    api = { open: jest.fn() };
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
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => fixture.nativeElement.remove());

  describe('page states', () => {
    it('loading: heading plus four skeletons in an aria-busy region', () => {
      expect(q('history-loading').getAttribute('aria-busy')).toBe('true');
      expect(root().querySelectorAll('clarityokr-skeleton')).toHaveLength(4);
      expect(options()).toHaveLength(0);
    });

    it('empty library: title, body copy and no list', () => {
      show([]);
      expect(q('history-empty').textContent).toContain('还没有 OKR');
      expect(q('history-empty').textContent).toContain(
        '你创建的每一个 OKR 都会保存在这里，随时可以找回。',
      );
      expect(q('history-list')).toBeNull();
      expect(q('history-heading').textContent!.trim()).toBe('全部 OKR · 0');
    });

    it('error: alert with retry that reloads the list', async () => {
      host.store.listState.set('error');
      fixture.detectChanges();
      expect(q('history-error').querySelector('[role="alert"]')!.textContent).toContain(
        '没能读取 OKR 列表。',
      );
      api['list'] = jest.fn().mockResolvedValue({ ok: true, data: { items: items(2) } });
      q('history-retry').click();
      await settle();
      expect(options()).toHaveLength(2);
    });
  });

  describe('list', () => {
    it('renders a labelled listbox with the heading count', () => {
      show(items(3));
      const list = q('history-list');
      expect(list.getAttribute('role')).toBe('listbox');
      expect(list.getAttribute('aria-label')).toBe('OKR 列表');
      expect(q('history-heading').textContent!.trim()).toBe('全部 OKR · 3');
      expect(options().map((o) => o.querySelector('.item__title')!.textContent)).toEqual([
        '目标 1',
        '目标 2',
        '目标 3',
      ]);
    });

    it('item content: period, progress, key result count, reviewed / all done, pinned, time', () => {
      show([
        makeListItem({
          id: 'a',
          title: '提升团队交付效率',
          period: '2026-Q4',
          overallProgress: 62,
          keyResultCount: 4,
          reviewed: true,
          allDone: true,
          pinned: true,
          updatedAt: new Date().toISOString(),
        }),
        makeListItem({ id: 'b', title: '没有进度', overallProgress: null, keyResultCount: 3 }),
      ]);
      const [first, second] = options();
      const text = first!.textContent!.replace(/\s+/g, ' ');
      expect(text).toContain('2026-Q4');
      expect(text).toContain('62%');
      expect(text).toContain('4 个关键结果');
      expect(text).toContain('已复盘');
      expect(text).toContain('全部完成');
      expect(text).toContain('置顶');
      expect(text).toContain('更新于 今天');
      expect(first!.querySelector('.item__mini')).not.toBeNull();
      expect(second!.textContent).toContain('—');
      expect(second!.textContent).not.toContain('已复盘');
      expect(second!.querySelector('.item__mini')).toBeNull();
      // history items are OKR level: no metric line
      expect(root().textContent).not.toContain('度量');
    });

    it('builds the accessible name from title, period, progress, count, flags and time', () => {
      show([
        makeListItem({
          id: 'a',
          title: '提升团队交付效率',
          period: '2026-Q4',
          overallProgress: 62,
          keyResultCount: 4,
          reviewed: true,
          pinned: true,
          updatedAt: new Date(2026, 9, 9, 14, 20).toISOString(),
        }),
      ]);
      const name = (): string =>
        options()[0]!
          .textContent!.replace(/\s+/g, ' ')
          .replace(/ ?， ?/g, '，');
      expect(name()).toContain('提升团队交付效率');
      expect(name()).toContain('周期 2026-Q4，整体进度 62%，4 个关键结果');
      expect(name()).toContain('2026-Q4');
      expect(name()).toContain('62%');
      expect(name()).toContain('4 个关键结果');
      expect(name()).toContain('已复盘');
      expect(name()).toContain('置顶');
      expect(name()).toContain('更新于');
      // the name is the visible text: no aria-label that could drift from it
      expect(options()[0]!.hasAttribute('aria-label')).toBe(false);
      show([makeListItem({ id: 'b', title: '空' })]);
      expect(name()).not.toContain('周期');
      expect(name()).toContain('整体进度未填写');
    });

    it('marks the open one: aria-selected, the 当前打开 text and the class', () => {
      show(items(3), 'okr-2');
      expect(options().map((o) => o.getAttribute('aria-selected'))).toEqual([
        'false',
        'true',
        'false',
      ]);
      expect(options()[1]!.textContent).toContain('当前打开');
      expect(options()[1]!.className).toContain('item--current');
      expect(options()[0]!.textContent).not.toContain('当前打开');
    });
  });

  describe('keyboard (T6)', () => {
    beforeEach(() => show(items(12), 'okr-3'));

    it('roving tabindex: exactly one item is a Tab stop, the open one', () => {
      expect(options().filter((o) => o.tabIndex === 0)).toHaveLength(1);
      expect(options()[2]!.tabIndex).toBe(0);
    });

    it('falls back to the first item when none is open', () => {
      show(items(3), null);
      expect(options().map((o) => o.tabIndex)).toEqual([0, -1, -1]);
    });

    it('↑ ↓ Home End PageUp PageDown move focus and the Tab stop (clamped)', () => {
      options()[2]!.focus();
      key(options()[2]!, 'ArrowDown');
      expect(document.activeElement).toBe(options()[3]);
      expect(options()[3]!.tabIndex).toBe(0);
      expect(options()[2]!.tabIndex).toBe(-1);
      key(options()[3]!, 'ArrowUp');
      key(options()[2]!, 'ArrowUp');
      key(options()[1]!, 'ArrowUp');
      key(options()[0]!, 'ArrowUp');
      expect(document.activeElement).toBe(options()[0]);
      key(options()[0]!, 'End');
      expect(document.activeElement).toBe(options()[11]);
      key(options()[11]!, 'ArrowDown');
      expect(document.activeElement).toBe(options()[11]);
      key(options()[11]!, 'Home');
      expect(document.activeElement).toBe(options()[0]);
      key(options()[0]!, 'PageDown');
      expect(document.activeElement).toBe(options()[5]);
      key(options()[5]!, 'PageUp');
      expect(document.activeElement).toBe(options()[0]);
    });

    it('Enter opens the OKR, switches the store and emits opened', async () => {
      api['open']!.mockResolvedValue({ ok: true, data: makeDetail([], { id: 'okr-4' }) });
      options()[3]!.focus();
      key(options()[3]!, 'Enter');
      await settle();
      expect(api['open']).toHaveBeenCalledWith({ okrId: 'okr-4' });
      expect(host.opened).toEqual(['okr-4']);
      expect(host.store.currentId()).toBe('okr-4');
      expect(sticky.openFromDetail).toHaveBeenCalled();
    });

    it('a click opens too; a failure shows an alert and does not emit', async () => {
      api['open']!.mockResolvedValue({ ok: false, error: { code: 'NOT_FOUND', message: 'x' } });
      options()[1]!.click();
      await settle();
      expect(host.opened).toEqual([]);
      expect(q('history-open-error').getAttribute('role')).toBe('alert');
      expect(q('history-open-error').textContent).toContain('没能打开这条 OKR，请重试。');
    });

    it('is blocked with a visible reason while regeneration or text editing runs', async () => {
      host.blocked = '正在重新生成，完成后可切换。';
      fixture.detectChanges();
      expect(q('history-blocked').textContent).toContain('正在重新生成，完成后可切换。');
      expect(q('history-list').getAttribute('aria-disabled')).toBe('true');
      expect(options()[0]!.getAttribute('aria-disabled')).toBe('true');
      options()[0]!.click();
      key(options()[0]!, 'Enter');
      await settle();
      expect(api['open']).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('appears only above 8 OKRs', () => {
      show(items(8));
      expect(q('history-search')).toBeNull();
      show(items(9));
      const search = q<HTMLInputElement>('history-search');
      expect(search.getAttribute('role')).toBe('searchbox');
      expect(search.getAttribute('aria-label')).toBe('搜索 OKR 目标');
      expect(search.placeholder).toBe('搜索目标…');
    });

    it('filters as you type, announces the count and clears with the button', () => {
      show([...items(9), makeListItem({ id: 'x', title: '提升团队交付效率' })]);
      const search = q<HTMLInputElement>('history-search');
      search.value = '交付';
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(options()).toHaveLength(1);
      expect(root().querySelector('[role="status"]')!.textContent).toBe('找到 1 个 OKR');
      q('history-clear').click();
      fixture.detectChanges();
      expect(options()).toHaveLength(10);
      expect(document.activeElement).toBe(search);
    });

    it('no results: message with the keyword and a clear button', () => {
      show(items(9));
      const search = q<HTMLInputElement>('history-search');
      search.value = '不存在';
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(q('history-no-match').textContent).toContain('没有找到包含「不存在」的 OKR。');
      expect(q('history-no-match').querySelector('button')!.textContent).toContain('清除搜索');
    });

    it('/ focuses the search; Esc clears it, a second Esc goes back to the list', () => {
      show(items(9));
      const search = q<HTMLInputElement>('history-search');
      options()[0]!.focus();
      expect(key(options()[0]!, '/').defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(search);
      search.value = '目标 1';
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      key(search, 'Escape');
      expect(search.value).toBe('');
      expect(options()).toHaveLength(9);
      key(search, 'Escape');
      expect(document.activeElement).toBe(options()[0]);
    });

    it('/ does nothing without a search box', () => {
      show(items(3));
      options()[0]!.focus();
      expect(key(options()[0]!, '/').defaultPrevented).toBe(false);
    });
  });
});
