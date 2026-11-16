/**
 * E2E-only hook: count successful `clarityokr:reminders:take-review` hand-overs
 * without touching Electron's private `_invokeHandlers` map. Loaded only through
 * the test-mode dynamic import.
 */
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@clarityokr/contracts';

import { getTakeReviewInvokeHandler } from '../reminders/review-handoff.js';

let count = 0;
let installed = false;

export function resetTakeReviewCount(): void {
  count = 0;
}

export function getTakeReviewCount(): number {
  return count;
}

/** Wraps the already-registered handler and publishes the hook on `__clarityokrE2E`. */
export function installTakeReviewCountHook(): void {
  if (installed) {
    return;
  }
  const original = getTakeReviewInvokeHandler();
  if (!original) {
    throw new Error('reminders:take-review is not registered');
  }
  ipcMain.removeHandler(IPC_CHANNELS.REMINDERS_TAKE_REVIEW);
  ipcMain.handle(IPC_CHANNELS.REMINDERS_TAKE_REVIEW, (event, ...args) => {
    const reply = original(event, ...args);
    if (reply.okrId) {
      count += 1;
    }
    return reply;
  });
  installed = true;

  const existing =
    (globalThis as { __clarityokrE2E?: Record<string, unknown> }).__clarityokrE2E ?? {};
  (globalThis as { __clarityokrE2E?: Record<string, unknown> }).__clarityokrE2E = {
    ...existing,
    resetTakeReviewCount,
    getTakeReviewCount,
  };
}
