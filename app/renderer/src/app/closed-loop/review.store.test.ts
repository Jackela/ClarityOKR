import { TestBed } from '@angular/core/testing';
import type { ClosedLoopError, ReviewRecord } from '@clarityokr/contracts';

import { ClosedLoopApi } from './closed-loop-api.service';
import { ReviewStore } from './review.store';

const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (code: ClosedLoopError['code'], extra: Partial<ClosedLoopError> = {}) => ({
  ok: false as const,
  error: { code, message: 'x', ...extra } as ClosedLoopError,
});
const record = (overrides: Partial<ReviewRecord> = {}): ReviewRecord => ({
  objectiveId: 'a',
  wentWell: '发布更稳',
  fellShort: '',
  nextSteps: '',
  snapshot: [],
  savedAt: '2026-10-10T08:00:00.000Z',
  snapshotAt: '2026-10-10T08:00:00.000Z',
  ...overrides,
});
const deferred = <T>() => {
  let resolve: (v: T) => void = () => undefined;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe('ReviewStore (spec §5)', () => {
  let api: Record<string, jest.Mock>;
  let store: ReviewStore;

  beforeEach(() => {
    api = { getReview: jest.fn(), saveReview: jest.fn() };
    TestBed.configureTestingModule({ providers: [{ provide: ClosedLoopApi, useValue: api }] });
    store = TestBed.inject(ReviewStore);
  });

  it('loads an OKR without a review as three empty sections, not dirty, not saveable', async () => {
    api['getReview']!.mockResolvedValue(ok({ review: null }));
    const pending = store.load('a');
    expect(store.loadState()).toBe('loading');
    await pending;
    expect(store.loadState()).toBe('ready');
    expect(store.review()).toBeNull();
    expect(store.draft()).toEqual({ wentWell: '', fellShort: '', nextSteps: '' });
    expect(store.dirty()).toBe(false);
    expect(store.canSave()).toBe(false);
    expect(store.blockedReason()).toBe('none');
  });

  it('loads a saved review into the sections', async () => {
    api['getReview']!.mockResolvedValue(ok({ review: record() }));
    await store.load('a');
    expect(store.draft().wentWell).toBe('发布更稳');
    expect(store.dirty()).toBe(false);
  });

  it('a failed read is an error state (retry loads again)', async () => {
    api['getReview']!.mockResolvedValue(fail('INTERNAL'));
    await store.load('a');
    expect(store.loadState()).toBe('error');
    api['getReview']!.mockResolvedValue(ok({ review: null }));
    await store.load('a');
    expect(store.loadState()).toBe('ready');
  });

  it('typing makes it dirty at once; saving is allowed with one non-empty section', async () => {
    api['getReview']!.mockResolvedValue(ok({ review: null }));
    await store.load('a');
    store.setSection('wentWell', '  ');
    expect(store.dirty()).toBe(true);
    expect(store.blockedReason()).toBe('empty'); // blanks only: 请至少填写一段
    expect(store.canSave()).toBe(false);
    store.setSection('fellShort', '没做完');
    expect(store.blockedReason()).toBeNull();
    expect(store.canSave()).toBe(true);
  });

  it('is not saveable while any section is over 2000 characters, content kept whole', async () => {
    api['getReview']!.mockResolvedValue(ok({ review: null }));
    await store.load('a');
    const long = '字'.repeat(2001);
    store.setSection('nextSteps', long);
    expect(store.draft().nextSteps).toBe(long);
    expect(store.blockedReason()).toBe('over_limit');
    expect(store.canSave()).toBe(false);
    store.setSection('nextSteps', '字'.repeat(2000));
    expect(store.canSave()).toBe(true);
    // an emoji is one character: 2000 of them fit
    store.setSection('nextSteps', '👨‍👩‍👧‍👦'.repeat(2000));
    expect(store.canSave()).toBe(true);
  });

  it('save sends the okr id and the three texts as typed and adopts the saved record', async () => {
    api['getReview']!.mockResolvedValue(ok({ review: null }));
    await store.load('a');
    store.setSection('wentWell', ' 好 ');
    api['saveReview']!.mockResolvedValue(ok({ review: record({ wentWell: ' 好 ' }) }));
    const saved = await store.save();
    expect(api['saveReview']).toHaveBeenCalledWith({
      okrId: 'a',
      wentWell: ' 好 ',
      fellShort: '',
      nextSteps: '',
    });
    expect(saved?.wentWell).toBe(' 好 ');
    expect(store.review()).toEqual(saved);
    expect(store.dirty()).toBe(false);
    expect(store.saving()).toBe(false);
    expect(store.saveFailure()).toBe('none');
  });

  it('while saving the sections ignore input and a second save does nothing', async () => {
    api['getReview']!.mockResolvedValue(ok({ review: null }));
    await store.load('a');
    store.setSection('wentWell', '好');
    const d = deferred<ReturnType<typeof ok>>();
    api['saveReview']!.mockReturnValue(d.promise);
    const first = store.save();
    expect(store.saving()).toBe(true);
    store.setSection('wentWell', '被改了');
    expect(store.draft().wentWell).toBe('好');
    expect(await store.save()).toBeNull();
    d.resolve(ok({ review: record({ wentWell: '好' }) }));
    await first;
    expect(api['saveReview']).toHaveBeenCalledTimes(1);
  });

  it('a failed save keeps the text, flags the failure and clears it on the next typing', async () => {
    api['getReview']!.mockResolvedValue(ok({ review: null }));
    await store.load('a');
    store.setSection('wentWell', '好');
    api['saveReview']!.mockResolvedValue(fail('INTERNAL'));
    expect(await store.save()).toBeNull();
    expect(store.saveFailure()).toBe('failed');
    expect(store.draft().wentWell).toBe('好');
    expect(store.dirty()).toBe(true);
    expect(store.saving()).toBe(false);
    store.setSection('wentWell', '好吧');
    expect(store.saveFailure()).toBe('none');
  });

  it('a main-process over-limit rejection is its own failure', async () => {
    api['getReview']!.mockResolvedValue(ok({ review: null }));
    await store.load('a');
    store.setSection('wentWell', '好');
    api['saveReview']!.mockResolvedValue(
      fail('INVALID_REQUEST', { field: 'wentWell', reason: 'too_long' }),
    );
    await store.save();
    expect(store.saveFailure()).toBe('over_limit');
    expect(store.draft().wentWell).toBe('好');
  });

  it('discard throws the typed text away and returns to the saved review', async () => {
    api['getReview']!.mockResolvedValue(ok({ review: record() }));
    await store.load('a');
    store.setSection('wentWell', '改了');
    store.discard();
    expect(store.draft().wentWell).toBe('发布更稳');
    expect(store.dirty()).toBe(false);
  });

  it('loading another OKR drops the draft of the first', async () => {
    api['getReview']!.mockResolvedValue(ok({ review: null }));
    await store.load('a');
    store.setSection('wentWell', '属于 A');
    api['getReview']!.mockResolvedValue(ok({ review: null }));
    await store.load('b');
    expect(store.draft().wentWell).toBe('');
    expect(store.dirty()).toBe(false);
  });

  it('a slow read of OKR A cannot replace what was loaded for B (latest request wins)', async () => {
    const slow = deferred<ReturnType<typeof ok>>();
    api['getReview']!.mockReturnValueOnce(slow.promise);
    const first = store.load('a');
    api['getReview']!.mockResolvedValueOnce(ok({ review: record({ wentWell: 'B 的复盘' }) }));
    await store.load('b');
    slow.resolve(ok({ review: record({ wentWell: 'A 的复盘' }) }));
    await first;
    expect(store.draft().wentWell).toBe('B 的复盘');
  });

  it('a save reply for an OKR that is no longer open is dropped', async () => {
    api['getReview']!.mockResolvedValue(ok({ review: null }));
    await store.load('a');
    store.setSection('wentWell', '好');
    const d = deferred<ReturnType<typeof ok>>();
    api['saveReview']!.mockReturnValue(d.promise);
    const saving = store.save();
    await store.load('b');
    d.resolve(ok({ review: record({ objectiveId: 'a' }) }));
    expect(await saving).toBeNull();
    expect(store.review()).toBeNull();
    expect(store.saving()).toBe(false);
  });

  it('load(null) resets to idle', async () => {
    await store.load(null);
    expect(store.loadState()).toBe('idle');
  });
});
