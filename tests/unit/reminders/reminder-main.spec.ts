import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { IPC_CHANNELS, REMINDER_INTERVAL_MS } from '@clarityokr/contracts';

import {
  registerReminderHandlers,
  reminderClock,
  startReminderTicks,
} from '../../../app/main/src/reminders/reminder-scheduler.js';
import {
  REMINDER_SETTINGS_FILE_NAME,
  ReminderSettings,
} from '../../../app/main/src/reminders/reminder-settings.js';

describe('#54 reminder settings', () => {
  it('keeps a dismissed quarter across restarts in a local file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rem-'));
    expect(new ReminderSettings(dir).dismiss('2026-Q3')).toBe(true);
    expect(new ReminderSettings(dir).dismissedQuarters()).toEqual(['2026-Q3']);
    expect(readFileSync(join(dir, REMINDER_SETTINGS_FILE_NAME), 'utf8')).toContain('2026-Q3');
  });

  it('in memory mode writes nothing: the dismissal lasts for this run only', () => {
    const settings = new ReminderSettings(null);
    settings.dismiss('2026-Q3');
    expect(settings.dismissedQuarters()).toEqual(['2026-Q3']);
    expect(new ReminderSettings(null).dismissedQuarters()).toEqual([]);
  });

  it('a failed write still holds for this run and reports saved: false', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rem-'));
    const settings = new ReminderSettings(dir, () => {
      throw new Error('disk full');
    });
    expect(settings.dismiss('2026-Q3')).toBe(false);
    expect(settings.dismissedQuarters()).toEqual(['2026-Q3']);
    expect(existsSync(join(dir, REMINDER_SETTINGS_FILE_NAME))).toBe(false);
  });

  it('ignores an unreadable file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rem-'));
    const settings = new ReminderSettings(dir, (path) => {
      writeFileSync(path, '{bad');
    });
    settings.dismiss('2026-Q1');
    expect(new ReminderSettings(dir).dismissedQuarters()).toEqual([]);
  });
});

describe('#54 reminder IPC and ticks', () => {
  const handlers = new Map<string, (event: unknown, payload?: unknown) => unknown>();
  const ipcMain = { handle: (ch: string, fn: never) => handlers.set(ch, fn) };

  it('serves the clock and dismissed quarters, and rejects a bad period', () => {
    const settings = new ReminderSettings(null);
    registerReminderHandlers(ipcMain as never, settings, () => new Date('2026-12-20T00:00:00Z'));
    expect(handlers.get(IPC_CHANNELS.REMINDERS_DISMISS)!({}, { period: 'x' })).toEqual({
      saved: false,
    });
    expect(handlers.get(IPC_CHANNELS.REMINDERS_DISMISS)!({}, { period: '2026-Q4' })).toEqual({
      saved: true,
    });
    expect(handlers.get(IPC_CHANNELS.REMINDERS_GET)!({})).toEqual({
      now: '2026-12-20T00:00:00.000Z',
      dismissedQuarters: ['2026-Q4'],
    });
  });

  it('ticks on focus, resume and every 5 minutes; stop removes all three once', () => {
    const fired: string[] = [];
    let interval = 0;
    const stop = startReminderTicks(
      {
        onFocus: (l) => {
          fired.push('focus');
          l();
          return () => fired.push('-focus');
        },
        onResume: (l) => {
          fired.push('resume');
          l();
          return () => fired.push('-resume');
        },
        setInterval: (_l, ms) => {
          interval = ms;
          return () => fired.push('-interval');
        },
      },
      () => fired.push('tick'),
    );
    expect(fired).toEqual(['focus', 'tick', 'resume', 'tick']);
    expect(interval).toBe(REMINDER_INTERVAL_MS);
    stop();
    stop();
    expect(fired.slice(4)).toEqual(['-focus', '-resume', '-interval']);
  });

  it('a recreated window does not stack timers or listeners', () => {
    let live = 0;
    const triggers = {
      onFocus: () => (live++, () => void live--),
      onResume: () => (live++, () => void live--),
      setInterval: () => (live++, () => void live--),
    };
    const first = startReminderTicks(triggers, () => undefined);
    first(); // window closed
    const second = startReminderTicks(triggers, () => undefined);
    expect(live).toBe(3);
    second();
    expect(live).toBe(0);
  });

  it('fakes the clock only in e2e mode', () => {
    const fake = reminderClock({ E2E_TEST: '1', CLARITYOKR_FAKE_NOW: '2030-01-01T00:00:00Z' });
    expect(fake().getUTCFullYear()).toBe(2030);
    const real = reminderClock({ CLARITYOKR_FAKE_NOW: '2030-01-01T00:00:00Z' });
    expect(real().getUTCFullYear()).toBeLessThan(2030);
  });

  it('never uses a system Notification', () => {
    const src = ['reminder-scheduler.ts', 'reminder-settings.ts']
      .map((f) =>
        readFileSync(new URL(`../../../app/main/src/reminders/${f}`, import.meta.url), 'utf8'),
      )
      .join('\n');
    expect(src).not.toMatch(/new Notification|Notification\(/);
  });
});
