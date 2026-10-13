import { jest } from '@jest/globals';
import {
  decideExitConfirmation,
  type StorageModeName,
  type UnsavedFlags,
} from '@clarityokr/contracts';
import { ExitCoordinator, type ExitWindow } from '@clarityokr/main/lifecycle/exit-coordinator';

const none: UnsavedFlags = { wizard: false, textEdit: false, reviewDraft: false };
const CONFIRM = 'clarityokr:app:confirm-exit';
const RESULT = 'clarityokr:app:restart-result';

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

function setup(mode: StorageModeName = 'normal', dbHasData = false) {
  const main = new FakeWindow(1);
  const sticky = new FakeWindow(2);
  let reported: UnsavedFlags = { ...none };
  const shown: string[] = [];
  const quit = jest.fn();
  const relaunch = jest.fn();
  const showWindow = jest.fn(async (which: 'main' | 'sticky') => {
    shown.push(which);
    return which === 'main' ? main : sticky;
  });
  const coordinator = new ExitCoordinator({
    evaluate: (unsaved) => decideExitConfirmation({ storageMode: mode, dbHasData, unsaved }),
    reportedUnsaved: () => reported,
    showWindow,
    quit,
    relaunch,
  });
  return {
    coordinator,
    main,
    sticky,
    shown,
    quit,
    relaunch,
    showWindow,
    report: (flags: Partial<UnsavedFlags>) => {
      reported = { ...reported, ...flags };
    },
  };
}

describe('ExitCoordinator: quit (§1.2c)', () => {
  it('nothing unsaved → quits at once, no dialog, no window shown', async () => {
    const h = setup();
    expect(await h.coordinator.requestQuit()).toBe('quitting');
    expect(h.quit).toHaveBeenCalledTimes(1);
    expect(h.shown).toEqual([]);
  });

  it('memory mode with an empty database → no dialog', async () => {
    const h = setup('memory', false);
    expect(await h.coordinator.requestQuit()).toBe('quitting');
  });

  it('review draft only → the sticky window is shown and hosts the dialog', async () => {
    const h = setup();
    h.report({ reviewDraft: true });
    expect(await h.coordinator.requestQuit()).toBe('confirm_pending');
    expect(h.shown).toEqual(['sticky']);
    expect(h.sticky.sent).toEqual([[CONFIRM, expect.objectContaining({ kind: 'quit' })]]);
    expect(h.main.sent).toEqual([]);
    expect(h.quit).not.toHaveBeenCalled();
  });

  it('wizard + review draft → both windows shown (main last), dialog in the main window', async () => {
    const h = setup();
    h.report({ wizard: true, reviewDraft: true });
    await h.coordinator.requestQuit();
    expect(h.shown).toEqual(['sticky', 'main']);
    expect(h.main.sent[0]![1]).toMatchObject({
      kind: 'quit',
      confirmation: { reasons: ['wizard', 'review_draft'], dialogWindow: 'main' },
    });
  });

  it('memory only → main window with memoryOnly', async () => {
    const h = setup('memory', true);
    await h.coordinator.requestQuit();
    expect(h.main.sent[0]![1]).toMatchObject({ confirmation: { memoryOnly: true } });
  });

  it('a sticky-only dialog falls back to the main window when there is no sticky note', async () => {
    const h = setup();
    h.showWindow.mockImplementation(async (which) => (which === 'main' ? h.main : null));
    h.report({ textEdit: true });
    await h.coordinator.requestQuit();
    expect(h.main.sent).toHaveLength(1);
  });

  it('asking again while the dialog is open only focuses it (never a second dialog)', async () => {
    const h = setup();
    h.report({ wizard: true });
    await h.coordinator.requestQuit();
    expect(await h.coordinator.requestQuit()).toBe('confirm_pending');
    expect(h.main.sent).toHaveLength(1);
    expect(h.main.focused).toBe(1);
  });

  it('only the hosting window may answer, with the matching kind', async () => {
    const h = setup();
    h.report({ wizard: true });
    await h.coordinator.requestQuit();
    expect(h.coordinator.answer(h.sticky.id, { kind: 'quit', confirmed: true }).ok).toBe(false);
    expect(h.coordinator.answer(h.main.id, { kind: 'restart', confirmed: true }).ok).toBe(false);
    expect(h.quit).not.toHaveBeenCalled();
    expect(h.coordinator.answer(h.main.id, { kind: 'quit', confirmed: true })).toEqual({
      ok: true,
      data: { accepted: true },
    });
    expect(h.quit).toHaveBeenCalledTimes(1);
    // Already answered.
    expect(h.coordinator.answer(h.main.id, { kind: 'quit', confirmed: true }).ok).toBe(false);
  });

  it('「继续编辑」 → nothing quits; a later quit asks again', async () => {
    const h = setup();
    h.report({ wizard: true });
    await h.coordinator.requestQuit();
    h.coordinator.answer(h.main.id, { kind: 'quit', confirmed: false });
    expect(h.quit).not.toHaveBeenCalled();
    expect(h.coordinator.pendingFor(h.main.id)).toBeNull();
    await h.coordinator.requestQuit();
    expect(h.main.sent).toHaveLength(2);
  });

  it('pendingFor tells a freshly loaded host window what to show', async () => {
    const h = setup();
    h.report({ wizard: true });
    await h.coordinator.requestQuit();
    expect(h.coordinator.pendingFor(h.main.id)).toMatchObject({ kind: 'quit' });
    expect(h.coordinator.pendingFor(h.sticky.id)).toBeNull();
  });

  it('the host window going away counts as cancel', async () => {
    const h = setup();
    h.report({ wizard: true });
    await h.coordinator.requestQuit();
    h.coordinator.windowGone(h.main.id);
    expect(h.coordinator.pendingFor(h.main.id)).toBeNull();
    expect(await h.coordinator.requestQuit()).toBe('confirm_pending');
  });

  it('a failure while showing the window drops the dialog (a later quit can ask again)', async () => {
    const h = setup();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    h.showWindow.mockRejectedValueOnce(new Error('gone'));
    h.report({ wizard: true });
    await h.coordinator.requestQuit();
    expect(h.coordinator.pendingFor(h.main.id)).toBeNull();
    await h.coordinator.requestQuit();
    expect(h.main.sent).toHaveLength(1);
    errorSpy.mockRestore();
  });
});

