import { jest } from '@jest/globals';
import BetterSqlite3 from 'better-sqlite3';
import { IPC_CHANNELS, type IpcResult } from '@clarityokr/contracts';
import {
  registerAppWindowHandlers,
  UnsavedRegistry,
} from '../../../../app/main/src/ipc/app-window-handlers.js';
import { registerClosedLoopHandlers } from '../../../../app/main/src/ipc/closed-loop-handlers.js';
import { ExportService } from '../../../../app/main/src/export/export-service.js';
import { AppRestartService } from '../../../../app/main/src/lifecycle/restart-service.js';
import { OkrStore, applySchema } from '../../../../app/main/src/persistence/okr-store/index.js';

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

function setup(showMainWindow = jest.fn(async () => ({ send: jest.fn() }))) {
  const ipc = new FakeIpcMain();
  const unsaved = new UnsavedRegistry();
  registerAppWindowHandlers(ipc, { unsaved, showMainWindow });
  return { ipc, unsaved, showMainWindow };
}

describe('clarityokr:window:open-wizard', () => {
  it('shows the main window and sends wizard:new-okr to it', async () => {
    const send = jest.fn();
    const { ipc, showMainWindow } = setup(jest.fn(async () => ({ send })));
    expect(await ipc.invoke(IPC_CHANNELS.WINDOW_OPEN_WIZARD)).toEqual({
      ok: true,
      data: { opened: true },
    });
    expect(showMainWindow).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.WIZARD_NEW_OKR);
  });

  it('a freshly created main window gets no event (its wizard is already empty)', async () => {
    const { ipc } = setup(jest.fn(async () => null));
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
    const { ipc } = setup(
      jest.fn(async () => {
        throw new Error('secret /home/x');
      }),
    );
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

describe('app:restart ORs the reported flags with the request', () => {
  it('a wizard draft reported by the main window makes a sticky restart ask first', async () => {
    const db = new BetterSqlite3(':memory:');
    applySchema(db);
    const store = new OkrStore(db);
    const relaunch = jest.fn();
    const ipc = new FakeIpcMain();
    const unsaved = new UnsavedRegistry();
    registerAppWindowHandlers(ipc, { unsaved, showMainWindow: async () => null });
    registerClosedLoopHandlers(ipc, {
      store,
      exportService: new ExportService({
        loadSource: () => null,
        showSaveDialog: jest.fn(async () => null),
        showItemInFolder: jest.fn(),
        getDownloadsDir: () => '/tmp',
      }),
      restartService: new AppRestartService({
        getStorageMode: () => 'normal',
        dbHasData: () => false,
        relaunch,
      }),
      clipboard: { writeText: jest.fn() },
      reportedUnsaved: () => unsaved.aggregate(),
    });
    const none = { wizard: false, textEdit: false, reviewDraft: false };
    await ipc.invoke(IPC_CHANNELS.APP_REPORT_UNSAVED, { wizard: true }, new FakeSender(1));
    const r = await ipc.invoke(IPC_CHANNELS.APP_RESTART, { unsaved: none }, new FakeSender(2));
    expect(r).toMatchObject({
      ok: true,
      data: { outcome: 'confirm_required', confirmation: { reasons: ['wizard'] } },
    });
    expect(relaunch).not.toHaveBeenCalled();
    await ipc.invoke(IPC_CHANNELS.APP_REPORT_UNSAVED, { wizard: false }, new FakeSender(1));
    expect(await ipc.invoke(IPC_CHANNELS.APP_RESTART, { unsaved: none })).toEqual({
      ok: true,
      data: { outcome: 'restarting' },
    });
    db.close();
  });
});
