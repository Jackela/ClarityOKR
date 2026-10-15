import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { Logger } from '../core/services/logger.service';
import { OkrStickyService } from '../okr-sticky/services/okr-sticky.service';
import { ClosedLoopApi } from './closed-loop-api.service';
import { TopBarComponent } from './top-bar.component';

describe('TopBarComponent (spec §1.2 / §1.2a: drag area, 「⋯」, 「隐藏」)', () => {
  let fixture: ComponentFixture<TopBarComponent>;
  let api: Record<string, jest.Mock>;
  const q = <T extends HTMLElement = HTMLElement>(id: string): T =>
    fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as T;
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
    }
  };
  const key = (target: Element, k: string): void => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  };

  beforeEach(async () => {
    api = {
      getWindowState: jest.fn().mockResolvedValue({ ok: true, data: { alwaysOnTop: true } }),
      setAlwaysOnTop: jest.fn((enabled: boolean) =>
        Promise.resolve({ ok: true, data: { alwaysOnTop: enabled } }),
      ),
      hideWindow: jest.fn().mockResolvedValue({ ok: true, data: { hidden: true } }),
    };
    await TestBed.configureTestingModule({
      imports: [TopBarComponent],
      providers: [
        { provide: ClosedLoopApi, useValue: api },
        { provide: OkrStickyService, useValue: { getCurrentViewModel: () => null } },
        { provide: Logger, useValue: { warn: jest.fn(), error: jest.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TopBarComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => fixture.nativeElement.remove());

  it('Tab order is 导出 → 更多 → 隐藏; 更多 / 隐藏 have names, 隐藏 has the tooltip', () => {
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    );
    const names = buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent!.trim());
    expect(names[0]).toContain('导出');
    expect(names.slice(1)).toEqual(['更多', '隐藏便签']);
    expect(q('more-button').getAttribute('aria-haspopup')).toBe('menu');
    expect(q('more-button').getAttribute('aria-expanded')).toBe('false');
    const tooltip = q('hide-tooltip');
    expect(tooltip.getAttribute('role')).toBe('tooltip');
    expect(tooltip.textContent!.trim()).toBe('隐藏便签（应用仍在运行，不是退出）');
    expect(q('hide-button').getAttribute('aria-describedby')).toBe(tooltip.id);
  });

  it('N15: the tooltip says 「退出…」 only while hiding would quit (asked again on hover / focus)', async () => {
    const hideArea = q('hide-button').parentElement!;
    api.getWindowState.mockResolvedValue({
      ok: true,
      data: { alwaysOnTop: true, hideQuits: true },
    });
    hideArea.dispatchEvent(new MouseEvent('mouseenter'));
    await settle();
    expect(q('hide-tooltip').textContent!.trim()).toBe(
      '退出 ClarityOKR（没有托盘图标，隐藏后无法唤回）',
    );
    // the accessible name follows the tooltip: the button now quits
    expect(q('hide-button').getAttribute('aria-label')).toBe(
      '退出 ClarityOKR（没有托盘图标，隐藏后无法唤回）',
    );
    // #39: the name already says it; no describedby repeating the same sentence
    expect(q('hide-button').hasAttribute('aria-describedby')).toBe(false);
    // another window became visible again → the original text
    api.getWindowState.mockResolvedValue({
      ok: true,
      data: { alwaysOnTop: true, hideQuits: false },
    });
    q('hide-button').dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await settle();
    expect(q('hide-tooltip').textContent!.trim()).toBe('隐藏便签（应用仍在运行，不是退出）');
    // back to the hide name together with the tooltip
    expect(q('hide-button').getAttribute('aria-label')).toBe('隐藏便签');
  });

  it('「隐藏」 hides through window:hide without any dialog', async () => {
    q('hide-button').click();
    await settle();
    expect(api.hideWindow).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="alertdialog"], [role="dialog"]')).toBeNull();
  });

  it('「⋯」 opens a menu with the 窗口始终在最前 switch (checked), focused', async () => {
    q('more-button').click();
    await settle();
    expect(q('more-button').getAttribute('aria-expanded')).toBe('true');
    expect(q('more-menu').getAttribute('role')).toBe('menu');
    const item = q('always-on-top');
    expect(item.getAttribute('role')).toBe('menuitemcheckbox');
    expect(item.getAttribute('aria-checked')).toBe('true');
    expect(item.textContent).toContain('窗口始终在最前');
    expect(document.activeElement).toBe(item);
  });

  it('toggling the switch calls set-always-on-top and reflects the reply', async () => {
    q('more-button').click();
    await settle();
    q('always-on-top').click();
    await settle();
    expect(api.setAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(q('always-on-top').getAttribute('aria-checked')).toBe('false');
  });

  it('the menu shows the state the main process reports', async () => {
    api.getWindowState.mockResolvedValue({ ok: true, data: { alwaysOnTop: false } });
    q('more-button').click();
    await settle();
    expect(q('always-on-top').getAttribute('aria-checked')).toBe('false');
  });

  it('Esc closes the menu and the focus goes back to 「⋯」', async () => {
    q('more-button').click();
    await settle();
    key(q('always-on-top'), 'Escape');
    await settle();
    expect(q('more-menu')).toBeNull();
    expect(document.activeElement).toBe(q('more-button'));
  });

  it('a click outside closes the menu; ArrowDown on 「⋯」 opens it', async () => {
    key(q('more-button'), 'ArrowDown');
    await settle();
    expect(q('more-menu')).not.toBeNull();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await settle();
    expect(q('more-menu')).toBeNull();
  });
});
