/** Controls completion of real queued asynchronous operations. */
import { Logger } from '../core/logger.js';
import type { IAsyncControl } from './types.js';
import type { StateObservationModule } from './state-observation.js';

export class AsyncControlModule implements IAsyncControl {
  private asyncPaused = false;
  private draining = false;
  private asyncQueue: Array<() => Promise<void>> = [];
  private asyncResolvers = new Set<() => void>();

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

  private isIdle(): boolean {
    return !this.asyncPaused && !this.draining && this.asyncQueue.length === 0;
  }

  async waitForAsyncOperations(timeout = 30000): Promise<void> {
    if (this.isIdle()) return;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeoutId);
        this.asyncResolvers.delete(finish);
      };
      const finish = () => {
        if (this.isIdle()) {
          cleanup();
          resolve();
        }
      };
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for async operations after ${timeout}ms`));
      }, timeout);
      this.asyncResolvers.add(finish);
    });
  }

  private async drainAsyncQueue(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (!this.asyncPaused && this.asyncQueue.length > 0) {
        const op = this.asyncQueue.shift();
        if (op) {
          try {
            await op();
          } catch (error) {
            Logger.error('[testMode] Error in async operation:', error);
          }
        }
      }
    } finally {
      this.draining = false;
      [...this.asyncResolvers].forEach((finish) => finish());
    }
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
