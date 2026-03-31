import type { Logger } from '@core/services/logger.service';
import type { ClarificationState, StateAction } from './state-types.js';
import { INITIAL_STATE } from './state-types.js';
import type { StateValidator } from './state-validator.js';

/**
 * ActionReducer - Pure function reducer for state transitions
 *
 * Responsible for:
 * - Processing all state actions
 * - Calculating new state based on action type
 * - Auto-calculating derived values (like isReadyToGenerate)
 * - Delegating transition validation to StateValidator
 *
 * Core rules:
 * 1. Validate if state transition is valid (via StateValidator)
 * 2. Calculate new state based on action
 * 3. Auto-calculate derived values (like isReadyToGenerate)
 *
 * @example
 * ```typescript
 * const reducer = new ActionReducer(logger, validator);
 * const newState = reducer.reduce(currentState, action);
 * ```
 */
export class ActionReducer {
  constructor(
    private readonly logger: Logger,
    private readonly validator: StateValidator,
  ) {}

  /**
   * Reducer - Pure function, handles all state transitions
   * @param state - Current state
   * @param action - Action to execute
   * @returns New state
   */
  reduce(state: ClarificationState, action: StateAction): ClarificationState {
    this.logger.debug('[STATE-MACHINE] Reducer processing:', action.type);

    switch (action.type) {
      case 'START': {
        const newState: ClarificationState = {
          ...INITIAL_STATE,
          workflowState: 'loading',
          isLoading: true,
          intent: action.payload.intent,
        };
        return this.validator.validateTransition(state, newState);
      }

      case 'SET_PROMPT': {
        const { prompt } = action.payload;
        if (!prompt) {
          return { ...state, currentPrompt: null };
        }
        const newState: ClarificationState = {
          ...state,
          currentPrompt: prompt,
          isLoading: false,
          workflowState: 'prompting',
          history: [...state.history, prompt],
        };
        return this.validator.validateTransition(state, newState);
      }

      case 'SET_LOADING': {
        const { loading } = action.payload;
        const newWorkflowState = loading ? 'loading' : state.workflowState;
        return {
          ...state,
          isLoading: loading,
          workflowState: newWorkflowState,
          ...(loading && { validationError: null }),
        };
      }

      case 'SET_ERROR': {
        const { error } = action.payload;
        if (!error) {
          return { ...state, error: null };
        }
        const newState: ClarificationState = {
          ...state,
          error,
          isLoading: false,
          workflowState: 'error',
        };
        return this.validator.validateTransition(state, newState);
      }

      case 'CLEAR_ERROR': {
        const newWorkflowState = state.workflowState === 'error' ? 'idle' : state.workflowState;
        return {
          ...state,
          error: null,
          workflowState: newWorkflowState,
        };
      }

      case 'RECORD_SELECTION': {
        const { promptId, optionId } = action.payload;
        const newSelections = { ...state.selections, [promptId]: optionId };
        const selectionCount = Object.keys(newSelections).length;

        // Auto-calculate ready state: at least 1 selection means ready
        const isReadyToGenerate = selectionCount >= 1;
        const newWorkflowState = isReadyToGenerate ? 'ready' : state.workflowState;

        return {
          ...state,
          selections: newSelections,
          isReadyToGenerate,
          workflowState: newWorkflowState,
          validationError: null,
        };
      }

      case 'SET_SESSION_ID': {
        return { ...state, sessionId: action.payload.sessionId };
      }

      case 'SET_VALIDATION_ERROR': {
        return { ...state, validationError: action.payload.message };
      }

      case 'SET_INTENT': {
        return { ...state, intent: action.payload.intent };
      }

      case 'SET_GENERATING': {
        const newState: ClarificationState = {
          ...state,
          isLoading: true,
          workflowState: 'generating',
        };
        return this.validator.validateTransition(state, newState);
      }

      case 'SET_COMPLETED': {
        const newState: ClarificationState = {
          ...state,
          isLoading: false,
          workflowState: 'completed',
        };
        return this.validator.validateTransition(state, newState);
      }

      case 'RESET': {
        return INITIAL_STATE;
      }

      default:
        return state;
    }
  }
}
