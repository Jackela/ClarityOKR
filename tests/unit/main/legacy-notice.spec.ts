import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jest } from '@jest/globals';
import { IPC_CHANNELS } from '@clarityokr/contracts';

import {
  LEGACY_NOTICE_FILE_NAME,
  LegacyDatabaseNotice,
  registerLegacyNoticeHandlers,
} from '@clarityokr/main/startup/legacy-notice';

describe('LegacyDatabaseNotice', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'okr-notice-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('is absent by default, present after recordRetired, absent after acknowledge — across instances', () => {
    expect(new LegacyDatabaseNotice(dir).shouldShow()).toBe(false);
    new LegacyDatabaseNotice(dir).recordRetired();
    expect(new LegacyDatabaseNotice(dir).shouldShow()).toBe(true);
    new LegacyDatabaseNotice(dir).acknowledge();
    expect(new LegacyDatabaseNotice(dir).shouldShow()).toBe(false);
  });

  it('treats a corrupt state file as already shown', () => {
    writeFileSync(join(dir, LEGACY_NOTICE_FILE_NAME), 'garbage');
    expect(new LegacyDatabaseNotice(dir).shouldShow()).toBe(false);
  });

  it('does not throw when the state cannot be written', () => {
    const notice = new LegacyDatabaseNotice(join(dir, 'file-not-dir', 'x'));
    writeFileSync(join(dir, 'file-not-dir'), 'a file where a directory is needed');
    expect(() => notice.recordRetired()).not.toThrow();
    expect(notice.shouldShow()).toBe(false);
  });
});

describe('registerLegacyNoticeHandlers', () => {
  it('registers exactly the get and ack channels and replies with plain booleans only', () => {
    const handle = jest.fn();
    const notice = { shouldShow: jest.fn(() => true), acknowledge: jest.fn() };
    registerLegacyNoticeHandlers({ handle } as never, notice as unknown as LegacyDatabaseNotice);
    expect(handle.mock.calls.map((c) => c[0]).sort()).toEqual(
      [IPC_CHANNELS.LEGACY_NOTICE_GET, IPC_CHANNELS.LEGACY_NOTICE_ACK].sort(),
    );
    const get = handle.mock.calls.find((c) => c[0] === IPC_CHANNELS.LEGACY_NOTICE_GET)![1] as (
      ...args: unknown[]
    ) => unknown;
    const ack = handle.mock.calls.find((c) => c[0] === IPC_CHANNELS.LEGACY_NOTICE_ACK)![1] as (
      ...args: unknown[]
    ) => unknown;
    // payloads from the renderer are ignored
    expect(get({}, { path: '/etc/passwd' })).toEqual({ legacyDatabaseRetired: true });
    expect(ack({}, 'whatever')).toEqual({ acknowledged: true });
    expect(notice.acknowledge).toHaveBeenCalledTimes(1);
  });
});
