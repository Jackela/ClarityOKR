import { Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { UnsavedFlags } from '@clarityokr/contracts';

import { ClosedLoopApi } from './closed-loop-api.service';
import { UNSAVED_MAX_RETRIES, UNSAVED_RETRY_MS, UnsavedReporter } from './unsaved-reporter.service';

const NONE: UnsavedFlags = { wizard: false, textEdit: false, reviewDraft: false };
const OK = { ok: true, data: { recorded: true } };
const FAIL = { ok: false, error: { code: 'INTERNAL', message: 'x' } };

describe('UnsavedReporter (N7: record only after the main process took it)', () => {
  let api: { reportUnsaved: jest.Mock };
  let flags: ReturnType<typeof signal<UnsavedFlags>>;
  let reporter: UnsavedReporter;

  const settle = async (): Promise<void> => {
    TestBed.tick();
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };

  beforeEach(() => {
    jest.useFakeTimers();
    api = { reportUnsaved: jest.fn().mockResolvedValue(OK) };
    TestBed.configureTestingModule({ providers: [{ provide: ClosedLoopApi, useValue: api }] });
    reporter = TestBed.inject(UnsavedReporter);
    flags = signal<UnsavedFlags>({ ...NONE });
    reporter.watch(flags, TestBed.inject(Injector));
  });

  afterEach(() => jest.useRealTimers());

  it('sends nothing while nothing differs; sends only the changed flag', async () => {
    await settle();
    expect(api.reportUnsaved).not.toHaveBeenCalled();
    flags.set({ ...NONE, wizard: true });
    await settle();
    expect(api.reportUnsaved).toHaveBeenCalledWith({ wizard: true });
    expect(reporter.local()).toEqual({ ...NONE, wizard: true });
  });

  it('a failed report is not recorded: it is retried and then succeeds', async () => {
    api.reportUnsaved.mockResolvedValueOnce(FAIL);
    flags.set({ ...NONE, reviewDraft: true });
    await settle();
    expect(api.reportUnsaved).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(UNSAVED_RETRY_MS);
    await settle();
    expect(api.reportUnsaved).toHaveBeenCalledTimes(2);
    expect(api.reportUnsaved).toHaveBeenLastCalledWith({ reviewDraft: true });
    // recorded now: no more traffic
    jest.advanceTimersByTime(UNSAVED_RETRY_MS * 3);
    await settle();
    expect(api.reportUnsaved).toHaveBeenCalledTimes(2);
  });

  it('a rejected IPC call counts as a failure too', async () => {
    api.reportUnsaved.mockRejectedValueOnce(new Error('gone'));
    flags.set({ ...NONE, textEdit: true });
    await settle();
    jest.advanceTimersByTime(UNSAVED_RETRY_MS);
    await settle();
    expect(api.reportUnsaved).toHaveBeenLastCalledWith({ textEdit: true });
  });

  it('the retry sends the CURRENT state: a flag that went back meanwhile is not sent', async () => {
    api.reportUnsaved.mockResolvedValueOnce(FAIL);
    flags.set({ ...NONE, wizard: true });
    await settle();
    flags.set({ ...NONE });
    await settle();
    jest.advanceTimersByTime(UNSAVED_RETRY_MS);
    await settle();
    expect(api.reportUnsaved).toHaveBeenCalledTimes(1);
  });

  it('one request at a time; a change made while it runs is sent after it', async () => {
    let release: (v: unknown) => void = () => undefined;
    api.reportUnsaved.mockReturnValueOnce(new Promise((r) => (release = r)));
    flags.set({ ...NONE, wizard: true });
    await settle();
    flags.set({ ...NONE, wizard: true, reviewDraft: true });
    await settle();
    expect(api.reportUnsaved).toHaveBeenCalledTimes(1);
    release(OK);
    await settle();
    expect(api.reportUnsaved).toHaveBeenCalledTimes(2);
    expect(api.reportUnsaved).toHaveBeenLastCalledWith({ reviewDraft: true });
  });

  it('N14: a refused report (not transient) is not retried; the next change sends again', async () => {
    api.reportUnsaved.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'x' },
    });
    flags.set({ ...NONE, wizard: true });
    await settle();
    jest.advanceTimersByTime(UNSAVED_RETRY_MS * 10);
    await settle();
    expect(api.reportUnsaved).toHaveBeenCalledTimes(1);
    flags.set({ ...NONE, wizard: true, reviewDraft: true });
    await settle();
    expect(api.reportUnsaved).toHaveBeenCalledTimes(2);
    expect(api.reportUnsaved).toHaveBeenLastCalledWith({ wizard: true, reviewDraft: true });
  });

  it(`N14: transient failures are retried at most ${UNSAVED_MAX_RETRIES} times in a row`, async () => {
    api.reportUnsaved.mockResolvedValue(FAIL);
    flags.set({ ...NONE, textEdit: true });
    await settle();
    for (let i = 0; i < UNSAVED_MAX_RETRIES + 3; i++) {
      jest.advanceTimersByTime(UNSAVED_RETRY_MS);
      await settle();
    }
    expect(api.reportUnsaved).toHaveBeenCalledTimes(1 + UNSAVED_MAX_RETRIES);
    // a change starts over (and succeeds)
    api.reportUnsaved.mockResolvedValue(OK);
    flags.set({ ...NONE });
    flags.set({ ...NONE, textEdit: true, wizard: true });
    await settle();
    expect(api.reportUnsaved).toHaveBeenCalledTimes(2 + UNSAVED_MAX_RETRIES);
  });

  it('N14: the retry count resets after a success', async () => {
    api.reportUnsaved.mockResolvedValueOnce(FAIL).mockResolvedValueOnce(OK);
    flags.set({ ...NONE, wizard: true });
    await settle();
    jest.advanceTimersByTime(UNSAVED_RETRY_MS);
    await settle();
    expect(api.reportUnsaved).toHaveBeenCalledTimes(2);
    api.reportUnsaved.mockResolvedValue(FAIL);
    flags.set({ ...NONE });
    await settle();
    for (let i = 0; i < UNSAVED_MAX_RETRIES + 2; i++) {
      jest.advanceTimersByTime(UNSAVED_RETRY_MS);
      await settle();
    }
    expect(api.reportUnsaved).toHaveBeenCalledTimes(3 + UNSAVED_MAX_RETRIES);
  });
});
