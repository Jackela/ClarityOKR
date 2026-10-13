import { decideExitConfirmation, type UnsavedFlags } from '@clarityokr/contracts';
import { ExitCoordinator, type ExitWindow } from '@clarityokr/main/lifecycle/exit-coordinator';
import {
  QuitGate,
  guardBeforeQuit,
  hideOnClose,
  type HideableWindow,
} from '@clarityokr/main/lifecycle/quit-gate';

/** No mocks here: plain objects and the real decision, coordinator and gate (B1 / B2). */

class PlainWindow implements ExitWindow {
  readonly sent: Array<[string, unknown]> = [];
  constructor(readonly id: number) {}
  send(channel: string, payload: unknown): void {
    this.sent.push([channel, payload]);
  }
  isDestroyed(): boolean {
    return false;
  }
  focus(): void {}
}

function realApp() {
  const calls = { quit: 0, relaunch: 0 };
  let relaunchWorks = false;
  const gate = new QuitGate();
  const main = new PlainWindow(1);
  const flags: UnsavedFlags = { wizard: false, textEdit: false, reviewDraft: false };
  const coordinator = new ExitCoordinator({
    evaluate: (unsaved) =>
      decideExitConfirmation({ storageMode: 'memory', dbHasData: true, unsaved }),
    reportedUnsaved: () => flags,
    showWindow: async () => main,
    quit: () => gate.quit(() => (calls.quit += 1)),
    relaunch: () =>
      gate.relaunch(
        () => {
          calls.relaunch += 1;
          if (!relaunchWorks) throw new Error('relaunch refused');
        },
        () => (calls.quit += 1),
      ),
  });
  /** What Electron's `before-quit` does with our handler: true = the quit was stopped. */
  const beforeQuit = (): boolean => {
    let prevented = false;
    guardBeforeQuit(gate, () => coordinator.requestQuit(), {
      preventDefault: () => {
        prevented = true;
      },
    });
    return prevented;
  };
  return {
    gate,
    main,
    coordinator,
    calls,
    beforeQuit,
    fixRelaunch: () => {
      relaunchWorks = true;
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('QuitGate (B1: flags restored when relaunching fails)', () => {
  it('a plain gate stops before-quit; quit() lets it through', () => {
    const gate = new QuitGate();
    expect(gate.passesBeforeQuit()).toBe(false);
    expect(gate.isQuitting()).toBe(false);
    let quitCalled = false;
    gate.quit(() => {
      quitCalled = true;
    });
    expect(quitCalled).toBe(true);
    expect(gate.passesBeforeQuit()).toBe(true);
    expect(gate.isQuitting()).toBe(true);
  });

  it('a throwing relaunch puts BOTH flags back and rethrows', () => {
    const gate = new QuitGate();
    expect(() =>
      gate.relaunch(
        () => {
          throw new Error('no');
        },
        () => undefined,
      ),
    ).toThrow('no');
    expect(gate.isAllowed()).toBe(false);
    expect(gate.isQuitting()).toBe(false);
  });

  it('after a failed restart, ⌘Q (before-quit) still shows the confirmation', async () => {
    const app = realApp();
    await app.coordinator.requestRestart(app.main, {
      wizard: false,
      textEdit: false,
      reviewDraft: false,
    });
    app.coordinator.answer(app.main.id, { kind: 'restart', confirmed: true }); // 放弃并重启
    expect(app.calls.relaunch).toBe(1);
    expect(app.gate.isQuitting()).toBe(false);

    expect(app.beforeQuit()).toBe(true); // stopped …
    await flush();
    const dialogs = app.main.sent.filter(([c]) => c === 'clarityokr:app:confirm-exit');
    expect(dialogs.at(-1)![1]).toMatchObject({ kind: 'quit' }); // … and asked
    expect(app.calls.quit).toBe(0);

    app.coordinator.answer(app.main.id, { kind: 'quit', confirmed: true }); // 放弃并退出
    expect(app.calls.quit).toBe(1);
    expect(app.beforeQuit()).toBe(false); // the real quit now passes
  });

  it('N13: ⌘Q during the restart dialog, 放弃并重启 fails → no quit dialog; the next ⌘Q asks', async () => {
    const app = realApp();
    const none = { wizard: false, textEdit: false, reviewDraft: false };
    await app.coordinator.requestRestart(app.main, none);
    expect(app.beforeQuit()).toBe(true); // ⌘Q while the restart dialog is open: recorded
    await flush();
    const confirms = () => app.main.sent.filter(([c]) => c === 'clarityokr:app:confirm-exit');
    expect(confirms()).toHaveLength(1);
    app.coordinator.answer(app.main.id, { kind: 'restart', confirmed: true });
    await flush();
    expect(app.calls.relaunch).toBe(1);
    expect(app.main.sent.at(-1)).toEqual(['clarityokr:app:restart-result', { outcome: 'failed' }]);
    expect(confirms()).toHaveLength(1); // the recorded quit was dropped
    expect(app.beforeQuit()).toBe(true);
    await flush();
    expect(confirms().at(-1)![1]).toMatchObject({ kind: 'quit' });
    expect(app.calls.quit).toBe(0);
  });

  it('N13: ⌘Q during the restart dialog, 先不重启 → the quit dialog follows', async () => {
    const app = realApp();
    await app.coordinator.requestRestart(app.main, {
      wizard: false,
      textEdit: false,
      reviewDraft: false,
    });
    app.beforeQuit();
    app.coordinator.answer(app.main.id, { kind: 'restart', confirmed: false });
    await flush();
    expect(app.coordinator.pendingFor(app.main.id)).toMatchObject({ kind: 'quit' });
  });

  it('a successful relaunch lets the following before-quit through', async () => {
    const app = realApp();
    app.fixRelaunch();
    await app.coordinator.requestRestart(app.main, {
      wizard: false,
      textEdit: false,
      reviewDraft: false,
    });
    app.coordinator.answer(app.main.id, { kind: 'restart', confirmed: true });
    expect(app.calls.relaunch).toBe(1);
    expect(app.beforeQuit()).toBe(false);
  });
});

describe('hideOnClose (B2: closing the main window hides it)', () => {
  class PlainBrowserWindow implements HideableWindow {
    hidden = false;
    destroyed = false;
    private listener: ((event: { preventDefault(): void }) => void) | null = null;
    on(_event: 'close', listener: (event: { preventDefault(): void }) => void): void {
      this.listener = listener;
    }
    hide(): void {
      this.hidden = true;
    }
    isDestroyed(): boolean {
      return this.destroyed;
    }
    /** true = the window really closes */
    close(): boolean {
      let prevented = false;
      this.listener?.({
        preventDefault: () => {
          prevented = true;
        },
      });
      return !prevented;
    }
  }

  it('hides instead of closing while the app is not quitting', () => {
    const gate = new QuitGate();
    const window = new PlainBrowserWindow();
    hideOnClose(window, () => gate.isQuitting());
    expect(window.close()).toBe(false);
    expect(window.hidden).toBe(true);
  });

  it('closes for real once the app quits', () => {
    const gate = new QuitGate();
    const window = new PlainBrowserWindow();
    hideOnClose(window, () => gate.isQuitting());
    gate.quit(() => undefined);
    expect(window.close()).toBe(true);
    expect(window.hidden).toBe(false);
  });

  it('after a failed relaunch it hides again (the flag went back)', () => {
    const gate = new QuitGate();
    const window = new PlainBrowserWindow();
    hideOnClose(window, () => gate.isQuitting());
    try {
      gate.relaunch(
        () => {
          throw new Error('no');
        },
        () => undefined,
      );
    } catch {
      // expected
    }
    expect(window.close()).toBe(false);
  });
});
