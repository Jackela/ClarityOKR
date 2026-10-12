import { TestBed } from '@angular/core/testing';
import type { ClosedLoopError } from '@clarityokr/contracts';

import { Logger } from '../core/services/logger.service';
import { OkrStickyService } from '../okr-sticky/services/okr-sticky.service';
import { ClosedLoopApi } from './closed-loop-api.service';
import { ClosedLoopStore } from './closed-loop.store';
import { makeChange, makeDetail, makeKr, makeListItem } from './testing/fixtures';

const fail = (code: ClosedLoopError['code']) => ({
  ok: false as const,
  error: { code, message: 'x' } as ClosedLoopError,
});
const ok = <T>(data: T) => ({ ok: true as const, data });

describe('ClosedLoopStore', () => {
  let api: Record<string, jest.Mock>;
  let sticky: { openFromDetail: jest.Mock };
  let store: ClosedLoopStore;

  beforeEach(() => {
    jest.useFakeTimers();
    api = {
      list: jest.fn(),
      open: jest.fn(),
      pin: jest.fn(),
      setPeriod: jest.fn(),
      setProgress: jest.fn(),
      revertProgress: jest.fn(),
      replaceProgress: jest.fn(),
    };
    sticky = { openFromDetail: jest.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: ClosedLoopApi, useValue: api },
        { provide: OkrStickyService, useValue: sticky },
        { provide: Logger, useValue: { warn: jest.fn(), error: jest.fn() } },
      ],
    });
    store = TestBed.inject(ClosedLoopStore);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('syncDocument / reload', () => {
    it('loads the detail of a new document and marks it ready', async () => {
      const detail = makeDetail();
      api['open']!.mockResolvedValue(ok(detail));
      store.syncDocument('okr-1');
      expect(store.detailState()).toBe('loading');
      await jest.advanceTimersByTimeAsync(0);
      expect(api['open']).toHaveBeenCalledWith({ okrId: 'okr-1' });
      expect(store.detail()).toBe(detail);
      expect(store.detailState()).toBe('ready');
      expect(store.currentId()).toBe('okr-1');
      expect(store.openedFromHistory()).toBe(false);
    });

    it('ignores a null document and keeps the state', () => {
      store.syncDocument(null);
      expect(store.currentId()).toBeNull();
      expect(api['open']).not.toHaveBeenCalled();
    });

    it('reloads silently when the same document changes (no skeleton flash)', async () => {
      api['open']!.mockResolvedValue(ok(makeDetail()));
      store.syncDocument('okr-1');
      await jest.advanceTimersByTimeAsync(0);
      const states: string[] = [];
      api['open']!.mockImplementation(async () => {
        states.push(store.detailState());
        return ok(makeDetail([makeKr({ statement: 'edited' })]));
      });
      store.syncDocument('okr-1');
      await jest.advanceTimersByTimeAsync(0);
      expect(states).toEqual(['ready']);
      expect(store.detail()?.objective.keyResults[0]?.statement).toBe('edited');
    });

    it('shows the error state when the first load fails and recovers on retry', async () => {
      api['open']!.mockResolvedValueOnce(fail('INTERNAL'));
      store.syncDocument('okr-1');
      await jest.advanceTimersByTimeAsync(0);
      expect(store.detailState()).toBe('error');
      api['open']!.mockResolvedValueOnce(ok(makeDetail()));
      await store.reload();
      expect(store.detailState()).toBe('ready');
    });

    it('keeps showing the old content when a silent refresh fails', async () => {
      api['open']!.mockResolvedValueOnce(ok(makeDetail()));
      store.syncDocument('okr-1');
      await jest.advanceTimersByTimeAsync(0);
      api['open']!.mockResolvedValueOnce(fail('INTERNAL'));
      await store.reload(true);
      expect(store.detailState()).toBe('ready');
      expect(store.detail()).not.toBeNull();
    });

    it('drops the answer of a load that was overtaken by another document', async () => {
      let resolveFirst: (value: unknown) => void = () => undefined;
      api['open']!.mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)));
      store.syncDocument('old');
      api['open']!.mockResolvedValueOnce(ok(makeDetail([makeKr()], { id: 'new' })));
      store.syncDocument('new');
      await jest.advanceTimersByTimeAsync(0);
      resolveFirst(ok(makeDetail([makeKr()], { id: 'old' })));
      await jest.advanceTimersByTimeAsync(0);
      expect(store.detail()?.objective.id).toBe('new');
    });

    it('re-reads the open OKR when the window regains focus', async () => {
      api['open']!.mockResolvedValue(ok(makeDetail()));
      store.syncDocument('okr-1');
      await jest.advanceTimersByTimeAsync(0);
      api['open']!.mockClear();
      window.dispatchEvent(new Event('focus'));
      await jest.advanceTimersByTimeAsync(0);
      expect(api['open']).toHaveBeenCalledTimes(1);
    });
  });

  describe('history', () => {
    it('loads the list and reports errors', async () => {
      api['list']!.mockResolvedValueOnce(ok({ items: [makeListItem()] }));
      await store.refreshList();
      expect(store.list()).toHaveLength(1);
      expect(store.listState()).toBe('ready');
      api['list']!.mockResolvedValueOnce(fail('INTERNAL'));
      await store.refreshList();
      expect(store.listState()).toBe('error');
    });

    it('opens an OKR from the history and makes it the one edits act on', async () => {
      const detail = makeDetail([makeKr()], { id: 'old', pinned: false });
      api['open']!.mockResolvedValue(ok(detail));
      expect(await store.openFromHistory('old')).toBe(true);
      expect(store.currentId()).toBe('old');
      expect(store.openedFromHistory()).toBe(true);
      expect(sticky.openFromDetail).toHaveBeenCalledWith(detail);
      // the document change that follows does not turn it into a "new" OKR
      api['open']!.mockClear();
      store.syncDocument('old');
      expect(store.openedFromHistory()).toBe(true);
      expect(api['open']).not.toHaveBeenCalled();
    });

    it('reports a failed open without changing the current OKR', async () => {
      api['open']!.mockResolvedValueOnce(ok(makeDetail()));
      store.syncDocument('okr-1');
      await jest.advanceTimersByTimeAsync(0);
      api['open']!.mockResolvedValueOnce(fail('NOT_FOUND'));
      expect(await store.openFromHistory('gone')).toBe(false);
      expect(store.openError()).toBe(true);
      expect(store.currentId()).toBe('okr-1');
      expect(sticky.openFromDetail).not.toHaveBeenCalled();
    });
  });

  describe('pin', () => {
    beforeEach(async () => {
      api['open']!.mockResolvedValue(ok(makeDetail([makeKr()], { id: 'old', pinned: false })));
      await store.openFromHistory('old');
    });

    it('pins, announces for 6 seconds and then hides the banner', async () => {
      api['pin']!.mockResolvedValue(ok({ okrId: 'old', pinned: true }));
      expect(await store.pin()).toBe(true);
      expect(store.detail()?.objective.pinned).toBe(true);
      expect(store.pinNotice()).toBe('pinned');
      await jest.advanceTimersByTimeAsync(5999);
      expect(store.pinNotice()).toBe('pinned');
      await jest.advanceTimersByTimeAsync(2);
      expect(store.pinNotice()).toBe('none');
      expect(store.openedFromHistory()).toBe(false);
    });

    it('shows the failure state and can be retried', async () => {
      api['pin']!.mockResolvedValueOnce(fail('INTERNAL'));
      expect(await store.pin()).toBe(false);
      expect(store.pinNotice()).toBe('failed');
      api['pin']!.mockResolvedValueOnce(ok({ okrId: 'old', pinned: true }));
      expect(await store.pin()).toBe(true);
    });

    it('does nothing without an open OKR', async () => {
      const fresh = TestBed.inject(ClosedLoopStore);
      fresh.currentId.set(null);
      expect(await fresh.pin()).toBe(false);
    });
  });

  describe('writes', () => {
    const kr = makeKr({ id: 'kr-1', progress: 40, status: 'in_progress' });
    const kr2 = makeKr({ id: 'kr-2', position: 1, progress: null });

    beforeEach(async () => {
      api['open']!.mockResolvedValue(ok(makeDetail([kr, kr2])));
      store.syncDocument('okr-1');
      await jest.advanceTimersByTimeAsync(0);
    });

    it('patches the KR, its progress info and the overall progress from the reply', async () => {
      const updated = { ...kr, progress: 80, status: 'at_risk' as const };
      api['setProgress']!.mockResolvedValue(
        ok(
          makeChange(
            updated,
            { canRevert: true, before: { value: 40, status: 'in_progress' } },
            true,
            80,
          ),
        ),
      );
      const result = await store.setProgress({ krId: 'kr-1', status: 'at_risk', value: 80 });
      expect(result.ok).toBe(true);
      const detail = store.detail()!;
      expect(detail.objective.keyResults[0]).toEqual(updated);
      expect(detail.objective.keyResults[1]).toEqual(kr2);
      expect(detail.objective.overallProgress).toBe(80);
      expect(detail.progress['kr-1']?.canRevert).toBe(true);
    });

    it('routes revert and replace through their own calls', async () => {
      api['revertProgress']!.mockResolvedValue(ok(makeChange(kr, {}, true, 40)));
      api['replaceProgress']!.mockResolvedValue(ok(makeChange(kr, {}, true, 40)));
      await store.revertProgress({ krId: 'kr-1' });
      await store.replaceProgress({ krId: 'kr-1', value: 41 });
      expect(api['revertProgress']).toHaveBeenCalledWith({ krId: 'kr-1' });
      expect(api['replaceProgress']).toHaveBeenCalledWith({ krId: 'kr-1', value: 41 });
    });

    it('returns a failure unchanged and leaves the detail alone', async () => {
      api['setProgress']!.mockResolvedValue(fail('INTERNAL'));
      const before = store.detail();
      const result = await store.setProgress({ krId: 'kr-1', status: 'done' });
      expect(result.ok).toBe(false);
      expect(store.detail()).toBe(before);
    });

    it.each(['NOT_FOUND', 'KEY_RESULT_REMOVED'] as const)(
      're-reads the OKR when the key result is gone (%s)',
      async (code) => {
        api['setProgress']!.mockResolvedValue(fail(code));
        api['open']!.mockClear();
        await store.setProgress({ krId: 'kr-1', status: 'done' });
        await jest.advanceTimersByTimeAsync(0);
        expect(api['open']).toHaveBeenCalledTimes(1);
      },
    );

    it('sets the period from the reply (including clearing it)', async () => {
      api['setPeriod']!.mockResolvedValue(
        ok({ period: '2026-Q3', updatedAt: '2026-10-10T00:00:00.000Z' }),
      );
      expect((await store.setPeriod('2026-Q3')).ok).toBe(true);
      expect(store.detail()?.objective.period).toBe('2026-Q3');
      expect(store.detail()?.objective.updatedAt).toBe('2026-10-10T00:00:00.000Z');
      api['setPeriod']!.mockResolvedValue(
        ok({ period: null, updatedAt: '2026-10-11T00:00:00.000Z' }),
      );
      await store.setPeriod(null);
      expect(store.detail()?.objective.period).toBeNull();
      api['setPeriod']!.mockResolvedValue(fail('INTERNAL'));
      expect((await store.setPeriod('2026-Q1')).ok).toBe(false);
      expect(store.detail()?.objective.period).toBeNull();
    });

    it('refuses a period change without an open OKR', async () => {
      store.currentId.set(null);
      expect(await store.setPeriod('2026-Q1')).toMatchObject({ ok: false });
    });
  });
  describe('stale replies and failed opens (review B1/B2/N1)', () => {
    const deferred = <T>() => {
      let resolve: (v: T) => void = () => undefined;
      const promise = new Promise<T>((r) => (resolve = r));
      return { promise, resolve };
    };

    async function openFirst(): Promise<void> {
      api['open']!.mockResolvedValueOnce(ok(makeDetail([makeKr()], { id: 'a', pinned: false })));
      await store.openFromHistory('a');
    }

    async function switchToB(): Promise<void> {
      api['open']!.mockResolvedValueOnce(
        ok(
          makeDetail([makeKr({ id: 'kr-b', progress: 10 })], {
            id: 'b',
            period: null,
            pinned: false,
          }),
        ),
      );
      await store.openFromHistory('b');
    }

    it('B1: an OKR with only removed key results opens normally', async () => {
      const removedOnly = makeDetail([makeKr({ removedAt: '2026-10-10T00:00:00.000Z' })], {
        id: 'gone',
      });
      api['open']!.mockResolvedValue(ok(removedOnly));
      expect(await store.openFromHistory('gone')).toBe(true);
      expect(store.currentId()).toBe('gone');
      expect(store.detail()).toBe(removedOnly);
      expect(store.openError()).toBe(false);
    });

    it('B1: when showing the OKR throws, no store state is touched', async () => {
      await openFirst();
      store.syncDocument('a'); // the note's own sync of the document that was just opened
      const before = store.detail();
      sticky.openFromDetail.mockImplementationOnce(() => {
        throw new Error('boom');
      });
      api['open']!.mockResolvedValueOnce(ok(makeDetail([makeKr()], { id: 'x' })));
      expect(await store.openFromHistory('x')).toBe(false);
      expect(store.currentId()).toBe('a');
      expect(store.detail()).toBe(before);
      expect(store.openError()).toBe(true);
      // the next document sync is not swallowed by a stale skip flag
      api['open']!.mockResolvedValue(ok(makeDetail([makeKr()], { id: 'c' })));
      store.syncDocument('c');
      await jest.advanceTimersByTimeAsync(0);
      expect(store.currentId()).toBe('c');
    });

    it('B2: a pin reply that arrives after switching OKR changes nothing', async () => {
      await openFirst();
      const d = deferred<ReturnType<typeof ok>>();
      api['pin']!.mockReturnValue(d.promise);
      const pending = store.pin();
      await switchToB();
      d.resolve(ok({ okrId: 'a', pinned: true }));
      await pending;
      expect(store.detail()?.objective.id).toBe('b');
      expect(store.detail()?.objective.pinned).toBe(false);
      expect(store.pinNotice()).toBe('none');
    });

    it('B2: a failed pin for the old OKR does not show a failure on the new one', async () => {
      await openFirst();
      const d = deferred<ReturnType<typeof fail>>();
      api['pin']!.mockReturnValue(d.promise);
      const pending = store.pin();
      await switchToB();
      d.resolve(fail('INTERNAL'));
      await pending;
      expect(store.pinNotice()).toBe('none');
    });

    it('B2: a period reply for the old OKR does not overwrite the new one', async () => {
      await openFirst();
      const d = deferred<ReturnType<typeof ok>>();
      api['setPeriod']!.mockReturnValue(d.promise);
      const pending = store.setPeriod('2026-Q4' as never);
      await switchToB();
      d.resolve(ok({ okrId: 'a', period: '2026-Q4', updatedAt: '2026-10-11T00:00:00.000Z' }));
      await pending;
      expect(store.detail()?.objective.id).toBe('b');
      expect(store.detail()?.objective.period).toBeNull();
    });

    it.each([
      ['setProgress', (s: ClosedLoopStore) => s.setProgress({ krId: 'kr-1', status: 'done' })],
      ['revertProgress', (s: ClosedLoopStore) => s.revertProgress({ krId: 'kr-1' })],
      ['replaceProgress', (s: ClosedLoopStore) => s.replaceProgress({ krId: 'kr-1', value: 90 })],
    ] as const)('B2: a %s reply for the old OKR does not touch the new OKR', async (name, run) => {
      await openFirst();
      const d = deferred<ReturnType<typeof ok>>();
      api[name]!.mockReturnValue(d.promise);
      const pending = run(store);
      await switchToB();
      const stale = makeKr({ id: 'kr-1', progress: 90 });
      d.resolve(ok(makeChange(stale, {}, true, 90)));
      await pending;
      const objective = store.detail()!.objective;
      expect(objective.id).toBe('b');
      expect(objective.overallProgress).not.toBe(90);
      expect(objective.keyResults.map((kr) => kr.id)).toEqual(['kr-b']);
      expect(store.detail()!.progress['kr-1']).toBeUndefined();
    });

    it('B2: a stale-state failure of the old OKR does not reload the new one', async () => {
      await openFirst();
      const d = deferred<ReturnType<typeof fail>>();
      api['revertProgress']!.mockReturnValue(d.promise);
      const pending = store.revertProgress({ krId: 'kr-1' });
      await switchToB();
      api['open']!.mockClear();
      d.resolve(fail('LATEST_IS_REVERT'));
      await pending;
      await jest.advanceTimersByTimeAsync(0);
      expect(api['open']).not.toHaveBeenCalled();
    });

    describe('A → B → A: a reply for the first visit of A is dropped (request sequence)', () => {
      async function goAba(start: () => Promise<unknown>): Promise<{ done: Promise<unknown> }> {
        await openFirst();
        const done = start();
        await switchToB();
        api['open']!.mockResolvedValueOnce(
          ok(makeDetail([makeKr({ id: 'kr-1', progress: null })], { id: 'a', pinned: false })),
        );
        await store.openFromHistory('a');
        return { done };
      }

      it('setPeriod: the old reply does not overwrite the fresh A, and A is read again', async () => {
        const d = deferred<ReturnType<typeof ok>>();
        api['setPeriod']!.mockReturnValue(d.promise);
        const { done } = await goAba(() => store.setPeriod('2026-Q4' as never));
        expect(store.detail()?.objective.id).toBe('a');
        expect(store.detail()?.objective.period).toBeNull();
        api['open']!.mockClear();
        api['open']!.mockResolvedValue(
          ok(makeDetail([makeKr()], { id: 'a', period: '2026-Q4' as never, pinned: false })),
        );
        d.resolve(ok({ okrId: 'a', period: '2026-Q4', updatedAt: '2026-10-11T00:00:00.000Z' }));
        await done;
        await jest.advanceTimersByTimeAsync(0);
        // the write may have landed after the fresh read: read once more, show the truth
        expect(api['open']).toHaveBeenCalledTimes(1);
        expect(store.detail()?.objective.period).toBe('2026-Q4');
      });

      it('pin: the old reply neither changes A nor shows its notice', async () => {
        const d = deferred<ReturnType<typeof ok>>();
        api['pin']!.mockReturnValue(d.promise);
        const { done } = await goAba(() => store.pin());
        api['open']!.mockResolvedValue(ok(makeDetail([makeKr()], { id: 'a', pinned: false })));
        d.resolve(ok({ okrId: 'a', pinned: true }));
        await done;
        await jest.advanceTimersByTimeAsync(0);
        expect(store.pinNotice()).toBe('none');
        expect(store.detail()?.objective.pinned).toBe(false);
      });

      it('progress: the old reply (90%) does not patch the fresh A (null)', async () => {
        const d = deferred<ReturnType<typeof ok>>();
        api['setProgress']!.mockReturnValue(d.promise);
        const { done } = await goAba(() =>
          store.setProgress({ krId: 'kr-1', status: 'done', value: 90 }),
        );
        api['open']!.mockResolvedValue(
          ok(makeDetail([makeKr({ id: 'kr-1', progress: null })], { id: 'a' })),
        );
        d.resolve(ok(makeChange(makeKr({ id: 'kr-1', progress: 90 }), {}, true, 90)));
        await done;
        await jest.advanceTimersByTimeAsync(0);
        expect(store.detail()!.objective.overallProgress).toBeNull();
        expect(store.detail()!.objective.keyResults[0]!.progress).toBeNull();
      });

      it('read: a slow reload of the first visit cannot replace the newer detail', async () => {
        await openFirst();
        const slow = deferred<ReturnType<typeof ok>>();
        api['open']!.mockReturnValueOnce(slow.promise);
        const reload = store.reload(true);
        api['open']!.mockResolvedValueOnce(
          ok(makeDetail([makeKr({ statement: 'fresh' })], { id: 'a' })),
        );
        await store.reload(true);
        slow.resolve(ok(makeDetail([makeKr({ statement: 'stale' })], { id: 'a' })));
        await reload;
        expect(store.detail()!.objective.keyResults[0]!.statement).toBe('fresh');
      });

      it('open: when two opens overlap only the latest one wins and reports no error', async () => {
        await openFirst();
        const first = deferred<ReturnType<typeof ok>>();
        api['open']!.mockReturnValueOnce(first.promise);
        const openB = store.openFromHistory('b');
        api['open']!.mockResolvedValueOnce(ok(makeDetail([makeKr()], { id: 'c', pinned: false })));
        expect(await store.openFromHistory('c')).toBe(true);
        first.resolve(ok(makeDetail([makeKr()], { id: 'b', pinned: false })));
        expect(await openB).toBe(false);
        expect(store.currentId()).toBe('c');
        expect(store.openError()).toBe(false);
      });

      it('two writes of one kind: the earlier reply is dropped, the later one applies', async () => {
        await openFirst();
        const d1 = deferred<ReturnType<typeof ok>>();
        const d2 = deferred<ReturnType<typeof ok>>();
        api['setPeriod']!.mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise);
        const p1 = store.setPeriod('2026-Q3' as never);
        const p2 = store.setPeriod('2026-Q4' as never);
        d2.resolve(ok({ okrId: 'a', period: '2026-Q4', updatedAt: '2026-10-11T00:00:00.000Z' }));
        await p2;
        d1.resolve(ok({ okrId: 'a', period: '2026-Q3', updatedAt: '2026-10-10T00:00:00.000Z' }));
        await p1;
        expect(store.detail()?.objective.period).toBe('2026-Q4');
      });
    });

    it.each(['LATEST_IS_REVERT', 'NOTHING_TO_REVERT', 'NOT_FOUND', 'KEY_RESULT_REMOVED'] as const)(
      'N1: %s reloads the open OKR instead of leaving a stale state',
      async (code) => {
        await openFirst();
        api['revertProgress']!.mockResolvedValue(fail(code));
        api['open']!.mockClear();
        api['open']!.mockResolvedValue(ok(makeDetail([makeKr()], { id: 'a' })));
        const result = await store.revertProgress({ krId: 'kr-1' });
        await jest.advanceTimersByTimeAsync(0);
        expect(result.ok).toBe(false);
        expect(api['open']).toHaveBeenCalledWith({ okrId: 'a' });
      },
    );
  });
});
