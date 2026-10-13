import { jest } from '@jest/globals';
import { IPC_CHANNELS, isAllowedChannel, type IpcResult } from '@clarityokr/contracts';
import {
  registerAppWindowHandlers,
  UnsavedRegistry,
} from '../../../../app/main/src/ipc/app-window-handlers.js';
import { AppRestartService } from '../../../../app/main/src/lifecycle/restart-service.js';
import {
  ExitCoordinator,
  type ExitWindow,
} from '../../../../app/main/src/lifecycle/exit-coordinator.js';

type Handler = (event: unknown, payload?: unknown) => unknown;

class FakeSender {
  private destroyed: (() => void) | null = null;
  constructor(readonly id: number) {}
  once(_event: 'destroyed', listener: () => void): void {
    this.destroyed = listener;
  }
  destroy(): void {
    this.destroyed?.();
  }
}

class FakeIpcMain {
  readonly handlers = new Map<string, Handler>();
  handle(channel: string, handler: Handler): void {
    if (this.handlers.has(channel)) throw new Error(`duplicate handler: ${channel}`);
    this.handlers.set(channel, handler);
  }
  async invoke<T>(channel: string, payload?: unknown, sender = new FakeSender(1)) {
    const handler = this.handlers.get(channel);
    if (!handler) throw new Error(`no handler: ${channel}`);
    return (await handler({ sender }, payload)) as IpcResult<T>;
  }
}

class FakeWindow implements ExitWindow {
  readonly sent: Array<[string, unknown]> = [];
  focused = 0;
  destroyed = false;
  constructor(readonly id: number) {}
  send(channel: string, payload: unknown): void {
    this.sent.push([channel, payload]);
  }
  isDestroyed(): boolean {
    return this.destroyed;
  }
  focus(): void {
    this.focused += 1;
  }
}

const MAIN = 1;
const STICKY = 2;

interface SetupOptions {
  showMainWindow?: jest.Mock<() => Promise<{ send(channel: string): void } | null>>;
  storageMode?: 'normal' | 'memory';
  dbHasData?: boolean;
}

function setup(options: SetupOptions = {}) {
  const showMainWindow = options.showMainWindow ?? jest.fn(async () => ({ send: jest.fn() }));
  const ipc = new FakeIpcMain();
  const unsaved = new UnsavedRegistry();
  const windows = new Map<number, FakeWindow>([
    [MAIN, new FakeWindow(MAIN)],
    [STICKY, new FakeWindow(STICKY)],
  ]);
  const quit = jest.fn();
  const relaunch = jest.fn();
  const restartService = new AppRestartService({
    getStorageMode: () => options.storageMode ?? 'normal',
    dbHasData: () => options.dbHasData ?? false,
  });
  const exit = new ExitCoordinator({
    evaluate: (flags) => restartService.evaluate(flags),
    reportedUnsaved: () => unsaved.aggregate(),
    showWindow: async (which) => windows.get(which === 'main' ? MAIN : STICKY) ?? null,
    quit,
    relaunch,
  });
  let alwaysOnTop = true;
  /** N15: as main.ts composes it: no tray + last visible window → 「隐藏」 asks to quit. */
  let hideQuitsNow = false;
  const sticky = {
    isSticky: (id: number) => id === STICKY,
    hide: jest.fn((): boolean => {
      if (hideQuitsNow) {
        void exit.requestQuit();
        return false;
      }
      return true;
    }),
    hideQuits: () => hideQuitsNow,
    isAlwaysOnTop: () => alwaysOnTop,
    setAlwaysOnTop: jest.fn((enabled: boolean) => {
      alwaysOnTop = enabled;
    }),
  };
  registerAppWindowHandlers(ipc, {
    unsaved,
    showMainWindow,
    exit,
    windowOf: (id) => windows.get(id) ?? null,
    sticky,
  });
  return {
    ipc,
    unsaved,
    showMainWindow,
    exit,
    quit,
    relaunch,
    sticky,
    setHideQuits: (value: boolean) => {
      hideQuitsNow = value;
    },
    main: windows.get(MAIN)!,
    stickyWindow: windows.get(STICKY)!,
  };
}

