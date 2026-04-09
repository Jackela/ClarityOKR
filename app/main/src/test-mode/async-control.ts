/**
 * Async Control Module
 *
 * Manages async operation pausing, resuming, and queueing.
 */

import { Logger } from '../core/logger.js';
import type { IAsyncControl } from './types.js';
import type { StateObservationModule } from './state-observation.js';

export class AsyncControlModule implements IAsyncControl {
  private asyncPaused = false;
  private asyncQueue: Array<() => Promise<void>> = [];
  private asyncResolvers: Array<() => void> = [];

  constructor(private readonly stateObserver: StateObservationModule) {}

  pauseAsyncOperations(): void {
    this.asyncPaused = true;
    this.stateObserver.notifyStateChange();
    Logger.info('[testMode] Async operations paused');
  }

  resumeAsyncOperations(): void {
    this.asyncPaused = false;
    void this.drainAsyncQueue();
    this.stateObserver.notifyStateChange();
    Logger.info('[testMode] Async operations resumed');
  }

  async waitForAsyncOperations(timeout = 30000): Promise<void> {
    if (!this.asyncPaused && this.asyncQueue.length === 0) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for async operations after ${timeout}ms`));
      }, timeout);

      const checkInterval = setInterval(() => {
        if (!this.asyncPaused && this.asyncQueue.length === 0) {
          clearInterval(checkInterval);
          clearTimeout(timeoutId);
          resolve();
        }
      }, 100);

      this.asyncResolvers.push(() => {
        if (this.asyncQueue.length === 0) {
          clearInterval(checkInterval);
          clearTimeout(timeoutId);
          resolve();
        }
      });
    });
  }

  private async drainAsyncQueue(): Promise<void> {
    while (this.asyncQueue.length > 0) {
      const op = this.asyncQueue.shift();
      if (op) {
        try {
          await op();
        } catch (error) {
          Logger.error('[testMode] Error in async operation:', error);
        }
      }
    }

    this.asyncResolvers.forEach((resolve) => resolve());
    this.asyncResolvers = [];
  }

  enqueueIfPaused(operation: () => Promise<void>): boolean {
    if (this.asyncPaused) {
      this.asyncQueue.push(operation);
      return true;
    }
    return false;
  }

  isPaused(): boolean {
    return this.asyncPaused;
  }
}
