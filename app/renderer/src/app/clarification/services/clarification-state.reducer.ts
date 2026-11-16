import type { Logger } from '../../core/services/logger.service';
import { environment } from '../../../environments/environment';
import {
  type ClarificationState,
  type StateAction,
} from './clarification-state.types.js';
import { INITIAL_STATE, VALID_TRANSITIONS } from './clarification-state.constants.js';

/**
 * Validates a state transition according to the state machine rules.
 *
 * Checks if the transition from oldState to newState is allowed.
 * In development, throws an error for invalid transitions.
 * In production, falls back to the old state gracefully.
 *
 * @param oldState - The current state before transition
 * @param newState - The proposed new state
 * @param logger - Service for debug and error logging
 * @returns The new state if valid, or old state if invalid (in production)
 * @throws Error in development mode if transition is invalid
 */
export function validateClarificationTransition(
  oldState: ClarificationState,
  newState: ClarificationState,
  logger: Logger,
): ClarificationState {
  if (oldState.workflowState === newState.workflowState) {
    return newState;
  }

  const allowedTransitions = VALID_TRANSITIONS[oldState.workflowState];
  if (!allowedTransitions.includes(newState.workflowState)) {
    const error = `Invalid state transition: ${oldState.workflowState} -> ${newState.workflowState}`;
    logger.error('[STATE-MACHINE]', error);
    // Throw error in development, fall back to old state in production
    if (!environment.production) {
      throw new Error(error);
    }
    return oldState;
  }

  logger.info(
    '[STATE-MACHINE] Transition:',
    `${oldState.workflowState} -> ${newState.workflowState}`,
  );
  return newState;
}

/**
 * Reducer - Pure function that processes all state transitions.
 *
 * Core rules:
 * 1. Validates state transitions for legality
 * 2. Computes new state based on action
 * 3. Automatically computes derived values (like isReadyToGenerate)
 *
 * @param state - Current state
 * @param action - Action to process
 * @param logger - Service for debug and error logging
 * @returns New state
 */
export function reduceClarificationState(
  state: ClarificationState,
  action: StateAction,
  logger: Logger,
): ClarificationState {
  logger.debug('[STATE-MACHINE] Reducer processing:', action.type);

  switch (action.type) {
    case 'START': {
      const newState: ClarificationState = {
        ...INITIAL_STATE,
        workflowState: 'loading',
        isLoading: true,
        intent: action.payload.intent,
      };
      return validateClarificationTransition(state, newState, logger);
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
      return validateClarificationTransition(state, newState, logger);
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
      return validateClarificationTransition(state, newState, logger);
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

      // 自动计算就绪状态: 至少1个选择即为ready
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
      return validateClarificationTransition(state, newState, logger);
    }

    case 'SET_COMPLETED': {
      const newState: ClarificationState = {
        ...state,
        isLoading: false,
        workflowState: 'completed',
      };
      return validateClarificationTransition(state, newState, logger);
    }

    case 'RESTORE': {
      const { intent, sessionId, steps, ready } = action.payload;
      const history = steps.map((s) => s.prompt);
      const selections: Record<string, string> = {};
      for (const s of steps) if (s.selectedOptionId) selections[s.prompt.id] = s.selectedOptionId;
      const answered = Object.keys(selections).length > 0;
      const last = steps.at(-1);
      return {
        ...INITIAL_STATE,
        intent,
        sessionId,
        history,
        selections,
        isReadyToGenerate: answered,
        currentPrompt: ready ? null : (last?.prompt ?? null),
        workflowState: ready || last?.selectedOptionId ? 'ready' : 'prompting',
      };
    }

    case 'LOAD_SNAPSHOT': {
      return action.payload.state;
    }

    case 'RESET': {
      return INITIAL_STATE;
    }

    default:
      return state;
  }
}
