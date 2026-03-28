import type { Logger } from '@core/services/logger.service';
import { environment } from '@env/environment.js';
import type { ClarificationState, WorkflowState } from './state-types.js';
import { VALID_TRANSITIONS } from './state-types.js';

/**
 * StateValidator - Validates state transitions for the clarification workflow
 *
 * Responsible for:
 * - Checking if transitions between workflow states are valid
 * - Enforcing state machine rules
 * - Logging transition attempts and failures
 *
 * @example
 * ```typescript
 * const validator = new StateValidator(logger);
 * const isValid = validator.canTransition(currentState, targetState);
 * const newState = validator.validateTransition(oldState, proposedState);
 * ```
 */
export class StateValidator {
  constructor(private readonly logger: Logger) {}

  /**
   * Checks if can transition from current state to target state.
   * @param currentState - The current workflow state
   * @param targetState - The target state
   * @returns Whether transition is allowed
   */
  canTransition(currentState: WorkflowState, targetState: WorkflowState): boolean {
    if (currentState === targetState) {
      return true;
    }
    const allowedTransitions = VALID_TRANSITIONS[currentState];
    return allowedTransitions.includes(targetState);
  }

  /**
   * Validates state transition.
   * Throws error in development if transition is invalid.
   * Returns old state in production to prevent crashes.
   *
   * @param oldState - Old state
   * @param newState - New state
   * @returns New state (or old state if transition invalid in production)
   */
  validateTransition(
    oldState: ClarificationState,
    newState: ClarificationState,
  ): ClarificationState {
    if (oldState.workflowState === newState.workflowState) {
      return newState;
    }

    const allowedTransitions = VALID_TRANSITIONS[oldState.workflowState];
    if (!allowedTransitions.includes(newState.workflowState)) {
      const error = `Invalid state transition: ${oldState.workflowState} -> ${newState.workflowState}`;
      this.logger.error('[STATE-MACHINE]', error);
      // Throw error in development, fall back to old state in production
      if (!environment.production) {
        throw new Error(error);
      }
      return oldState;
    }

    this.logger.info(
      '[STATE-MACHINE] Transition:',
      `${oldState.workflowState} -> ${newState.workflowState}`,
    );
    return newState;
  }
}
