import { jest } from '@jest/globals';
import type { StorageModeName, UnsavedFlags } from '@clarityokr/contracts';
import { AppRestartService } from '@clarityokr/main/lifecycle/restart-service';

const none: UnsavedFlags = { wizard: false, textEdit: false, reviewDraft: false };

function make(mode: StorageModeName, dbHasData: boolean | (() => boolean)) {
  return new AppRestartService({
    getStorageMode: () => mode,
    dbHasData: typeof dbHasData === 'function' ? dbHasData : () => dbHasData,
  });
}

describe('AppRestartService.evaluate (the quit / restart rule)', () => {
  it('nothing to confirm in normal mode without unsaved input', () => {
    expect(make('normal', true).evaluate(none)).toMatchObject({ needsConfirm: false });
  });

  it('memory mode with data asks (memory only)', () => {
    expect(make('memory', true).evaluate(none)).toMatchObject({
      needsConfirm: true,
      reasons: ['memory_data'],
      memoryOnly: true,
    });
  });

  it('memory mode with an empty database does not ask', () => {
    expect(make('memory', false).evaluate(none)).toMatchObject({ needsConfirm: false });
  });

  it('assumes there is data to lose when the database cannot be read', () => {
    const errorSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = make('memory', () => {
      throw new Error('database is closed');
    });
    expect(service.evaluate(none)).toMatchObject({ needsConfirm: true, reasons: ['memory_data'] });
    errorSpy.mockRestore();
  });

  it('combines unsaved input with the memory reason', () => {
    expect(make('memory', true).evaluate({ ...none, textEdit: true })).toMatchObject({
      needsConfirm: true,
      reasons: ['text_edit', 'memory_data'],
      dialogWindow: 'main',
    });
  });
});
