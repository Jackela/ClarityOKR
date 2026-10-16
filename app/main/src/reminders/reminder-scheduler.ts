import { IPC_CHANNELS, isPeriod, REMINDER_INTERVAL_MS } from '@clarityokr/contracts';
import type { IpcMain } from 'electron';

import type { ReminderSettings } from './reminder-settings.js';

/** e2e may fake the clock: `CLARITYOKR_FAKE_NOW` (ISO) shifts "now" by a fixed offset. */
export function reminderClock(env: NodeJS.ProcessEnv = process.env): () => Date {
  const fake = env.E2E_TEST ? Date.parse(env.CLARITYOKR_FAKE_NOW ?? '') : NaN;
  if (Number.isNaN(fake)) return () => new Date();
  const offset = fake - Date.now();
  return () => new Date(Date.now() + offset);
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
