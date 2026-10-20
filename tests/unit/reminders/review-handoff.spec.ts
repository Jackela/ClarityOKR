import { IPC_CHANNELS } from '@clarityokr/contracts';

import {
  READY_WAIT_MS,
  ReviewHandoff,
  registerReviewHandoffHandlers,
} from '../../../app/main/src/reminders/review-handoff.js';

/** A hand-made clock: timers fire only when the test says so (no real waiting). */
class Clock {
  now = 0;
  private timers: { at: number; fn: () => void; id: number }[] = [];
  private seq = 0;
  readonly api = {
    setTimeout: (fn: () => void, ms: number) => {
      const id = ++this.seq;
      this.timers.push({ at: this.now + ms, fn, id });
      return id;
    },
    clearTimeout: (id: unknown) => {
      this.timers = this.timers.filter((t) => t.id !== id);
    },
  };
  async advance(ms: number): Promise<void> {
    const until = this.now + ms;
    for (;;) {
      const next = this.timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.timers = this.timers.filter((t) => t !== next);
      this.now = next.at;
      next.fn();
      await flush();
    }
    this.now = until;
  }
  get pending(): number {
    return this.timers.length;
  }
}
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

/** A sticky shell double: `ready` is what REMINDERS_REVIEW_READY would report. */
function setup(opts: { shell?: number | null; front?: () => Promise<boolean> } = {}) {
  const clock = new Clock();
  const calls: string[] = [];
  let shell: number | null = opts.shell === undefined ? 1 : opts.shell;
  const handoff = new ReviewHandoff(
    {
      bringToFront: opts.front ?? (async () => (calls.push('front'), shell !== null)),
      currentShell: () => shell,
      notify: () => void calls.push('notify'),
    },
    clock.api,
  );
  return { clock, calls, handoff, setShell: (id: number | null) => (shell = id) };
}

