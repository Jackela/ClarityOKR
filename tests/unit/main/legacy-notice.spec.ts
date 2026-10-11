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

describe('LegacyDatabaseNotice.acknowledge failures', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'okr-notice-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('returns false and keeps the notice pending while the state cannot be saved, then succeeds on retry', () => {
    new LegacyDatabaseNotice(dir).recordRetired();
    let failing = true;
    const notice = new LegacyDatabaseNotice(dir, (path, content) => {
      if (failing) {
        throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      }
      writeFileSync(path, content);
    });
    expect(notice.acknowledge()).toBe(false);
    expect(notice.acknowledge()).toBe(false);
    expect(notice.shouldShow()).toBe(true);
    expect(new LegacyDatabaseNotice(dir).shouldShow()).toBe(true); // still pending after a restart
    failing = false;
    expect(notice.acknowledge()).toBe(true);
    expect(notice.shouldShow()).toBe(false);
    expect(new LegacyDatabaseNotice(dir).shouldShow()).toBe(false);
  });

  it('acknowledging when nothing is pending succeeds', () => {
    expect(new LegacyDatabaseNotice(dir).acknowledge()).toBe(true);
  });
});

describe('registerLegacyNoticeHandlers', () => {
  it('registers exactly the get and ack channels and replies with plain booleans only', () => {
    const handle = jest.fn();
    const notice = { shouldShow: jest.fn(() => true), acknowledge: jest.fn(() => true) };
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

  it('reports a failed acknowledge as acknowledged:false so the notice can be retried', () => {
    const handle = jest.fn();
    const notice = { shouldShow: jest.fn(() => true), acknowledge: jest.fn(() => false) };
    registerLegacyNoticeHandlers({ handle } as never, notice as unknown as LegacyDatabaseNotice);
    const ack = handle.mock.calls.find(
      (c) => c[0] === IPC_CHANNELS.LEGACY_NOTICE_ACK,
    )![1] as () => unknown;
    expect(ack()).toEqual({ acknowledged: false });
    expect(ack()).toEqual({ acknowledged: false });
    expect(notice.acknowledge).toHaveBeenCalledTimes(2);
  });
});