describe('clarityokr:window:open-wizard', () => {
  it('shows the main window and sends wizard:new-okr to it', async () => {
    const send = jest.fn();
    const { ipc, showMainWindow } = setup({ showMainWindow: jest.fn(async () => ({ send })) });
    expect(await ipc.invoke(IPC_CHANNELS.WINDOW_OPEN_WIZARD)).toEqual({
      ok: true,
      data: { opened: true },
    });
    expect(showMainWindow).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.WIZARD_NEW_OKR);
  });

  it('a freshly created main window gets no event (its wizard is already empty)', async () => {
    const { ipc } = setup({ showMainWindow: jest.fn(async () => null) });
    expect(await ipc.invoke(IPC_CHANNELS.WINDOW_OPEN_WIZARD, {})).toEqual({
      ok: true,
      data: { opened: true },
    });
  });

  it.each([[{ x: 1 }], ['str'], [[1]], [3]])('rejects payload %p', async (payload) => {
    const { ipc, showMainWindow } = setup();
    const r = await ipc.invoke(IPC_CHANNELS.WINDOW_OPEN_WIZARD, payload);
    expect(r).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(showMainWindow).not.toHaveBeenCalled();
  });

  it('a failure is reported as INTERNAL without the raw message', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ipc } = setup({
      showMainWindow: jest.fn(async () => {
        throw new Error('secret /home/x');
      }),
    });
    const r = await ipc.invoke(IPC_CHANNELS.WINDOW_OPEN_WIZARD);
    expect(r).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
    expect(JSON.stringify(r)).not.toContain('/home/x');
    spy.mockRestore();
  });
});

describe('clarityokr:app:report-unsaved', () => {
  it('merges partial reports per window and ORs windows together', async () => {
    const { ipc, unsaved } = setup();
    const main = new FakeSender(1);
    const sticky = new FakeSender(2);
    await ipc.invoke(IPC_CHANNELS.APP_REPORT_UNSAVED, { wizard: true }, main);
    await ipc.invoke(IPC_CHANNELS.APP_REPORT_UNSAVED, { textEdit: true }, sticky);
    await ipc.invoke(IPC_CHANNELS.APP_REPORT_UNSAVED, { reviewDraft: false }, sticky);
    expect(unsaved.aggregate()).toEqual({ wizard: true, textEdit: true, reviewDraft: false });
    await ipc.invoke(IPC_CHANNELS.APP_REPORT_UNSAVED, { wizard: false }, main);
    expect(unsaved.aggregate()).toEqual({ wizard: false, textEdit: true, reviewDraft: false });
  });

  it('forgets a window when it is destroyed', async () => {
    const { ipc, unsaved } = setup();
    const sticky = new FakeSender(2);
    await ipc.invoke(IPC_CHANNELS.APP_REPORT_UNSAVED, { reviewDraft: true }, sticky);
    sticky.destroy();
    expect(unsaved.aggregate()).toEqual({ wizard: false, textEdit: false, reviewDraft: false });
  });

  it.each([
    [undefined, 'payload'],
    [{}, 'payload'],
    [{ wizard: 'yes' }, 'wizard'],
    [{ other: true }, 'other'],
    [[true], 'payload'],
  ])('rejects %p (field %s)', async (payload, field) => {
    const { ipc, unsaved } = setup();
    const r = await ipc.invoke(IPC_CHANNELS.APP_REPORT_UNSAVED, payload);
    expect(r).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST', field } });
    expect(unsaved.aggregate()).toEqual({ wizard: false, textEdit: false, reviewDraft: false });
  });
});

const NONE = { wizard: false, textEdit: false, reviewDraft: false };
const CONFIRM = IPC_CHANNELS.APP_CONFIRM_EXIT;
const RESULT = IPC_CHANNELS.APP_RESTART_RESULT;

