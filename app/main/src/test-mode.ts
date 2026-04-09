/**
 * TestMode API for E2E testing
 *
 * Facade module - implementation split across test-mode/ directory
 * for better maintainability.
 *
 * Provides programmatic control over application state for test scenarios:
 * - Reset state without restarting the app
 * - Inject mock data
 * - Control async operations
 * - Observe internal state changes
 */

export type {
  AppState,
  TestModeAPI,
  IStateReset,
  ISessionControl,
  IMockControl,
  IStateObservation,
  IAsyncControl,
  IOkrControl,
  TestModeDependencies,
} from './test-mode/types.js';

export { TestMode } from './test-mode/test-mode-impl.js';
export { initializeTestMode, getTestMode, isTestModeEnabled } from './test-mode/global.js';
export { StateObservationModule } from './test-mode/state-observation.js';
export { AsyncControlModule } from './test-mode/async-control.js';
export { MockControlModule, OkrControlModule } from './test-mode/mock-and-okr-control.js';
export { SessionControlModule, StateResetModule } from './test-mode/session-and-reset.js';
