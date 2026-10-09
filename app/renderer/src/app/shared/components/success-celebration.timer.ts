import type { ChangeDetectorRef } from '@angular/core';

export interface DismissTimerState {
  remainingTime: number;
  isPaused: boolean;
  dismissTimer?: ReturnType<typeof setTimeout>;
  progressInterval?: ReturnType<typeof setInterval>;
  deadline?: number;
  onDismiss?: DismissCallback;
}

export type DismissCallback = () => void;

export function createDismissTimerState(duration: number): DismissTimerState {
  return { remainingTime: duration, isPaused: false };
}

function scheduleDismiss(state: DismissTimerState): void {
  state.deadline = Date.now() + state.remainingTime;
  state.dismissTimer = setTimeout(() => {
    state.remainingTime = 0;
    state.onDismiss?.();
  }, state.remainingTime);
}

export function startDismissTimer(
  state: DismissTimerState,
  duration: number,
  onDismiss: DismissCallback,
  cdr: ChangeDetectorRef,
): void {
  clearTimers(state);
  state.remainingTime = duration;
  state.isPaused = false;
  state.onDismiss = onDismiss;
  scheduleDismiss(state);
  state.progressInterval = setInterval(() => {
    if (!state.isPaused && state.deadline !== undefined) {
      state.remainingTime = Math.max(0, state.deadline - Date.now());
      cdr.markForCheck();
    }
  }, 100);
}

export function pauseTimer(state: DismissTimerState): void {
  if (state.isPaused || !state.onDismiss || state.deadline === undefined) return;
  state.remainingTime = Math.max(0, state.deadline - Date.now());
  state.isPaused = true;
  if (state.dismissTimer !== undefined) clearTimeout(state.dismissTimer);
  state.dismissTimer = undefined;
}

export function resumeTimer(state: DismissTimerState): void {
  if (!state.isPaused || !state.onDismiss) return;
  state.isPaused = false;
  scheduleDismiss(state);
}

export function clearTimers(state: DismissTimerState): void {
  if (state.dismissTimer !== undefined) clearTimeout(state.dismissTimer);
  if (state.progressInterval !== undefined) clearInterval(state.progressInterval);
  state.dismissTimer = undefined;
  state.progressInterval = undefined;
  state.deadline = undefined;
  state.onDismiss = undefined;
}
