import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { ClosedLoopApi } from './closed-loop-api.service';
import { ClosedLoopStore } from './closed-loop.store';
import { ExportFlow } from './export-flow.service';
import { ExportMenuComponent } from './export-menu.component';

@Component({
  standalone: true,
  imports: [ExportMenuComponent],
  template: `<button id="before" type="button">before</button>
    <clarityokr-export-menu />
    <button id="after" type="button">after</button>`,
})
class Host {}

describe('ExportMenuComponent (spec §6.2, §2.6 menu, T9)', () => {
  let fixture: ComponentFixture<Host>;
  let api: { exportOkr: jest.Mock; reveal: jest.Mock; copyMarkdown: jest.Mock };
  let store: ClosedLoopStore;

  const root = (): HTMLElement => fixture.nativeElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string): T =>
    root().querySelector(`[data-testid="${id}"]`) as T;
  const items = (): HTMLElement[] =>
    Array.from(root().querySelectorAll<HTMLElement>('[role="menuitem"]'));
  const tick = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  };
  const key = (target: HTMLElement, init: KeyboardEventInit): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  };
  const open = async (): Promise<void> => {
    q('export-button').click();
    fixture.detectChanges();
    await tick();
  };

  beforeEach(async () => {
    api = {
      exportOkr: jest.fn().mockResolvedValue({ ok: true, data: { outcome: 'cancelled' } }),
      reveal: jest.fn(),
      getStorageMode: jest.fn().mockResolvedValue('normal'),
      copyMarkdown: jest.fn().mockResolvedValue({ ok: true, data: { copied: true } }),
    };
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: ClosedLoopApi, useValue: api }],
    });
    store = TestBed.inject(ClosedLoopStore);
    store.currentId.set('okr-1');
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
  });

  afterEach(() => fixture.nativeElement.remove());

  it('is a button named 导出 that opens a menu: aria-haspopup="menu", aria-expanded', async () => {
    const button = q('export-button');
    expect(button.textContent!.replace(/\s+/g, ' ').trim()).toContain('导出');
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(q('export-menu')).toBeNull();
    await open();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(q('export-menu').getAttribute('role')).toBe('menu');
  });

  it('has three items with subtitles and a separator before 复制为 Markdown', async () => {
    await open();
    expect(items().map((i) => i.textContent!.replace(/\s+/g, ' ').trim())).toEqual([
      '导出为 Markdown… 便于阅读，.md 文件',
      '导出为 JSON… 数据文件，.json，含全部进度记录',
      '复制为 Markdown 复制到剪贴板',
    ]);
    expect(root().querySelectorAll('[role="separator"]')).toHaveLength(1);
    expect(root().textContent).not.toContain('备份');
    for (const item of items()) expect(item.getAttribute('tabindex')).toBe('-1');
  });

  it('Enter / Space (a click) opens and focuses the first item', async () => {
    await open();
    expect(document.activeElement).toBe(items()[0]);
  });

  it('↓ on the button opens and focuses the first item', async () => {
    const event = key(q('export-button'), { key: 'ArrowDown' });
    await tick();
    expect(event.defaultPrevented).toBe(true);
    expect(q('export-menu')).not.toBeNull();
    expect(document.activeElement).toBe(items()[0]);
  });

  it('↑ ↓ Home End move (and wrap)', async () => {
    await open();
    key(document.activeElement as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items()[1]);
    key(document.activeElement as HTMLElement, { key: 'End' });
    expect(document.activeElement).toBe(items()[2]);
    key(document.activeElement as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items()[0]);
    key(document.activeElement as HTMLElement, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items()[2]);
    key(document.activeElement as HTMLElement, { key: 'Home' });
    expect(document.activeElement).toBe(items()[0]);
  });

  it('Esc closes the menu and the focus goes back to the button', async () => {
    await open();
    key(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(q('export-menu')).toBeNull();
    expect(q('export-button').getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(q('export-button'));
  });

  it('Esc right after opening (focus still on the button) closes it too', () => {
    const button = q('export-button');
    button.focus();
    button.click();
    fixture.detectChanges();
    expect(q('export-menu')).not.toBeNull();
    const event = key(button, { key: 'Escape' });
    expect(event.defaultPrevented).toBe(true);
    expect(q('export-menu')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('Tab closes the menu (the focus moves on naturally)', async () => {
    await open();
    key(document.activeElement as HTMLElement, { key: 'Tab' });
    expect(q('export-menu')).toBeNull();
  });

  it('a press outside closes it', async () => {
    await open();
    document.getElementById('after')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    fixture.detectChanges();
    expect(q('export-menu')).toBeNull();
  });

  it('a second click on the button closes it', async () => {
    await open();
    q('export-button').click();
    fixture.detectChanges();
    expect(q('export-menu')).toBeNull();
  });

  it('导出为 Markdown… exports md for the open OKR, closes the menu, and the focus is on the button', async () => {
    await open();
    q('export-md').click();
    fixture.detectChanges();
    await tick();
    expect(api.exportOkr).toHaveBeenCalledWith({ okrId: 'okr-1', format: 'md' });
    expect(q('export-menu')).toBeNull();
    expect(document.activeElement).toBe(q('export-button'));
  });

  it('导出为 JSON… exports json', async () => {
    await open();
    q('export-json').click();
    await tick();
    expect(api.exportOkr).toHaveBeenCalledWith({ okrId: 'okr-1', format: 'json' });
  });

  it('复制为 Markdown copies through the clipboard channel (no dialog)', async () => {
    await open();
    q('export-copy-md').click();
    await tick();
    expect(api.copyMarkdown).toHaveBeenCalledWith({ okrId: 'okr-1' });
    expect(api.exportOkr).not.toHaveBeenCalled();
  });

  describe('when there is nothing to export', () => {
    it('is aria-disabled (still focusable) with the tooltip 「没有可导出的内容」 and does not open', () => {
      store.currentId.set(null);
      fixture.detectChanges();
      const button = q<HTMLButtonElement>('export-button');
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.disabled).toBe(false);
      expect(button.title).toBe('没有可导出的内容');
      button.click();
      fixture.detectChanges();
      expect(q('export-menu')).toBeNull();
      key(button, { key: 'ArrowDown' });
      expect(q('export-menu')).toBeNull();
      button.focus();
      expect(document.activeElement).toBe(button);
    });

    it('while regenerating the tooltip says so', () => {
      store.regenerating.set(true);
      fixture.detectChanges();
      expect(q('export-button').title).toBe('正在重新生成，完成后可导出');
      expect(q('export-button').getAttribute('aria-disabled')).toBe('true');
    });

    it('is available again when an OKR is open and nothing is regenerating', () => {
      expect(q('export-button').getAttribute('aria-disabled')).toBeNull();
      expect(q('export-button').hasAttribute('title')).toBe(false);
    });
  });

  describe('loading', () => {
    it('shows a spinner, aria-busy and the spoken status 「正在导出…」 after 300ms', () => {
      const flow = TestBed.inject(ExportFlow);
      flow.slow.set(true);
      flow.statusText.set('正在导出…');
      fixture.detectChanges();
      expect(q('export-spinner')).not.toBeNull();
      expect(q('export-button').getAttribute('aria-busy')).toBe('true');
      expect(q('export-status').textContent).toBe('正在导出…');
      expect(q('export-status').getAttribute('role')).toBe('status');
    });

    it('does not open while an export is running', () => {
      TestBed.inject(ExportFlow).busy.set(true);
      q('export-button').click();
      fixture.detectChanges();
      expect(q('export-menu')).toBeNull();
    });
  });
});
