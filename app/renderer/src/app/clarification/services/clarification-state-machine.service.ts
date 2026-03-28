/**
 * Clarification State Machine - Re-export barrel file
 *
 * This module has been refactored into focused sub-modules:
 * - state-types.ts: Core types and constants
 * - state-validator.ts: State transition validation
 * - action-reducer.ts: Pure function state reduction
 * - state-transition-engine.ts: Main state machine with Signals
 *
 * For backward compatibility, ClarificationStateMachine is aliased to StateTransitionEngine.
 *
 * @example
 * ```typescript
 * // Preferred: Import from barrel
 * import { StateTransitionEngine, ClarificationStateMachine } from './clarification-state-machine.service';
 *
 * // Or import specific modules
 * import { StateTransitionEngine } from './state-transition-engine';
 * import { StateValidator } from './state-validator';
 * import { ActionReducer } from './action-reducer';
 * ```
 */

// Re-export all types
export type {
  StateAction,
  ErrorInfo,
  ClarificationState,
} from './state-types.js';

// Re-export WorkflowState from contracts for convenience
export type { WorkflowState } from '@clarityokr/contracts';

// Re-export constants
export { INITIAL_STATE, VALID_TRANSITIONS } from './state-types.js';

// Re-export classes
export { StateValidator } from './state-validator.js';
export { ActionReducer } from './action-reducer.js';
export { StateTransitionEngine } from './state-transition-engine.js';

// Backward compatibility alias
import { StateTransitionEngine } from './state-transition-engine.js';

/**
 * ClarificationStateMachine - Backward compatibility alias
 * @deprecated Use StateTransitionEngine instead
 */
export const ClarificationStateMachine = StateTransitionEngine;

/**
 * ClarificationStateMachine - Backward compatibility alias
 * @deprecated Use StateTransitionEngine instead
 */
export type ClarificationStateMachine = StateTransitionEngine;
// Re-export core logger for services that need it
export type { Logger } from '@core/services/logger.service.js';
