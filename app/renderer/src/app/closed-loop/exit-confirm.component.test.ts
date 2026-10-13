import { Component } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import {
  readConfirmExitEvent,
  type ConfirmExitEvent,
  type ExitConfirmation,
} from '@clarityokr/contracts';

import { ClosedLoopApi } from './closed-loop-api.service';
import { ExitConfirmComponent } from './exit-confirm.component';

@Component({
  standalone: true,
  imports: [ExitConfirmComponent],
  template: `
    <main id="behind">
      <input id="typing" />
      <button type="button" data-testid="memory-export">导出当前 OKR</button>
    </main>
    <clarityokr-exit-confirm />
  `,
})
class Host {}

const confirmation = (
  reasons: ExitConfirmation['reasons'],
  memoryOnly = false,
): ExitConfirmation => ({
  needsConfirm: true,
  reasons,
  memoryOnly,
  dialogWindow: 'main',
  windowsToShow: ['main'],
});

describe('ExitConfirmComponent (spec §1.2c quit / §7a.4 restart dialog)', () => {
  let fixture: ComponentFixture<Host>;
  let api: Record<string, jest.Mock>;
  let listener: (payload: unknown) => void = () => undefined;
  /** What the main process answers to exit-pending. */
  let mainPending: ConfirmExitEvent | null = null;
  /** A confirm-exit event; the main process then also reports it as pending. */
  const pushEvent = (payload: unknown): void => {
    mainPending = readConfirmExitEvent(payload);
    listener(payload);
  };
  const q = <T extends HTMLElement = HTMLElement>(id: string): T =>
    document.querySelector(`[data-testid="${id}"]`) as T;
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
    }
  };

  async function create(pending: ConfirmExitEvent | null = null): Promise<void> {
    mainPending = pending;
    api = {
      onPayload: jest.fn((channel: string, l: (payload: unknown) => void) => {
        if (channel === 'clarityokr:app:confirm-exit') listener = l;
        return () => undefined;
      }),
      exitPending: jest.fn(async () => ({ ok: true, data: { pending: mainPending } })),
      exitAnswer: jest.fn().mockResolvedValue({ ok: true, data: { accepted: true } }),
    };
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [{ provide: ClosedLoopApi, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await settle();
  }

  afterEach(() => fixture?.nativeElement.remove());

  it('quit, one reason: alertdialog with the quit copy, 「继续编辑」 focused, 「放弃并退出」 danger', async () => {
    await create();
    (document.getElementById('typing') as HTMLInputElement).focus();
    pushEvent({ requestId: 1, kind: 'quit', confirmation: confirmation(['review_draft']) });
    await settle();
    const dialog = q('quit-dialog');
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('退出 ClarityOKR？');
    expect(dialog.textContent).toContain('复盘里写的内容还没有保存，退出会丢掉这些内容。');
    expect(document.activeElement?.textContent?.trim()).toBe('继续编辑');
    expect(q('dialog-confirm').textContent!.trim()).toBe('放弃并退出');
    expect(q('dialog-confirm').className).toContain('danger');
    expect(document.getElementById('behind')!.hasAttribute('inert')).toBe(true);
  });

  it('quit, several reasons: one line each in the fixed order', async () => {
    await create();
    pushEvent({
      requestId: 1,
      kind: 'quit',
      confirmation: confirmation(['memory_data', 'text_edit', 'wizard', 'review_draft']),
    });
    await settle();
    expect(document.querySelector('.dialog__body')!.textContent).toBe(
      [
        '向导里已经填写的内容还没有保存，退出会丢掉这些内容。',
        '你对关键结果文字的修改还没有提交，退出会丢掉这些修改。',
        '复盘里写的内容还没有保存，退出会丢掉这些内容。',
        '本次运行的内容没有保存到文件，退出后会全部丢失。',
      ].join('\n'),
    );
  });

  it('Esc = 「继续编辑」: answers confirmed:false and gives the focus back', async () => {
    await create();
    const input = document.getElementById('typing') as HTMLInputElement;
    input.focus();
    pushEvent({ requestId: 1, kind: 'quit', confirmation: confirmation(['text_edit']) });
    await settle();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await settle();
    expect(q('quit-dialog')).toBeNull();
    expect(api.exitAnswer).toHaveBeenCalledWith({ requestId: 1, kind: 'quit', confirmed: false });
    expect(document.activeElement).toBe(input);
  });

  it('「放弃并退出」 answers confirmed:true', async () => {
    await create();
    pushEvent({ requestId: 1, kind: 'quit', confirmation: confirmation(['wizard']) });
    await settle();
    q('dialog-confirm').click();
    await settle();
    expect(api.exitAnswer).toHaveBeenCalledWith({ requestId: 1, kind: 'quit', confirmed: true });
    expect(q('quit-dialog')).toBeNull();
  });

  it('memory only: 「先不退出」; focus was outside the window → lands on 「导出当前 OKR」', async () => {
    await create();
    (document.activeElement as HTMLElement | null)?.blur();
    pushEvent({ requestId: 1, kind: 'quit', confirmation: confirmation(['memory_data'], true) });
    await settle();
    expect(document.querySelector('.dialog__body')!.textContent).toBe(
      '本次运行的内容没有保存到文件，退出后会全部丢失。',
    );
    expect(q('dialog-cancel').textContent!.trim()).toBe('先不退出');
    q('dialog-cancel').click();
    await settle();
    expect(document.activeElement).toBe(q('memory-export'));
  });

  it('restart version: title, memory sentence, 「先不重启」 / 「放弃并重启」, answer kind restart', async () => {
    await create();
    pushEvent({ requestId: 1, kind: 'restart', confirmation: confirmation(['memory_data'], true) });
    await settle();
    const dialog = q('restart-dialog');
    expect(dialog.textContent).toContain('重启 ClarityOKR？');
    expect(dialog.textContent).toContain('重启后本次运行的内容会丢失。');
    expect(q('dialog-cancel').textContent!.trim()).toBe('先不重启');
    expect(q('dialog-confirm').textContent!.trim()).toBe('放弃并重启');
    q('dialog-confirm').click();
    await settle();
    expect(api.exitAnswer).toHaveBeenCalledWith({ requestId: 1, kind: 'restart', confirmed: true });
  });

  it('restart with an unsaved draft too: safe button 「继续编辑」', async () => {
    await create();
    pushEvent({
      requestId: 1,
      kind: 'restart',
      confirmation: confirmation(['wizard', 'memory_data']),
    });
    await settle();
    expect(q('dialog-cancel').textContent!.trim()).toBe('继续编辑');
  });

  it('a window that loads while a dialog is pending shows it (exit-pending)', async () => {
    await create({ requestId: 1, kind: 'quit', confirmation: confirmation(['wizard']) });
    expect(api.exitPending).toHaveBeenCalledTimes(1);
    expect(q('quit-dialog')).not.toBeNull();
  });

  it.each([
    [null],
    ['quit'],
    [{ kind: 'exit', confirmation: confirmation(['wizard']) }],
    [
      {
        requestId: 1,
        kind: 'quit',
        confirmation: { ...confirmation(['wizard']), reasons: ['boom'] },
      },
    ],
    [
      {
        requestId: 1,
        kind: 'quit',
        confirmation: { ...confirmation(['wizard']), dialogWindow: 'x' },
      },
    ],
  ])('a malformed event %j opens nothing', async (payload) => {
    await create();
    pushEvent(payload);
    await settle();
    expect(q('quit-dialog')).toBeNull();
    expect(q('restart-dialog')).toBeNull();
  });

  it.each([
    [
      'ok:false',
      () => Promise.resolve({ ok: false, error: { code: 'INVALID_REQUEST', message: 'x' } }),
    ],
    [
      'a rejected call',
      async () => {
        throw new Error('gone');
      },
    ],
    ['ok without accepted', () => Promise.resolve({ ok: true, data: {} })],
  ])(
    '%s keeps the dialog open with ONE inline alert; a retry that works closes it',
    async (_n, fail) => {
      await create();
      pushEvent({ requestId: 1, kind: 'quit', confirmation: confirmation(['wizard']) });
      await settle();
      api.exitAnswer.mockImplementationOnce(fail);
      q('dialog-confirm').click();
      await settle();
      expect(q('quit-dialog')).not.toBeNull();
      expect(document.querySelectorAll('[data-testid="dialog-error"]')).toHaveLength(1);
      expect(q('dialog-error').getAttribute('role')).toBe('alert');
      expect(q('dialog-error').textContent!.trim()).toBe('⚠ 没能完成这次操作，请再试一次。');
      // above the buttons, buttons enabled again, focus back on the clicked one
      expect(
        q('dialog-error').compareDocumentPosition(q('dialog-cancel')) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(q('dialog-confirm').getAttribute('aria-disabled')).toBeNull();
      expect(document.activeElement).toBe(q('dialog-confirm'));
      q('dialog-confirm').click();
      await settle();
      expect(api.exitAnswer).toHaveBeenCalledTimes(2);
      expect(q('quit-dialog')).toBeNull();
    },
  );

  it('while waiting: both buttons aria-disabled, clicks and Esc do nothing; then the failure', async () => {
    await create();
    pushEvent({ requestId: 1, kind: 'restart', confirmation: confirmation(['memory_data'], true) });
    await settle();
    let resolve: (v: unknown) => void = () => undefined;
    api.exitAnswer.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    q('dialog-cancel').click();
    await settle();
    expect(q('restart-dialog')).not.toBeNull(); // still open while the answer is in flight
    expect(q('restart-dialog').getAttribute('aria-busy')).toBe('true');
    expect(q('dialog-cancel').getAttribute('aria-disabled')).toBe('true');
    expect(q('dialog-confirm').getAttribute('aria-disabled')).toBe('true');
    q('dialog-cancel').click();
    q('dialog-confirm').click();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await settle();
    expect(api.exitAnswer).toHaveBeenCalledTimes(1);
    expect(q('restart-dialog')).not.toBeNull();
    resolve({ ok: false, error: { code: 'INTERNAL', message: 'x' } });
    await settle();
    expect(q('restart-dialog')).not.toBeNull();
    expect(q('dialog-error')).not.toBeNull();
    expect(document.activeElement).toBe(q('dialog-cancel'));
  });

  it('no reply within 5 s counts as a failure (timeout)', async () => {
    await create();
    pushEvent({ requestId: 1, kind: 'quit', confirmation: confirmation(['wizard']) });
    await settle();
    jest.useFakeTimers();
    try {
      api.exitAnswer.mockReturnValueOnce(new Promise(() => undefined));
      q('dialog-confirm').click();
      fixture.detectChanges();
      jest.advanceTimersByTime(4999);
      for (let i = 0; i < 5; i++) await Promise.resolve();
      fixture.detectChanges();
      expect(q('dialog-error')).toBeNull();
      expect(q('dialog-confirm').getAttribute('aria-disabled')).toBe('true');
      jest.advanceTimersByTime(1);
      for (let i = 0; i < 5; i++) await Promise.resolve();
      fixture.detectChanges();
      jest.runOnlyPendingTimers();
      fixture.detectChanges();
      expect(q('quit-dialog')).not.toBeNull();
      expect(q('dialog-error')).not.toBeNull();
      expect(q('dialog-confirm').getAttribute('aria-disabled')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('each new quit / restart re-queries exit-pending; the main process wins over the payload', async () => {
    await create();
    expect(api.exitPending).toHaveBeenCalledTimes(1); // on load
    mainPending = { requestId: 1, kind: 'quit', confirmation: confirmation(['review_draft']) };
    listener({ requestId: 1, kind: 'quit', confirmation: confirmation(['wizard']) });
    await settle();
    expect(api.exitPending).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.dialog__body')!.textContent).toBe(
      '复盘里写的内容还没有保存，退出会丢掉这些内容。',
    );
    q('dialog-cancel').click();
    await settle();
    pushEvent({ requestId: 1, kind: 'restart', confirmation: confirmation(['memory_data'], true) });
    await settle();
    expect(api.exitPending).toHaveBeenCalledTimes(3);
    expect(q('restart-dialog')).not.toBeNull();
  });

  it('if the re-query fails, the event payload is used', async () => {
    await create();
    api.exitPending.mockResolvedValueOnce({ ok: false, error: { code: 'INTERNAL', message: 'x' } });
    listener({ requestId: 1, kind: 'quit', confirmation: confirmation(['wizard']) });
    await settle();
    expect(q('quit-dialog')).not.toBeNull();
  });

  it('N17: a failed answer whose dialog is no longer pending in main closes quietly', async () => {
    await create();
    pushEvent({ requestId: 1, kind: 'quit', confirmation: confirmation(['wizard']) });
    await settle();
    api.exitAnswer.mockResolvedValueOnce({ ok: false, error: { code: 'INTERNAL', message: 'x' } });
    mainPending = null; // main handled it after all
    q('dialog-confirm').click();
    await settle();
    expect(q('quit-dialog')).toBeNull();
    expect(q('dialog-error')).toBeNull();
  });

  it('N17: a failed answer while main shows another dialog switches to that one', async () => {
    await create();
    pushEvent({ requestId: 1, kind: 'quit', confirmation: confirmation(['wizard']) });
    await settle();
    api.exitAnswer.mockResolvedValueOnce({ ok: false, error: { code: 'INTERNAL', message: 'x' } });
    mainPending = {
      requestId: 2,
      kind: 'restart',
      confirmation: confirmation(['memory_data'], true),
    };
    q('dialog-cancel').click();
    await settle();
    expect(q('quit-dialog')).toBeNull();
    expect(q('restart-dialog')).not.toBeNull();
    expect(q('dialog-error')).toBeNull();
  });

  it('N17: a reply after the 5 s timeout: error first, the late reply changes nothing, the retry closes quietly', async () => {
    await create();
    pushEvent({ requestId: 1, kind: 'quit', confirmation: confirmation(['wizard']) });
    await settle();
    let late: (v: unknown) => void = () => undefined;
    api.exitAnswer.mockReturnValueOnce(new Promise((r) => (late = r)));
    jest.useFakeTimers();
    try {
      q('dialog-confirm').click();
      fixture.detectChanges();
      jest.advanceTimersByTime(5000);
      for (let i = 0; i < 8; i++) await Promise.resolve();
      fixture.detectChanges();
      jest.runOnlyPendingTimers();
      fixture.detectChanges();
    } finally {
      jest.useRealTimers();
    }
    await settle();
    // main still had it pending at the re-query: the failure line shows
    expect(q('dialog-error')).not.toBeNull();
    // the late reply arrives (main took the answer): the UI does not act on it by itself
    mainPending = null;
    late({ ok: true, data: { accepted: true } });
    await settle();
    expect(q('quit-dialog')).not.toBeNull();
    expect(api.exitAnswer).toHaveBeenCalledTimes(1);
    // retrying: main refuses (no such dialog) → re-query says not pending → closes, no error
    api.exitAnswer.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'x' },
    });
    q('dialog-confirm').click();
    await settle();
    expect(api.exitAnswer).toHaveBeenLastCalledWith({
      requestId: 1,
      kind: 'quit',
      confirmed: true,
    });
    expect(q('quit-dialog')).toBeNull();
    expect(q('dialog-error')).toBeNull();
  });
});