describe('clarityokr:app:restart (D2: dialog in the main window, combined decision)', () => {
  it('N10: only ANOTHER window reported unsaved → the sticky restart still asks (in the main window)', async () => {
    const h = setup();
    await h.ipc.invoke(IPC_CHANNELS.APP_REPORT_UNSAVED, { wizard: true }, new FakeSender(MAIN));
    const r = await h.ipc.invoke(
      IPC_CHANNELS.APP_RESTART,
      { unsaved: NONE },
      new FakeSender(STICKY),
    );
    expect(r).toEqual({ ok: true, data: { outcome: 'confirm_pending' } });
    expect(h.relaunch).not.toHaveBeenCalled();
    expect(h.main.sent).toEqual([
      [
        CONFIRM,
        expect.objectContaining({
          kind: 'restart',
          confirmation: expect.objectContaining({ reasons: ['wizard'] }),
        }),
      ],
    ]);
    expect(h.stickyWindow.sent).toEqual([]);
    // 先不重启 → the sticky window hears it; the main window clears its wizard flag; now direct.
    await h.ipc.invoke(
      IPC_CHANNELS.APP_EXIT_ANSWER,
      { requestId: 1, kind: 'restart', confirmed: false },
      new FakeSender(MAIN),
    );
    expect(h.stickyWindow.sent).toEqual([[RESULT, { outcome: 'cancelled' }]]);
    await h.ipc.invoke(IPC_CHANNELS.APP_REPORT_UNSAVED, { wizard: false }, new FakeSender(MAIN));
    expect(
      await h.ipc.invoke(IPC_CHANNELS.APP_RESTART, { unsaved: NONE }, new FakeSender(STICKY)),
    ).toEqual({
      ok: true,
      data: { outcome: 'restarting' },
    });
    expect(h.relaunch).toHaveBeenCalledTimes(1);
  });

  it("N10: the asking window's own flags count too (nothing reported elsewhere)", async () => {
    const h = setup();
    const r = await h.ipc.invoke(
      IPC_CHANNELS.APP_RESTART,
      { unsaved: { ...NONE, textEdit: true } },
      new FakeSender(STICKY),
    );
    expect(r).toEqual({ ok: true, data: { outcome: 'confirm_pending' } });
    expect(h.main.sent[0]![1]).toMatchObject({ confirmation: { reasons: ['text_edit'] } });
  });

  it('N10: two windows click restart at almost the same time → one dialog, one answer, both told', async () => {
    const h = setup({ storageMode: 'memory', dbHasData: true });
    const [a, b] = await Promise.all([
      h.ipc.invoke(IPC_CHANNELS.APP_RESTART, { unsaved: NONE }, new FakeSender(STICKY)),
      h.ipc.invoke(IPC_CHANNELS.APP_RESTART, { unsaved: NONE }, new FakeSender(MAIN)),
    ]);
    expect(a).toEqual({ ok: true, data: { outcome: 'confirm_pending' } });
    expect(b).toEqual({ ok: true, data: { outcome: 'confirm_pending' } });
    expect(h.main.sent.filter(([c]) => c === CONFIRM)).toHaveLength(1);
    expect(
      await h.ipc.invoke(
        IPC_CHANNELS.APP_EXIT_ANSWER,
        { requestId: 1, kind: 'restart', confirmed: true },
        new FakeSender(MAIN),
      ),
    ).toEqual({ ok: true, data: { accepted: true } });
    expect(h.relaunch).toHaveBeenCalledTimes(1);
    // A late second answer is refused and relaunches nothing.
    expect(
      await h.ipc.invoke(
        IPC_CHANNELS.APP_EXIT_ANSWER,
        { requestId: 1, kind: 'restart', confirmed: true },
        new FakeSender(MAIN),
      ),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(h.relaunch).toHaveBeenCalledTimes(1);
  });

  it('N10: two direct restarts (nothing to lose) at once relaunch exactly once', async () => {
    const h = setup();
    const replies = await Promise.all([
      h.ipc.invoke(IPC_CHANNELS.APP_RESTART, { unsaved: NONE }, new FakeSender(STICKY)),
      h.ipc.invoke(IPC_CHANNELS.APP_RESTART, { unsaved: NONE }, new FakeSender(MAIN)),
    ]);
    expect(replies).toEqual([
      { ok: true, data: { outcome: 'restarting' } },
      { ok: true, data: { outcome: 'restarting' } },
    ]);
    expect(h.relaunch).toHaveBeenCalledTimes(1);
  });

  it('relaunch_failed after 放弃并重启 → failed to the asking window, no exception text', async () => {
    const h = setup({ storageMode: 'memory', dbHasData: true });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    h.relaunch.mockImplementationOnce(() => {
      throw new Error('spawn /secret/path');
    });
    await h.ipc.invoke(IPC_CHANNELS.APP_RESTART, { unsaved: NONE }, new FakeSender(STICKY));
    await h.ipc.invoke(
      IPC_CHANNELS.APP_EXIT_ANSWER,
      { requestId: 1, kind: 'restart', confirmed: true },
      new FakeSender(MAIN),
    );
    expect(h.stickyWindow.sent).toEqual([[RESULT, { outcome: 'failed' }]]);
    expect(JSON.stringify(h.stickyWindow.sent)).not.toContain('secret');
    spy.mockRestore();
  });

  it('a direct relaunch failure is the reply', async () => {
    const h = setup();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    h.relaunch.mockImplementationOnce(() => {
      throw new Error('x');
    });
    expect(
      await h.ipc.invoke(IPC_CHANNELS.APP_RESTART, { unsaved: NONE }, new FakeSender(MAIN)),
    ).toEqual({
      ok: true,
      data: { outcome: 'failed', category: 'relaunch_failed' },
    });
    spy.mockRestore();
  });

  it.each([
    [undefined, 'payload', 'wrong_type'],
    [{}, 'unsaved', 'missing'],
    [{ unsaved: 'yes' }, 'unsaved', 'wrong_type'],
    [{ unsaved: { wizard: true, textEdit: false } }, 'unsaved.reviewDraft', 'missing'],
    [{ unsaved: { ...NONE, wizard: 1 } }, 'unsaved.wizard', 'wrong_type'],
    [{ unsaved: { ...NONE, extra: 1 } }, 'unsaved.extra', 'unknown_field'],
    [{ unsaved: NONE, confirmed: true }, 'confirmed', 'unknown_field'],
    [{ unsaved: NONE, force: true }, 'force', 'unknown_field'],
  ])('rejects %j without relaunching', async (payload, field, reason) => {
    const h = setup();
    expect(await h.ipc.invoke(IPC_CHANNELS.APP_RESTART, payload)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST', field, reason },
    });
    expect(h.relaunch).not.toHaveBeenCalled();
  });
});

