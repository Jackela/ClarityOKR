import { IPC_CHANNELS } from '@clarityokr/contracts';

import {
  ReviewHandoff,
  registerReviewHandoffHandlers,
} from '../../../app/main/src/reminders/review-handoff.js';

describe('#84 review: 去复盘 hand-off to the sticky shell', () => {
  it('keeps the request, brings the shell forward, notifies it; taken once', async () => {
    const calls: string[] = [];
    const handoff = new ReviewHandoff({
      bringToFront: async () => (calls.push('front'), true),
      notify: () => calls.push('notify'),
    });
    expect(await handoff.request('okr-q')).toBe(true);
    expect(calls).toEqual(['front', 'notify']);
    expect(handoff.take()).toBe('okr-q');
    expect(handoff.take()).toBeNull();
  });

  it('no sticky shell to show → not opened, nothing left pending', async () => {
    const handoff = new ReviewHandoff({ bringToFront: async () => false, notify: () => undefined });
    expect(await handoff.request('okr-q')).toBe(false);
    expect(handoff.take()).toBeNull();
  });

  it('IPC: rejects a bad id; go-review then take-review', async () => {
    const handlers = new Map<string, (e: unknown, p?: unknown) => unknown>();
    registerReviewHandoffHandlers(
      { handle: (c: string, f: never) => handlers.set(c, f) } as never,
      new ReviewHandoff({ bringToFront: async () => true, notify: () => undefined }),
    );
    expect(await handlers.get(IPC_CHANNELS.REMINDERS_GO_REVIEW)!({}, { okrId: 3 })).toEqual({
      opened: false,
    });
    expect(await handlers.get(IPC_CHANNELS.REMINDERS_GO_REVIEW)!({}, { okrId: 'a' })).toEqual({
      opened: true,
    });
    expect(handlers.get(IPC_CHANNELS.REMINDERS_TAKE_REVIEW)!({})).toEqual({ okrId: 'a' });
  });
});
