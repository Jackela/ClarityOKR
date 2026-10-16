import { IPC_CHANNELS, isPeriod, REMINDER_INTERVAL_MS } from '@clarityokr/contracts';
import type { IpcMain } from 'electron';

import type { ReminderSettings } from './reminder-settings.js';

/**
 * The reminder clock. e2e only (`E2E_TEST`): `CLARITYOKR_FAKE_NOW` (ISO) at launch, or
 * `globalThis.__CLARITYOKR_FAKE_NOW__` set later from the test, moves "now"; the fake time then
 * runs on with the real clock.
 */
export function reminderClock(
  env: NodeJS.ProcessEnv = process.env,
  realNow: () => number = Date.now,
): () => Date {
  if (!env.E2E_TEST) return () => new Date(realNow());
  const holder = globalThis as { __CLARITYOKR_FAKE_NOW__?: string };
  let source = env.CLARITYOKR_FAKE_NOW ?? '';
  let offset = 0;
  const sync = (value: string): void => {
    source = value;
    const fake = Date.parse(value);
    offset = Number.isNaN(fake) ? 0 : fake - realNow();
  };
  sync(source);
  return () => {
    const live = holder.__CLARITYOKR_FAKE_NOW__;
    if (typeof live === 'string' && live !== source) sync(live);
    return new Date(realNow() + offset);
  };
}

export function registerReminderHandlers(
  ipcMain: Pick<IpcMain, 'handle'>,
  settings: ReminderSettings,
  clock: () => Date,
): void {
  ipcMain.handle(IPC_CHANNELS.REMINDERS_GET, () => ({
    now: clock().toISOString(),
    dismissedQuarters: settings.dismissedQuarters(),
  }));
  ipcMain.handle(IPC_CHANNELS.REMINDERS_DISMISS, (_event, payload: { period?: unknown }) => {
    if (!isPeriod(payload?.period)) return { saved: false };
    return { saved: settings.dismiss(payload.period) };
  });
}

/** Each trigger returns the function that removes it. */
export interface ReminderTriggers {
  onFocus(listener: () => void): () => void;
  onResume(listener: () => void): () => void;
  setInterval(listener: () => void, ms: number): () => void;
}

/**
 * Asks the renderer to re-evaluate on window focus, powerMonitor resume and every 5 minutes
 * (startup is the renderer's own first read). Reminders stay inside the app: never a system
 * Notification (S1§11).
 */
export function startReminderTicks(triggers: ReminderTriggers, send: () => void): () => void {
  const stops = [
    triggers.onFocus(send),
    triggers.onResume(send),
    triggers.setInterval(send, REMINDER_INTERVAL_MS),
  ];
  let stopped = false;
  // Call when the window goes away, so a recreated window does not stack timers / listeners.
  return () => {
    if (stopped) return;
    stopped = true;
    for (const stop of stops) stop();
  };
}
