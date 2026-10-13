import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { StorageModeName } from '@clarityokr/contracts';

import { Logger } from '../core/services/logger.service';
import { OkrStickyService } from '../okr-sticky/services/okr-sticky.service';
import { ClosedLoopApi } from './closed-loop-api.service';
import { StorageNoticesComponent } from './storage-notices.component';

@Component({
  standalone: true,
  imports: [StorageNoticesComponent],
  template: `
    <h1 id="main-heading" tabindex="-1">ClarityOKR</h1>
    <input id="typing" />
    <clarityokr-storage-notices [window]="win" />
  `,
})
class Host {
  win: 'main' | 'sticky' = 'main';
}

describe('StorageNoticesComponent (spec §7 / §7a / §1.2c)', () => {
  let fixture: ComponentFixture<Host>;
  let api: Record<string, jest.Mock>;
  const listeners = new Map<string, (payload: unknown) => void>();
  const emit = (channel: string, payload: unknown): void => listeners.get(channel)?.(payload);
  const root = (): HTMLElement => fixture.nativeElement;
  const q = <T extends HTMLElement = HTMLElement>(id: string): T =>
    root().querySelector(`[data-testid="${id}"]`) as T;
  const all = (id: string): NodeListOf<Element> => root().querySelectorAll(`[data-testid="${id}"]`);
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
    }
  };

  async function create(
    mode: StorageModeName,
    legacy = false,
    win: 'main' | 'sticky' = 'main',
  ): Promise<void> {
    api = {
      getStorageMode: jest.fn().mockResolvedValue(mode),
      getLegacyNotice: jest.fn().mockResolvedValue(legacy),
      ackLegacyNotice: jest.fn().mockResolvedValue(true),
      restart: jest.fn(),
      reportUnsaved: jest.fn().mockResolvedValue({ ok: true, data: { recorded: true } }),
      onPayload: jest.fn((channel: string, listener: (payload: unknown) => void) => {
        listeners.set(channel, listener);
        return () => listeners.delete(channel);
      }),
    };
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        { provide: ClosedLoopApi, useValue: api },
        { provide: OkrStickyService, useValue: {} },
        { provide: Logger, useValue: { warn: jest.fn(), error: jest.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.win = win;
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await settle();
  }

  afterEach(() => fixture?.nativeElement.remove());

  describe('normal mode', () => {
    it('shows nothing', async () => {
      await create('normal');
      expect(q('memory-bar')).toBeNull();
      expect(q('fresh-notice')).toBeNull();
      expect(q('legacy-notice')).toBeNull();
    });
  });

  describe('memory mode bar (§7a.3)', () => {
    beforeEach(async () => create('memory'));

    it('is a persistent role=alert bar with the title, body and the two buttons, no close', () => {
      const bar = q('memory-bar');
      expect(bar.getAttribute('role')).toBe('alert');
      expect(bar.textContent).toContain('数据无法保存');
      expect(bar.textContent).toContain(
        '本次运行的内容只存在内存里，关闭应用后会丢失。请先导出当前 OKR，或重启应用后再试。',
      );
      expect(q('memory-export').textContent).toContain('导出当前 OKR');
      expect(q('memory-export').getAttribute('aria-haspopup')).toBe('menu');
      expect(q('memory-restart').textContent!.trim()).toBe('重启应用');
      expect(bar.querySelectorAll('button').length).toBe(2);
    });

    it('Esc does not close it', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(q('memory-bar')).not.toBeNull();
    });

    it('restart without anything to lose: one request, the button stays aria-disabled', async () => {
      api.restart.mockResolvedValue({ ok: true, data: { outcome: 'restarting' } });
      q('memory-restart').click();
      await settle();
      expect(api.restart).toHaveBeenCalledWith({
        unsaved: { wizard: false, textEdit: false, reviewDraft: false },
      });
      expect(q('memory-restart').getAttribute('aria-disabled')).toBe('true');
      q('memory-restart').click();
      await settle();
      expect(api.restart).toHaveBeenCalledTimes(1);
      expect(q('restart-dialog')).toBeNull();
    });

    it('confirm_pending: no dialog in this component, the button stays busy until the result', async () => {
      api.restart.mockResolvedValue({ ok: true, data: { outcome: 'confirm_pending' } });
      q('memory-restart').click();
      await settle();
      expect(q('restart-dialog')).toBeNull();
      expect(q('memory-restart').getAttribute('aria-disabled')).toBe('true');
      q('memory-restart').click();
      await settle();
      expect(api.restart).toHaveBeenCalledTimes(1);
    });

    it('restart-result cancelled (先不重启 in the main window) → enabled again, focus on 「重启应用」', async () => {
      api.restart.mockResolvedValue({ ok: true, data: { outcome: 'confirm_pending' } });
      q('memory-restart').click();
      await settle();
      (document.getElementById('typing') as HTMLInputElement).focus();
      emit('clarityokr:app:restart-result', { outcome: 'cancelled' });
      await settle();
      expect(q('memory-restart').getAttribute('aria-disabled')).toBeNull();
      expect(document.activeElement).toBe(q('memory-restart'));
      expect(q('relaunch-failed')).toBeNull();
    });

    it('restart-result failed (放弃并重启 then relaunch_failed) → ONE alert line, focus on 「重启应用」', async () => {
      api.restart.mockResolvedValue({ ok: true, data: { outcome: 'confirm_pending' } });
      q('memory-restart').click();
      await settle();
      emit('clarityokr:app:restart-result', { outcome: 'failed' });
      await settle();
      expect(all('relaunch-failed')).toHaveLength(1);
      const line = q('relaunch-failed');
      expect(line.getAttribute('role')).toBe('alert');
      expect(line.textContent!.trim()).toBe('重启没有成功，请手动关闭后重新打开应用');
      expect(document.activeElement).toBe(q('memory-restart'));
      expect(q('memory-restart').getAttribute('aria-disabled')).toBeNull();
    });

    it('a malformed restart-result is ignored', async () => {
      api.restart.mockResolvedValue({ ok: true, data: { outcome: 'confirm_pending' } });
      q('memory-restart').click();
      await settle();
      emit('clarityokr:app:restart-result', { outcome: 'boom' });
      emit('clarityokr:app:restart-result', null);
      await settle();
      expect(q('memory-restart').getAttribute('aria-disabled')).toBe('true');
    });

    it('a retry removes the line first and adds it again on a new failure (never two)', async () => {
      let resolve: (value: unknown) => void = () => undefined;
      api.restart.mockResolvedValueOnce({
        ok: true,
        data: { outcome: 'failed', category: 'relaunch_failed' },
      });
      q('memory-restart').click();
      await settle();
      const first = q('relaunch-failed');
      expect(first).not.toBeNull();
      api.restart.mockReturnValueOnce(new Promise((r) => (resolve = r)));
      q('memory-restart').click();
      fixture.detectChanges();
      expect(q('relaunch-failed')).toBeNull();
      resolve({ ok: true, data: { outcome: 'failed', category: 'relaunch_failed' } });
      await settle();
      expect(all('relaunch-failed')).toHaveLength(1);
      expect(q('relaunch-failed')).not.toBe(first);
      expect(document.activeElement).toBe(q('memory-restart'));
    });

    it('an IPC failure is shown the same way', async () => {
      api.restart.mockResolvedValue({ ok: false, error: { code: 'INTERNAL', message: 'x' } });
      q('memory-restart').click();
      await settle();
      expect(all('relaunch-failed')).toHaveLength(1);
    });
  });

  it('the sticky window shows only the memory bar', async () => {
    await create('memory', true, 'sticky');
    expect(q('memory-bar')).not.toBeNull();
    expect(q('legacy-notice')).toBeNull();
    expect(api.getLegacyNotice).not.toHaveBeenCalled();
  });

  it('the sticky window never shows the fresh-file notice', async () => {
    await create('fresh-file', false, 'sticky');
    expect(q('fresh-notice')).toBeNull();
  });

  describe('fresh-file notice (§7a.2)', () => {
    beforeEach(async () => create('fresh-file'));

    it('is role=status with the copy, does not take the focus and is not bound to Esc', () => {
      const notice = q('fresh-notice');
      expect(notice.getAttribute('role')).toBe('status');
      expect(notice.textContent).toContain('旧数据没有载入');
      expect(notice.textContent).toContain('之后的内容会保存在新文件里。');
      expect(notice.textContent).toContain('需要的话可以重新创建 OKR。');
      expect(notice.textContent).not.toContain('备份');
      expect(document.activeElement).not.toBe(q('fresh-ack'));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(q('fresh-notice')).not.toBeNull();
    });

    it('「知道了」 hides it for this run (no IPC)', () => {
      q('fresh-ack').click();
      fixture.detectChanges();
      expect(q('fresh-notice')).toBeNull();
      expect(api.ackLegacyNotice).not.toHaveBeenCalled();
    });
  });

  describe('legacy notice (§7)', () => {
    beforeEach(async () => create('normal', true));

    it('is a region named by its title, described by the lead, with only 「知道了」; it takes the focus once', () => {
      const notice = q('legacy-notice');
      expect(notice.getAttribute('role')).toBe('region');
      expect(document.getElementById(notice.getAttribute('aria-labelledby')!)!.textContent).toBe(
        '已升级到新的数据格式',
      );
      expect(document.getElementById(notice.getAttribute('aria-describedby')!)!.textContent).toBe(
        '旧数据已保留，不会自动导入。',
      );
      expect(notice.querySelectorAll('button')).toHaveLength(1);
      expect(notice.textContent).not.toContain('备份');
      expect(document.activeElement).toBe(q('legacy-ack'));
      expect(q('notice-live').textContent).toContain('已升级到新的数据格式');
    });

    it('「知道了」 acks; then it is gone, the main heading has the focus and 「已确认。」 is spoken', async () => {
      q('legacy-ack').click();
      await settle();
      expect(api.ackLegacyNotice).toHaveBeenCalledTimes(1);
      expect(q('legacy-notice')).toBeNull();
      expect(document.activeElement?.id).toBe('main-heading');
      expect(q('notice-live').textContent).toBe('已确认。');
    });

    it('while the ack runs the button is busy and more clicks do nothing', async () => {
      let resolve: (v: boolean) => void = () => undefined;
      api.ackLegacyNotice.mockReturnValueOnce(new Promise((r) => (resolve = r)));
      q('legacy-ack').click();
      fixture.detectChanges();
      expect(q('legacy-ack').getAttribute('aria-busy')).toBe('true');
      q('legacy-ack').click();
      expect(api.ackLegacyNotice).toHaveBeenCalledTimes(1);
      resolve(true);
      await settle();
      expect(q('legacy-notice')).toBeNull();
    });

    it('a failed ack keeps it with ONE alert line; clicking again retries; success removes both', async () => {
      api.ackLegacyNotice.mockResolvedValueOnce(false).mockResolvedValueOnce(false);
      q('legacy-ack').click();
      await settle();
      expect(q('legacy-notice')).not.toBeNull();
      expect(all('legacy-ack-failed')).toHaveLength(1);
      expect(q('legacy-ack-failed').getAttribute('role')).toBe('alert');
      expect(q('legacy-ack-failed').textContent).toContain('没有保存成功，请再点一次「知道了」。');
      q('legacy-ack').click();
      await settle();
      expect(all('legacy-ack-failed')).toHaveLength(1);
      q('legacy-ack').click();
      await settle();
      expect(api.ackLegacyNotice).toHaveBeenCalledTimes(3);
      expect(q('legacy-notice')).toBeNull();
      expect(q('legacy-ack-failed')).toBeNull();
    });

    it('Esc = 「知道了」 (also from a text field)', async () => {
      (root().querySelector('#typing') as HTMLElement).focus();
      root()
        .querySelector('#typing')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle();
      expect(api.ackLegacyNotice).toHaveBeenCalledTimes(1);
      expect(q('legacy-notice')).toBeNull();
    });

    it('Esc with a failed ack keeps it too', async () => {
      api.ackLegacyNotice.mockResolvedValueOnce(false);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await settle();
      expect(q('legacy-notice')).not.toBeNull();
      expect(all('legacy-ack-failed')).toHaveLength(1);
    });

    it('Esc while another popup (menu / dialog) is open does not ack', async () => {
      const menu = document.createElement('div');
      menu.setAttribute('role', 'menu');
      document.body.appendChild(menu);
      try {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await settle();
        expect(api.ackLegacyNotice).not.toHaveBeenCalled();
      } finally {
        menu.remove();
      }
    });

    it('showing the window again asks again but never doubles the notice', async () => {
      window.dispatchEvent(new Event('focus'));
      await settle();
      expect(all('legacy-notice')).toHaveLength(1);
    });
  });

  it('order top to bottom: memory bar, fresh-file notice, legacy notice', async () => {
    await create('memory', true);
    const ids = Array.from(
      root().querySelectorAll('[data-testid$="-bar"], [data-testid$="-notice"]'),
    ).map((e) => e.getAttribute('data-testid'));
    expect(ids[0]).toBe('memory-bar');
    expect(ids).toContain('legacy-notice');
  });
});
