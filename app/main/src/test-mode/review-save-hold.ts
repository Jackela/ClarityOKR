/**
 * E2E-only hook: hold and release `clarityokr:review:save` without touching Electron's
 * private `_invokeHandlers` map. Loaded only through the test-mode dynamic import.
 */
import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '@clarityokr/contracts';

import { getClosedLoopInvokeHandler } from '../ipc/closed-loop-handlers.js';

export type ReviewSaveHoldMode = 'ok' | 'fail';

const FAIL_RESULT = {
  ok: false as const,
  error: { code: 'INTERNAL' as const, message: 'Something went wrong' },
};

let armed = false;
let waiting = false;
let releaseWaiting: ((mode: ReviewSaveHoldMode) => void) | null = null;
let installed = false;

export function armReviewSaveHold(): void {
  armed = true;
}

export function disarmReviewSaveHold(): void {
  armed = false;
  if (releaseWaiting) {
    releaseWaiting('ok');
  }
  waiting = false;
  releaseWaiting = null;
}

export function isReviewSaveHeld(): boolean {
  return waiting;
}

export function releaseReviewSave(mode: ReviewSaveHoldMode): void {
  if (!releaseWaiting) {
    throw new Error('review:save is not held');
  }
  releaseWaiting(mode);
}

async function waitIfArmed(): Promise<ReviewSaveHoldMode> {
  if (!armed) {
    return 'ok';
  }
  waiting = true;
  try {
    return await new Promise<ReviewSaveHoldMode>((resolve) => {
      releaseWaiting = resolve;
    });
  } finally {
    waiting = false;
    releaseWaiting = null;
  }
}

/** Wraps the already-registered handler and publishes the hook on `__clarityokrE2E`. */
export function installReviewSaveHoldHook(): void {
  if (installed) {
    return;
  }
  const original = getClosedLoopInvokeHandler(IPC_CHANNELS.REVIEW_SAVE);
  if (!original) {
    throw new Error('review:save is not registered');
  }
  ipcMain.removeHandler(IPC_CHANNELS.REVIEW_SAVE);
  ipcMain.handle(IPC_CHANNELS.REVIEW_SAVE, async (event, payload: unknown) => {
    const mode = await waitIfArmed();
    if (mode === 'fail') {
      return FAIL_RESULT;
    }
    return original(event, payload);
  });
  installed = true;

  const existing =
    (globalThis as { __clarityokrE2E?: Record<string, unknown> }).__clarityokrE2E ?? {};
  (globalThis as { __clarityokrE2E?: Record<string, unknown> }).__clarityokrE2E = {
    ...existing,
    armReviewSaveHold,
    releaseReviewSave,
    isReviewSaveHeld,
  };
}