describe('clarityokr:app:exit-answer / exit-pending (quit confirmation)', () => {
  it('only the window hosting the dialog may answer', async () => {
    const h = setup();
    await h.ipc.invoke(
      IPC_CHANNELS.APP_REPORT_UNSAVED,
      { reviewDraft: true },
      new FakeSender(STICKY),
    );
    expect(await h.exit.requestQuit()).toBe('confirm_pending');
    expect(h.stickyWindow.sent[0]![0]).toBe(CONFIRM);
    expect(
      await h.ipc.invoke(
        IPC_CHANNELS.APP_EXIT_ANSWER,
        { requestId: 1, kind: 'quit', confirmed: true },
        new FakeSender(MAIN),
      ),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(h.quit).not.toHaveBeenCalled();
    expect(
      await h.ipc.invoke(IPC_CHANNELS.APP_EXIT_PENDING, undefined, new FakeSender(STICKY)),
    ).toMatchObject({ ok: true, data: { pending: { requestId: 1, kind: 'quit' } } });
    expect(await h.ipc.invoke(IPC_CHANNELS.APP_EXIT_PENDING, {}, new FakeSender(MAIN))).toEqual({
      ok: true,
      data: { pending: null },
    });
    await h.ipc.invoke(
      IPC_CHANNELS.APP_EXIT_ANSWER,
      { requestId: 1, kind: 'quit', confirmed: true },
      new FakeSender(STICKY),
    );
    expect(h.quit).toHaveBeenCalledTimes(1);
  });

  it('a destroyed host window cancels its dialog', async () => {
    const h = setup();
    const main = new FakeSender(MAIN);
    await h.ipc.invoke(IPC_CHANNELS.APP_REPORT_UNSAVED, { wizard: true }, main);
    await h.exit.requestQuit();
    main.destroy();
    expect(h.exit.pendingFor(MAIN)).toBeNull();
  });

  it.each([
    [undefined, 'payload'],
    [{ requestId: 1, kind: 'quit' }, 'confirmed'],
    [{ requestId: 1, kind: 'close', confirmed: true }, 'kind'],
    [{ kind: 'quit', confirmed: true }, 'requestId'],
    [{ requestId: 1, kind: 'quit', confirmed: 1 }, 'confirmed'],
    [{ requestId: 1, kind: 'quit', confirmed: true, extra: 1 }, 'extra'],
  ])('exit-answer rejects %j', async (payload, field) => {
    const h = setup();
    expect(await h.ipc.invoke(IPC_CHANNELS.APP_EXIT_ANSWER, payload)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST', field },
    });
  });

  it('exit-pending rejects a payload', async () => {
    const h = setup();
    expect(await h.ipc.invoke(IPC_CHANNELS.APP_EXIT_PENDING, { x: 1 })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
  });
});

describe('window:hide / get-state / set-always-on-top (sticky window only)', () => {
  it('hide: only the sticky window, no dialog, the app keeps running', async () => {
    const h = setup();
    expect(await h.ipc.invoke(IPC_CHANNELS.WINDOW_HIDE, undefined, new FakeSender(STICKY))).toEqual(
      {
        ok: true,
        data: { hidden: true },
      },
    );
    expect(h.sticky.hide).toHaveBeenCalledTimes(1);
    expect(h.quit).not.toHaveBeenCalled();
    expect(
      await h.ipc.invoke(IPC_CHANNELS.WINDOW_HIDE, undefined, new FakeSender(MAIN)),
    ).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
    expect(h.sticky.hide).toHaveBeenCalledTimes(1);
  });

  it('N15: without a tray, 「隐藏」 on the last visible window quits (nothing unsaved → at once)', async () => {
    const h = setup();
    h.setHideQuits(true);
    const s = new FakeSender(STICKY);
    expect(await h.ipc.invoke(IPC_CHANNELS.WINDOW_GET_STATE, undefined, s)).toMatchObject({
      data: { hideQuits: true },
    });
    expect(await h.ipc.invoke(IPC_CHANNELS.WINDOW_HIDE, undefined, s)).toEqual({
      ok: true,
      data: { hidden: false },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(h.quit).toHaveBeenCalledTimes(1);
  });

  it('N15: … and with something unsaved it goes to the quit confirmation instead', async () => {
    const h = setup();
    h.setHideQuits(true);
    await h.ipc.invoke(
      IPC_CHANNELS.APP_REPORT_UNSAVED,
      { reviewDraft: true },
      new FakeSender(STICKY),
    );
    await h.ipc.invoke(IPC_CHANNELS.WINDOW_HIDE, undefined, new FakeSender(STICKY));
    await new Promise((r) => setTimeout(r, 0));
    expect(h.quit).not.toHaveBeenCalled();
    expect(h.stickyWindow.sent).toEqual([
      ['clarityokr:app:confirm-exit', expect.objectContaining({ kind: 'quit' })],
    ]);
  });

  it('get-state / set-always-on-top round-trip', async () => {
    const h = setup();
    const s = new FakeSender(STICKY);
    expect(await h.ipc.invoke(IPC_CHANNELS.WINDOW_GET_STATE, undefined, s)).toEqual({
      ok: true,
      data: { alwaysOnTop: true, hideQuits: false },
    });
    expect(
      await h.ipc.invoke(IPC_CHANNELS.WINDOW_SET_ALWAYS_ON_TOP, { enabled: false }, s),
    ).toEqual({
      ok: true,
      data: { alwaysOnTop: false, hideQuits: false },
    });
    expect(h.sticky.setAlwaysOnTop).toHaveBeenCalledWith(false);
  });

  it.each([
    [IPC_CHANNELS.WINDOW_HIDE, { x: 1 }],
    [IPC_CHANNELS.WINDOW_GET_STATE, 'x'],
    [IPC_CHANNELS.WINDOW_SET_ALWAYS_ON_TOP, undefined],
    [IPC_CHANNELS.WINDOW_SET_ALWAYS_ON_TOP, { enabled: 'yes' }],
    [IPC_CHANNELS.WINDOW_SET_ALWAYS_ON_TOP, { enabled: true, level: 'floating' }],
  ])('%s rejects %j', async (channel, payload) => {
    const h = setup();
    expect(await h.ipc.invoke(channel, payload, new FakeSender(STICKY))).toMatchObject({
      ok: false,
      error: { code: 'INVALID_REQUEST' },
    });
    expect(h.sticky.setAlwaysOnTop).not.toHaveBeenCalled();
    expect(h.sticky.hide).not.toHaveBeenCalled();
  });

  it('get-state / set-always-on-top refuse the main window', async () => {
    const h = setup();
    for (const [channel, payload] of [
      [IPC_CHANNELS.WINDOW_GET_STATE, undefined],
      [IPC_CHANNELS.WINDOW_SET_ALWAYS_ON_TOP, { enabled: false }],
    ] as const) {
      expect(await h.ipc.invoke(channel, payload, new FakeSender(MAIN))).toMatchObject({
        ok: false,
      });
    }
    expect(h.sticky.setAlwaysOnTop).not.toHaveBeenCalled();
  });

  it('every new channel is in the preload whitelist', () => {
    for (const channel of [
      IPC_CHANNELS.APP_CONFIRM_EXIT,
      IPC_CHANNELS.APP_EXIT_ANSWER,
      IPC_CHANNELS.APP_EXIT_PENDING,
      IPC_CHANNELS.APP_RESTART_RESULT,
      IPC_CHANNELS.WINDOW_HIDE,
      IPC_CHANNELS.WINDOW_GET_STATE,
      IPC_CHANNELS.WINDOW_SET_ALWAYS_ON_TOP,
    ]) {
      expect(isAllowedChannel(channel)).toBe(true);
    }
  });
});
