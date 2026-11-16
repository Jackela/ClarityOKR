import type { ClarificationPrompt } from '@clarityokr/contracts';

import type { Logger } from '../../core/services/logger.service';
import type { ClarificationState, ErrorInfo, StateAction } from './clarification-state.types.js';

export type ClarificationDispatch = (action: StateAction) => void;

/**
 * Command helpers that log and dispatch state-machine actions.
 * Behavior matches the original ClarificationStateMachine methods; the
 * Injectable class keeps the same public method signatures and delegates here.
 */
export function createClarificationEffects(dispatch: ClarificationDispatch, logger: Logger) {
  return {
    /**
     * Starts a new clarification workflow with the user's initial intent.
     *
     * Transitions the state machine from 'idle' to 'loading' and records
     * the user's goal. This clears any previous session state.
     */
    start(intent: string): void {
      logger.debug('[STATE-MACHINE] Action: START', { intent });
      dispatch({ type: 'START', payload: { intent } });
    },

    /**
     * Sets the current clarification prompt for user interaction.
     *
     * Transitions from 'loading' to 'prompting' state. The prompt contains
     * a question and mutually exclusive options for the user to choose from.
     */
    setPrompt(prompt: ClarificationPrompt | null): void {
      logger.debug('[STATE-MACHINE] Action: SET_PROMPT', { promptId: prompt?.id ?? 'null' });
      dispatch({ type: 'SET_PROMPT', payload: { prompt } });
    },

    /**
     * Sets the loading state for async operations.
     *
     * @param loading - Whether loading is active
     * @param intent - Optional intent to set when starting loading (only used when loading is true)
     */
    setLoading(loading: boolean, intent?: string): void {
      logger.debug('[STATE-MACHINE] Action: SET_LOADING', { loading, intent });
      dispatch({ type: 'SET_LOADING', payload: { loading } });
      if (loading && intent) {
        dispatch({ type: 'SET_INTENT', payload: { intent } });
      }
    },

    /**
     * Sets an error state with optional recovery capability.
     * A string is treated as a recoverable error; an ErrorInfo is used as-is.
     */
    setError(error: string | ErrorInfo | null): void {
      logger.debug('[STATE-MACHINE] Action: SET_ERROR', { error });
      const errorInfo = typeof error === 'string' ? { message: error, recoverable: true } : error;
      dispatch({ type: 'SET_ERROR', payload: { error: errorInfo } });
    },

    /** Clears the current error state, recovering to 'idle' when in 'error'. */
    clearError(): void {
      logger.debug('[STATE-MACHINE] Action: CLEAR_ERROR');
      dispatch({ type: 'CLEAR_ERROR' });
    },

    /**
     * Records a user's selection for a specific prompt.
     * Stores the selection and automatically checks if enough context
     * has been gathered to generate OKRs (at least one selection).
     */
    recordSelection(promptId: string, optionId: string): void {
      logger.debug('[STATE-MACHINE] Action: RECORD_SELECTION', { promptId, optionId });
      dispatch({ type: 'RECORD_SELECTION', payload: { promptId, optionId } });
    },

    /** Sets the session ID for the current clarification session. */
    setSessionId(sessionId: string | null): void {
      logger.debug('[STATE-MACHINE] Action: SET_SESSION_ID', { sessionId });
      dispatch({ type: 'SET_SESSION_ID', payload: { sessionId } });
    },

    /** Sets a validation error for form input without entering the error workflow state. */
    setValidationError(message: string | null): void {
      logger.debug('[STATE-MACHINE] Action: SET_VALIDATION_ERROR', { message });
      dispatch({ type: 'SET_VALIDATION_ERROR', payload: { message } });
    },

    /** Updates the user intent description. */
    setIntent(intent: string): void {
      logger.debug('[STATE-MACHINE] Action: SET_INTENT', { intent });
      dispatch({ type: 'SET_INTENT', payload: { intent } });
    },

    /** Transitions to the generating state and shows loading. */
    setGenerating(): void {
      logger.debug('[STATE-MACHINE] Action: SET_GENERATING');
      dispatch({ type: 'SET_GENERATING' });
    },

    /** Marks the clarification workflow as completed. */
    setCompleted(okr?: { objectives: unknown[] }): void {
      logger.debug('[STATE-MACHINE] Action: SET_COMPLETED', { okr });
      dispatch({ type: 'SET_COMPLETED', payload: { okr } });
    },

    /**
     * #116 (S3§12.9): puts a wizard draft back as it was left, from the saved questions and answers
     * only (no model call, no loading state). The last step is shown; `ready` shows the
     * 「可以生成」 screen instead.
     */
    restore(payload: Extract<StateAction, { type: 'RESTORE' }>['payload']): void {
      logger.debug('[STATE-MACHINE] Action: RESTORE', { steps: payload.steps.length });
      dispatch({ type: 'RESTORE', payload });
    },

    /** #116: puts back a snapshot taken before a restore (S3-05 rollback). */
    loadSnapshot(state: ClarificationState): void {
      dispatch({ type: 'LOAD_SNAPSHOT', payload: { state } });
    },

    /** Resets the state machine to initial state. */
    reset(): void {
      logger.debug('[STATE-MACHINE] Action: RESET');
      dispatch({ type: 'RESET' });
    },
  };
}

export type ClarificationEffects = ReturnType<typeof createClarificationEffects>;
