import type { ChangeDetectorRef } from '@angular/core';

export interface DismissTimerState {
  remainingTime: number;
  isPaused: boolean;
  dismissTimer?: ReturnType<typeof setTimeout>;
  progressInterval?: ReturnType<typeof setInterval>;
}

export type DismissCallback = () => void;

export function createDismissTimerState(duration: number): DismissTimerState {
  return {
    remainingTime: duration,
    isPaused: false,
    dismissTimer: undefined,
    progressInterval: undefined,
  };
}

export function startDismissTimer(
  state: DismissTimerState,
  duration: number,
  onDismiss: DismissCallback,
  cdr: ChangeDetectorRef,
): void {
  state.remainingTime = duration;

  state.progressInterval = setInterval(() => {
    if (!state.isPaused) {
      state.remainingTime -= 100;
      if (state.remainingTime <= 0) {
        state.remainingTime = 0;
      }
      cdr.markForCheck();
    }
  }, 100);

  state.dismissTimer = setTimeout(() => {
    onDismiss();
  }, duration);
}

export function pauseTimer(state: DismissTimerState): void {
  state.isPaused = true;
}

export function resumeTimer(state: DismissTimerState): void {
  state.isPaused = false;
}

export function clearTimers(state: DismissTimerState): void {
  if (state.dismissTimer) {
    clearTimeout(state.dismissTimer);
    state.dismissTimer = undefined;
  }
  if (state.progressInterval) {
    clearInterval(state.progressInterval);
    state.progressInterval = undefined;
  }
}
