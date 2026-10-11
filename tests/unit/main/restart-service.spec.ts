import { jest } from '@jest/globals';
import type { StorageModeName, UnsavedFlags } from '@clarityokr/contracts';
import { AppRestartService } from '@clarityokr/main/lifecycle/restart-service';

const none: UnsavedFlags = { wizard: false, textEdit: false, reviewDraft: false };

function make(mode: StorageModeName, dbHasData: boolean | (() => boolean)) {
  const relaunch = jest.fn();
  const service = new AppRestartService({
    getStorageMode: () => mode,
    dbHasData: typeof dbHasData === 'function' ? dbHasData : () => dbHasData,
    relaunch,
  });
  return { service, relaunch };
}

describe('AppRestartService', () => {
  it('relaunches straight away when nothing needs confirming', () => {
    const { service, relaunch } = make('normal', true);
    expect(service.requestRestart({ unsaved: none })).toEqual({ outcome: 'restarting' });
    expect(relaunch).toHaveBeenCalledTimes(1);
  });

  it('asks in memory mode with data and relaunches only after confirmation', () => {
    const { service, relaunch } = make('memory', true);
    const reply = service.requestRestart({ unsaved: none });
    expect(reply).toMatchObject({
      outcome: 'confirm_required',
      confirmation: { reasons: ['memory_data'] },
    });
    expect(relaunch).not.toHaveBeenCalled();
    expect(service.requestRestart({ unsaved: none, confirmed: false })).toMatchObject({
      outcome: 'confirm_required',
    });
    expect(service.requestRestart({ unsaved: none, confirmed: true })).toEqual({
      outcome: 'restarting',
    });
    expect(relaunch).toHaveBeenCalledTimes(1);
  });

  it('does not ask in memory mode when the database is empty', () => {
    const { service, relaunch } = make('memory', false);
    expect(service.requestRestart({ unsaved: none })).toEqual({ outcome: 'restarting' });
    expect(relaunch).toHaveBeenCalledTimes(1);
  });

  it('relaunches only once even if asked repeatedly', () => {
    const { service, relaunch } = make('normal', false);
    service.requestRestart({ unsaved: none });
    service.requestRestart({ unsaved: none });
    expect(relaunch).toHaveBeenCalledTimes(1);
  });

  it('assumes there is data to lose when the database cannot be read', () => {
    const { service, relaunch } = make('memory', () => {
      throw new Error('database is closed');
    });
    expect(service.requestRestart({ unsaved: none })).toMatchObject({
      outcome: 'confirm_required',
    });
    expect(relaunch).not.toHaveBeenCalled();
  });

  it('evaluate() exposes the same decision for the quit path', () => {
    const { service } = make('memory', true);
    expect(service.evaluate({ ...none, textEdit: true })).toMatchObject({
      needsConfirm: true,
      reasons: ['text_edit', 'memory_data'],
      dialogWindow: 'main',
    });
  });

  it('resets the restarting flag when relaunch throws and reports a categorised failure', () => {
    const relaunch = jest
      .fn<() => void>()
      .mockImplementationOnce(() => {
        throw new Error('spawn failed at /secret/path');
      })
      .mockImplementation(() => undefined);
    const service = new AppRestartService({
      getStorageMode: () => 'memory',
      dbHasData: () => true,
      relaunch,
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const failed = service.requestRestart({ unsaved: none, confirmed: true });
    expect(failed).toEqual({ outcome: 'failed', category: 'relaunch_failed' });
    expect(JSON.stringify(failed)).not.toContain('secret');

    // a later call is evaluated normally (not "restarting"): memory data asks again…
    expect(service.requestRestart({ unsaved: none })).toMatchObject({
      outcome: 'confirm_required',
    });
    expect(relaunch).toHaveBeenCalledTimes(1);
    // …and once confirmed it relaunches, after which repeated calls collapse
    expect(service.requestRestart({ unsaved: none, confirmed: true })).toEqual({
      outcome: 'restarting',
    });
    expect(service.requestRestart({ unsaved: none })).toEqual({ outcome: 'restarting' });
    expect(relaunch).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });
});