describe('#84 review / #88: 去复盘 hand-off to the sticky shell', () => {
  it('a ready shell: raised, notified, taken once → opened', async () => {
    const { calls, handoff } = setup();
    handoff.shellReady(1);
    const outcome = handoff.request('okr-q');
    await flush();
    expect(calls).toEqual(['front', 'notify']);
    expect(handoff.take()).toBe('okr-q');
    expect(handoff.take()).toBeNull();
    await expect(outcome).resolves.toBe('opened');
  });

  it('no sticky shell to show → unavailable, nothing left pending, no timer', async () => {
    const { handoff, clock } = setup({ shell: null });
    await expect(handoff.request('okr-q')).resolves.toBe('unavailable');
    expect(handoff.take()).toBeNull();
    expect(clock.pending).toBe(0);
  });

  it('#88 queued until the shell says ready, then delivered (never before)', async () => {
    const { calls, handoff } = setup();
    const outcome = handoff.request('okr-q');
    await flush();
    expect(calls).toEqual(['front']); // not ready yet: nothing sent
    handoff.shellReady(1);
    expect(calls).toEqual(['front', 'notify']);
    expect(handoff.take()).toBe('okr-q');
    await expect(outcome).resolves.toBe('opened');
  });

  it('#88 ready arriving while the new window is still being raised (document not sent yet) waits for it', async () => {
    let finish!: (v: boolean) => void;
    const { calls, handoff } = setup({
      front: () => new Promise<boolean>((r) => (finish = r)),
    });
    const outcome = handoff.request('okr-q');
    handoff.shellReady(1); // the renderer was quick
    expect(calls).toEqual([]);
    finish(true); // bringToFront resolves after main sent the document
    await flush();
    expect(calls).toEqual(['notify']);
    expect(handoff.take()).toBe('okr-q');
    await expect(outcome).resolves.toBe('opened');
  });

  it('#88 a ready signal from an old (closed) shell does not count for the new one', async () => {
    const { calls, handoff, setShell } = setup();
    handoff.shellReady(1);
    handoff.shellGone(1);
    setShell(2);
    void handoff.request('okr-q');
    await flush();
    expect(calls).toEqual(['front']);
    handoff.shellReady(2);
    expect(calls).toEqual(['front', 'notify']);
  });

  it('#88 timeout: 5 s not ready → one silent retry (raised again), another 5 s → dropped, timeout', async () => {
    const { calls, handoff, clock } = setup();
    let outcome: string | null = null;
    void handoff.request('okr-q').then((o) => (outcome = o));
    await flush();
    await clock.advance(READY_WAIT_MS - 1);
    expect(outcome).toBeNull();
    expect(calls).toEqual(['front']);
    await clock.advance(1); // retry, silently
    expect(calls).toEqual(['front', 'front']);
    expect(outcome).toBeNull();
    await clock.advance(READY_WAIT_MS - 1);
    expect(outcome).toBeNull();
    await clock.advance(1);
    expect(outcome).toBe('timeout');
    expect(handoff.take()).toBeNull(); // the queued request is dropped
    handoff.shellReady(1); // a late ready delivers nothing
    expect(calls).toEqual(['front', 'front']);
    expect(clock.pending).toBe(0);
  });

  it('#88 ready during the retry window → delivered, opened (no timeout)', async () => {
    const { calls, handoff, clock } = setup();
    const outcome = handoff.request('okr-q');
    await flush();
    await clock.advance(READY_WAIT_MS);
    handoff.shellReady(1);
    expect(calls).toEqual(['front', 'front', 'notify']);
    expect(handoff.take()).toBe('okr-q');
    await expect(outcome).resolves.toBe('opened');
    expect(clock.pending).toBe(0);
  });

  it('#88 rapid double click while not ready: the earlier is superseded, only the last opens, once', async () => {
    const { calls, handoff, clock } = setup();
    const first = handoff.request('okr-q3');
    const second = handoff.request('okr-q2');
    await expect(first).resolves.toBe('superseded');
    await flush();
    handoff.shellReady(1);
    expect(calls.filter((c) => c === 'notify')).toEqual(['notify']);
    expect(handoff.take()).toBe('okr-q2');
    expect(handoff.take()).toBeNull();
    await expect(second).resolves.toBe('opened');
    expect(clock.pending).toBe(0); // the first one's timer is gone too
  });

  it('#88 double click while the first raise (window creation) is still in flight: delivered when it ends, no retry wait', async () => {
    let finishFirst!: (v: boolean) => void;
    let n = 0;
    const { calls, handoff, clock } = setup({
      front: () => {
        n += 1;
        return n === 1 ? new Promise<boolean>((r) => (finishFirst = r)) : Promise.resolve(true);
      },
    });
    const first = handoff.request('okr-a');
    const second = handoff.request('okr-b'); // its raise ends first
    await flush();
    handoff.shellReady(1); // still a raise in flight: wait
    expect(calls).toEqual([]);
    finishFirst(true);
    await flush();
    expect(calls).toEqual(['notify']);
    expect(handoff.take()).toBe('okr-b');
    await expect(first).resolves.toBe('superseded');
    await expect(second).resolves.toBe('opened');
    expect(clock.now).toBe(0); // no timer had to fire
  });

  it('IPC: rejects a bad id; go-review, review-ready, take-review', async () => {
    const handlers = new Map<string, (e: unknown, p?: unknown) => unknown>();
    const handoff = new ReviewHandoff({
      bringToFront: async () => true,
      currentShell: () => 7,
      notify: () => undefined,
    });
    registerReviewHandoffHandlers(
      { handle: (c: string, f: never) => handlers.set(c, f) } as never,
      handoff,
    );
    expect(await handlers.get(IPC_CHANNELS.REMINDERS_GO_REVIEW)!({}, { okrId: 3 })).toEqual({
      opened: false,
      outcome: 'unavailable',
    });
    const sender = { id: 7, once: () => undefined };
    handlers.get(IPC_CHANNELS.REMINDERS_REVIEW_READY)!({ sender });
    const reply = handlers.get(IPC_CHANNELS.REMINDERS_GO_REVIEW)!({}, { okrId: 'a' });
    await flush();
    expect(handlers.get(IPC_CHANNELS.REMINDERS_TAKE_REVIEW)!({})).toEqual({ okrId: 'a' });
    await expect(reply).resolves.toEqual({ opened: true, outcome: 'opened' });
  });

  it('IPC: the ready shell going away (destroyed or navigated) forgets it', async () => {
    const handlers = new Map<string, (e: unknown, p?: unknown) => unknown>();
    const calls: string[] = [];
    const handoff = new ReviewHandoff({
      bringToFront: async () => true,
      currentShell: () => 7,
      notify: () => void calls.push('notify'),
    });
    registerReviewHandoffHandlers(
      { handle: (c: string, f: never) => handlers.set(c, f) } as never,
      handoff,
    );
    const listeners = new Map<string, () => void>();
    const sender = { id: 7, once: (e: string, f: () => void) => listeners.set(e, f) };
    handlers.get(IPC_CHANNELS.REMINDERS_REVIEW_READY)!({ sender });
    expect([...listeners.keys()].sort()).toEqual(['destroyed', 'did-navigate']);
    listeners.get('did-navigate')!();
    void handoff.request('a');
    await flush();
    expect(calls).toEqual([]);
  });
});

describe('N55 (2): a minimized sticky window comes back to the front', () => {
  it('restores, shows and focuses it, in that order', async () => {
    const { raiseWindow } = await import('../../../app/main/src/windows/sticky-window-manager.js');
    const calls: string[] = [];
    raiseWindow({
      isMinimized: () => true,
      restore: () => void calls.push('restore'),
      show: () => void calls.push('show'),
      focus: () => void calls.push('focus'),
    });
    expect(calls).toEqual(['restore', 'show', 'focus']);
  });

  it('a hidden (closed to tray) window is shown and focused, not restored', async () => {
    const { raiseWindow } = await import('../../../app/main/src/windows/sticky-window-manager.js');
    const calls: string[] = [];
    raiseWindow({
      isMinimized: () => false,
      restore: () => void calls.push('restore'),
      show: () => void calls.push('show'),
      focus: () => void calls.push('focus'),
    });
    expect(calls).toEqual(['show', 'focus']);
  });

  it('the hand-off notifies the shell after it is raised', async () => {
    const { calls, handoff } = setup();
    handoff.shellReady(1);
    void handoff.request('okr-q');
    await flush();
    expect(calls).toEqual(['front', 'notify']);
  });
});
