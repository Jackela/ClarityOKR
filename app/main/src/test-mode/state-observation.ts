/**
 * State Observation Module
 *
 * Manages state change subscriptions and notifications.
 */

import { Logger } from '../core/logger.js';
import type { AppState, IStateObservation, TestModeDependencies } from './types.js';

export class StateObservationModule implements IStateObservation {
  private stateSubscribers: Set<(state: AppState) => void> = new Set();

  constructor(private readonly deps: TestModeDependencies) {}

  getCurrentState(): AppState {
    return {
      sessions: this.deps.controller.getAllSessions(),
      currentSessionId: this.deps.controller.getCurrentSessionId(),
      mockResponses: {},
      asyncPaused: false,
    };
  }

  subscribeToStateChanges(callback: (state: AppState) => void): () => void {
    this.stateSubscribers.add(callback);
    return () => this.stateSubscribers.delete(callback);
  }

  notifyStateChange(state?: AppState): void {
    const currentState = state ?? this.getCurrentState();
    this.stateSubscribers.forEach((cb) => {
      try {
        cb(currentState);
      } catch (error) {
        Logger.error('[testMode] Error in state change callback:', error);
      }
    });
  }
}
