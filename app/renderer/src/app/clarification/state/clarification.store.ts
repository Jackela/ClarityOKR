/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents */
import { Injectable } from '@angular/core';
import type { ClarificationPrompt } from '@clarityokr/contracts';
import { ComponentStore } from '@ngrx/component-store';
import { map } from 'rxjs';

import {
  clarificationReducer,
  type ClarificationState as StateMachineState,
  type ClarificationEvent,
  type ErrorInfo,
  type OKRDocument,
} from './clarification.state-machine';

/**
 * Workflow state type (backward compatibility alias)
 */
export type WorkflowState = StateMachineState['type'];

/**
 * Internal store state using state machine
 */
interface StoreState {
  machineState: StateMachineState;
  sessionId: string | null;
  selectionsByPromptId: Record<string, string>;
  validationError: string | null;
}

/**
 * Legacy ClarificationState interface (for backward compatibility)
 */
export interface ClarificationState {
  workflowState: WorkflowState;
  sessionId: string | null;
  currentPrompt: ClarificationPrompt | null;
  selectionsByPromptId: Record<string, string>;
  history: ClarificationPrompt[];
  validationError: string | null;
  error: { message: string; recoverable: boolean } | null;
}

const initialState: StoreState = {
  machineState: { type: 'idle' },
  sessionId: null,
  selectionsByPromptId: {},
  validationError: null,
};

/**
 * Helper to get current prompt from machine state
 */
function getCurrentPrompt(machineState: StateMachineState): ClarificationPrompt | null {
  if (machineState.type === 'prompting') {
    return machineState.prompt;
  }
  return null;
}

/**
 * Helper to get history from machine state
 */
function getHistory(machineState: StateMachineState): ClarificationPrompt[] {
  if (machineState.type === 'prompting') {
    return machineState.history;
  }
  if (machineState.type === 'ready' || machineState.type === 'generating') {
    return machineState.context.history;
  }
  return [];
}

/**
 * Helper to get error from machine state
 */
function getError(machineState: StateMachineState): ErrorInfo | null {
  if (machineState.type === 'error') {
    return machineState.error;
  }
  return null;
}

/**
 * Helper to convert StoreState to legacy ClarificationState
 */
function toLegacyState(state: StoreState): ClarificationState {
  return {
    workflowState: state.machineState.type,
    sessionId: state.sessionId,
    currentPrompt: getCurrentPrompt(state.machineState),
    selectionsByPromptId: state.selectionsByPromptId,
    history: getHistory(state.machineState),
    validationError: state.validationError,
    error: getError(state.machineState),
  };
}

@Injectable({ providedIn: 'root' })
export class ClarificationStore extends ComponentStore<StoreState> {
  readonly workflowState$ = this.select((state) => state.machineState.type);

  readonly currentPrompt$ = this.select((state) => getCurrentPrompt(state.machineState));

  readonly history$ = this.select((state) => getHistory(state.machineState));

  readonly validationError$ = this.select((state) => state.validationError);

  readonly error$ = this.select((state) => {
    console.log('[STORE-SELECT] error$ selector called, machineState:', state.machineState.type);
    const error = getError(state.machineState);
    console.log('[STORE-SELECT] error$ selector result:', error);
    return error;
  });

  readonly errorMessage$ = this.select((state) => {
    const error = getError(state.machineState);
    const message = error?.message ?? null;
    console.log('[STORE-SELECT] errorMessage$ selector result:', message);
    return message;
  });

  readonly sessionId$ = this.select((state) => state.sessionId);

  readonly isLoading$ = this.select(
    (state) => state.machineState.type === 'loading' || state.machineState.type === 'generating',
  );

  readonly isReadyToGenerate$ = this.select((state) => {
    // Allow generation in ready state, or in error state if we have at least 1 selection
    const hasSelection = Object.keys(state.selectionsByPromptId).length > 0;
    return (
      state.machineState.type === 'ready' || (state.machineState.type === 'error' && hasSelection)
    );
  });

  readonly hasPrompt$ = this.currentPrompt$.pipe(map((prompt) => prompt !== null));

  readonly currentSelection$ = this.select((state) => {
    const prompt = getCurrentPrompt(state.machineState);
    if (!prompt) return null;
    return state.selectionsByPromptId[prompt.id] ?? null;
  });

  readonly selectionCount$ = this.select((state) => Object.keys(state.selectionsByPromptId).length);

  readonly selectedOptionIds$ = this.select((state) => Object.values(state.selectionsByPromptId));

  constructor() {
    super(initialState);
  }

  /**
   * Core dispatch method for state machine events
   */
  private dispatch(event: ClarificationEvent): void {
    console.log(`[STORE-DISPATCH] Dispatching event: ${event.type}`, event);
    this.setState((state) => {
      console.log(
        `[STORE-DISPATCH] Current state: ${state.machineState.type}, Event: ${event.type}`,
      );
      try {
        const nextMachineState = clarificationReducer(state.machineState, event);
        console.log(
          `[STORE-DISPATCH] State transitioned: ${state.machineState.type} -> ${nextMachineState.type}`,
        );
        return {
          ...state,
          machineState: nextMachineState,
        };
      } catch (error) {
        console.warn(`[STORE-DISPATCH] State transition failed: ${(error as Error).message}`);
        return state;
      }
    });
  }

  readonly reset = this.updater(() => initialState);

  readonly setSessionId = this.updater((state, sessionId: string | null) => ({
    ...state,
    sessionId,
  }));

  /**
   * @deprecated Use setLoading with intent parameter instead
   */
  readonly transitionTo = this.updater((state, nextState: WorkflowState) => {
    console.warn(
      `[store] transitionTo is deprecated. State ${state.machineState.type} -> ${nextState}`,
    );
    return state;
  });