describe('ExitCoordinator: restart (§7a.4)', () => {
  it('nothing to lose → relaunches, reply restarting', async () => {
    const h = setup('memory', false);
    expect(await h.coordinator.requestRestart(h.sticky, none)).toEqual({ outcome: 'restarting' });
    expect(h.relaunch).toHaveBeenCalledTimes(1);
  });

  it('asked from the sticky note → the dialog opens in the MAIN window', async () => {
    const h = setup('memory', true);
    expect(await h.coordinator.requestRestart(h.sticky, none)).toEqual({
      outcome: 'confirm_pending',
    });
    expect(h.main.sent).toEqual([[CONFIRM, expect.objectContaining({ kind: 'restart' })]]);
    expect(h.sticky.sent).toEqual([]);
  });

  it('a sticky-only reason still opens the restart dialog in the main window', async () => {
    const h = setup();
    expect(await h.coordinator.requestRestart(h.sticky, { ...none, reviewDraft: true })).toEqual({
      outcome: 'confirm_pending',
    });
    expect(h.shown).toEqual(['sticky', 'main']);
    expect(h.main.sent).toHaveLength(1);
  });

  it('「先不重启」 → the asking window gets cancelled and the focus', async () => {
    const h = setup('memory', true);
    await h.coordinator.requestRestart(h.sticky, none);
    h.coordinator.answer(h.main.id, { kind: 'restart', confirmed: false });
    expect(h.sticky.sent).toEqual([[RESULT, { outcome: 'cancelled' }]]);
    expect(h.sticky.focused).toBe(1);
    expect(h.relaunch).not.toHaveBeenCalled();
  });

  it('「放弃并重启」 → relaunch; relaunch_failed → failed to the asking window, later restarts work', async () => {
    const h = setup('memory', true);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    h.relaunch.mockImplementationOnce(() => {
      throw new Error('spawn failed /secret');
    });
    await h.coordinator.requestRestart(h.sticky, none);
    h.coordinator.answer(h.main.id, { kind: 'restart', confirmed: true });
    expect(h.sticky.sent).toEqual([[RESULT, { outcome: 'failed' }]]);
    expect(JSON.stringify(h.sticky.sent)).not.toContain('secret');
    expect(h.coordinator.isExiting()).toBe(false);
    await h.coordinator.requestRestart(h.sticky, none);
    h.coordinator.answer(h.main.id, { kind: 'restart', confirmed: true });
    expect(h.relaunch).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  it('a direct relaunch failure comes back in the reply', async () => {
    const h = setup();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    h.relaunch.mockImplementationOnce(() => {
      throw new Error('x');
    });
    expect(await h.coordinator.requestRestart(h.main, none)).toEqual({
      outcome: 'failed',
      category: 'relaunch_failed',
    });
    errorSpy.mockRestore();
  });

  it('N10: two windows click at almost the same time → ONE dialog; both hear the result', async () => {
    const h = setup('memory', true);
    const [a, b] = await Promise.all([
      h.coordinator.requestRestart(h.sticky, none),
      h.coordinator.requestRestart(h.main, none),
    ]);
    expect(a).toEqual({ outcome: 'confirm_pending' });
    expect(b).toEqual({ outcome: 'confirm_pending' });
    expect(h.main.sent.filter(([c]) => c === CONFIRM)).toHaveLength(1);
    h.coordinator.answer(h.main.id, { kind: 'restart', confirmed: false });
    expect(h.sticky.sent).toContainEqual([RESULT, { outcome: 'cancelled' }]);
    expect(h.main.sent).toContainEqual([RESULT, { outcome: 'cancelled' }]);
  });

  it('N10: two direct restarts at once relaunch only once', async () => {
    const h = setup();
    const replies = await Promise.all([
      h.coordinator.requestRestart(h.sticky, none),
      h.coordinator.requestRestart(h.main, none),
    ]);
    expect(replies).toEqual([{ outcome: 'restarting' }, { outcome: 'restarting' }]);
    expect(h.relaunch).toHaveBeenCalledTimes(1);
  });

  it('N10: the decision includes what ANOTHER window reported', async () => {
    const h = setup();
    h.report({ wizard: true }); // the main window's wizard
    expect(await h.coordinator.requestRestart(h.sticky, none)).toEqual({
      outcome: 'confirm_pending',
    });
    expect(h.main.sent[0]![1]).toMatchObject({ confirmation: { reasons: ['wizard'] } });
    expect(h.relaunch).not.toHaveBeenCalled();
  });

  it('a restart asked while the quit dialog is open joins it; quitting wins on confirm', async () => {
    const h = setup();
    h.report({ wizard: true });
    await h.coordinator.requestQuit();
    expect(await h.coordinator.requestRestart(h.sticky, none)).toEqual({
      outcome: 'confirm_pending',
    });
    h.coordinator.answer(h.main.id, { kind: 'quit', confirmed: true });
    expect(h.quit).toHaveBeenCalledTimes(1);
    expect(h.relaunch).not.toHaveBeenCalled();
  });

  it('after quitting started, more requests do nothing', async () => {
    const h = setup();
    await h.coordinator.requestQuit();
    expect(await h.coordinator.requestQuit()).toBe('quitting');
    expect(await h.coordinator.requestRestart(h.main, none)).toEqual({ outcome: 'restarting' });
    expect(h.quit).toHaveBeenCalledTimes(1);
    expect(h.relaunch).not.toHaveBeenCalled();
  });

  it('a closed asking window is not notified', async () => {
    const h = setup('memory', true);
    await h.coordinator.requestRestart(h.sticky, none);
    h.sticky.destroyed = true;
    h.coordinator.answer(h.main.id, { kind: 'restart', confirmed: false });
    expect(h.sticky.sent).toEqual([]);
  });
});
