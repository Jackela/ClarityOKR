import { TestBed } from '@angular/core/testing';
import { IPC_CHANNELS } from '@clarityokr/contracts';

import { ClosedLoopApi } from './closed-loop-api.service';

describe('ClosedLoopApi', () => {
  let api: ClosedLoopApi;
  let invoke: jest.Mock;

  beforeEach(() => {
    invoke = jest.fn();
    window.clarifyOkr = { invoke, send: jest.fn(), on: () => jest.fn() };
    api = TestBed.inject(ClosedLoopApi);
  });

  afterEach(() => {
    delete window.clarifyOkr;
  });

  it('sends each call on its whitelisted channel with the request unchanged', async () => {
    invoke.mockResolvedValue({ ok: true, data: {} });
    await api.list();
    await api.open({ okrId: 'a' });
    await api.pin({ okrId: 'a' });
    await api.setPeriod({ okrId: 'a', period: '2026-Q4' });
    await api.setProgress({ krId: 'k', status: 'done', value: 100 });
    await api.revertProgress({ krId: 'k' });
    await api.replaceProgress({ krId: 'k', value: 5 });
    expect(invoke.mock.calls).toEqual([
      [IPC_CHANNELS.OKR_LIST, undefined],
      [IPC_CHANNELS.OKR_OPEN, { okrId: 'a' }],
      [IPC_CHANNELS.OKR_PIN, { okrId: 'a' }],
      [IPC_CHANNELS.OKR_SET_PERIOD, { okrId: 'a', period: '2026-Q4' }],
      [IPC_CHANNELS.KR_SET_PROGRESS, { krId: 'k', status: 'done', value: 100 }],
      [IPC_CHANNELS.KR_REVERT_PROGRESS, { krId: 'k' }],
      [IPC_CHANNELS.KR_REPLACE_PROGRESS, { krId: 'k', value: 5 }],
    ]);
  });

  it('passes a structured failure through untouched', async () => {
    const failure = { ok: false, error: { code: 'NOT_FOUND', message: 'No such OKR' } };
    invoke.mockResolvedValue(failure);
    expect(await api.open({ okrId: 'x' })).toEqual(failure);
  });

  it('turns a rejected invoke, a malformed reply and a missing bridge into INTERNAL failures', async () => {
    invoke.mockRejectedValueOnce(new Error('/secret/path exploded'));
    const rejected = await api.list();
    expect(rejected).toEqual({
      ok: false,
      error: { code: 'INTERNAL', message: 'The request failed' },
    });
    expect(JSON.stringify(rejected)).not.toContain('secret');

    invoke.mockResolvedValueOnce('not an envelope');
    expect(await api.list()).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
    invoke.mockResolvedValueOnce(null);
    expect(await api.list()).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });

    delete window.clarifyOkr;
    expect(await api.list()).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
  });
});