  /**
   * @deprecated Use reset() instead
   */
  readonly forceTransition = this.updater((state, _nextState: WorkflowState) => {
    console.warn('[store] forceTransition is deprecated. Use reset() instead.');
    return state;
  });

  readonly setPrompt = this.updater((state, prompt: ClarificationPrompt) => {
    console.log(
      `[STORE] setPrompt called with prompt: ${prompt.id}, options: ${prompt.options.length}`,
    );
    const optionCount = prompt.options.length;
    if (optionCount < 2 || optionCount > 5) {
      console.error(`[STORE] Invalid option count: ${optionCount}`);
      throw new Error('Clarification prompts must supply between 2 and 5 options.');
    }

    this.dispatch({ type: 'PROMPT_RECEIVED', prompt });

    console.log(`[STORE] setPrompt completed, state updated`);
    return {
      ...state,
      validationError: null,
    };
  });

  readonly recordSelection = this.updater((state, optionId: string) => {
    const machineState = state.machineState;
    const prompt = getCurrentPrompt(machineState);

    if (!prompt) {
      console.warn('[store] recordSelection called with no current prompt');
      return state;
    }

    if (machineState.type !== 'prompting' && machineState.type !== 'ready') {
      console.warn(`[store] recordSelection called in invalid state: ${machineState.type}`);
      return state;
    }

    const optionExists = prompt.options.some((option) => option.id === optionId);
    if (!optionExists) {
      return {
        ...state,
        validationError: `Option ${optionId} was not provided for prompt ${prompt.id}.`,
      };
    }

    const newSelections = { ...state.selectionsByPromptId, [prompt.id]: optionId };
    this.dispatch({ type: 'OPTION_SELECTED', optionId });

    return {
      ...state,
      selectionsByPromptId: newSelections,
      validationError: null,
    };
  });

  readonly setLoading = this.updater((state, intent?: string) => {
    console.log(`[STORE] setLoading called with intent: ${intent ?? 'default'}`);
    console.log(`[STORE] Current state before loading: ${state.machineState.type}`);
    this.dispatch({ type: 'START', intent: intent ?? 'default' });
    console.log(`[STORE] setLoading completed`);
    return state;
  });

  readonly setGenerating = this.updater((state) => {
    this.dispatch({ type: 'GENERATE' });
    return state;
  });

  readonly setCompleted = this.updater((state, okr?: OKRDocument) => {
    this.dispatch({ type: 'OKR_GENERATED', okr: okr ?? { objectives: [] } });
    return state;
  });

  readonly setError = this.updater(
    (state, error: string | { message: string; recoverable: boolean } | null) => {
      console.log(`[STORE-SETERROR] setError called`, {
        error,
        currentState: state.machineState.type,
      });
      const errorObj = typeof error === 'string' ? { message: error, recoverable: true } : error;

      if (errorObj) {
        console.log(`[STORE-SETERROR] Dispatching ERROR event with:`, errorObj);
        this.dispatch({ type: 'ERROR', error: errorObj });
        console.log(`[STORE-SETERROR] ERROR event dispatched`);
      } else {
        console.log(`[STORE-SETERROR] Error is null, skipping dispatch`);
      }

      console.log(`[STORE-SETERROR] setError completed`);
      return state;
    },
  );

  readonly clearError = this.updater((state) => {
    if (state.machineState.type === 'error') {
      // From error state, we can go to idle or loading via START
      // For clearError, let's go to idle
      this.dispatch({ type: 'RESET' });
    }
    return state;
  });

  /**
   * Alias for setLoading - starts a new clarification flow
   * Provides consistent API naming with the action/event system
   */
  readonly start = this.updater((state, intent?: string) => {
    this.dispatch({ type: 'START', intent: intent ?? 'default' });
    return state;
  });

  /**
   * Alias for recordSelection - records an option selection
   * Provides consistent API naming with the action/event system
   */
  readonly selectOption = this.updater((state, optionId: string) => {
    const machineState = state.machineState;
    const prompt = getCurrentPrompt(machineState);

    if (!prompt) {
      console.warn('[store] selectOption called with no current prompt');
      return state;
    }

    if (machineState.type !== 'prompting' && machineState.type !== 'ready') {
      console.warn(`[store] selectOption called in invalid state: ${machineState.type}`);
      return state;
    }

    const optionExists = prompt.options.some((option) => option.id === optionId);
    if (!optionExists) {
      return {
        ...state,
        validationError: `Option ${optionId} was not provided for prompt ${prompt.id}.`,
      };
    }

    this.dispatch({ type: 'OPTION_SELECTED', optionId });

    return {
      ...state,
      selectionsByPromptId: { ...state.selectionsByPromptId, [prompt.id]: optionId },
      validationError: null,
    };
  });

  /**
   * Alias for setError - reports an error with optional recoverability
   * Provides consistent API naming with the action/event system
   */
  readonly reportError = this.updater(
    (state, error: string | { message: string; recoverable: boolean } | null) => {
      const errorObj = typeof error === 'string' ? { message: error, recoverable: true } : error;

      if (errorObj) {
        this.dispatch({ type: 'ERROR', error: errorObj });
      }

      return state;
    },
  );

  readonly setValidationError = this.updater((state, message: string | null) => ({
    ...state,
    validationError: message,
  }));

  /**
   * @deprecated Readiness is now determined automatically by the state machine
   */
  readonly markReady = this.updater((state, _ready: boolean) => {
    console.warn('[store] markReady is deprecated, readiness is determined automatically');
    return state;
  });

  /**
   * Get current state as legacy format (for debugging/testing)
   */
  getStateLegacy(): ClarificationState {
    return toLegacyState(this.get());
  }
}
