import { Injectable } from '@angular/core';
import type { ClarificationPrompt } from '@clarityokr/contracts';
import { ComponentStore } from '@ngrx/component-store';
import { map } from 'rxjs';

export type WorkflowState =
  | 'idle'
  | 'loading'
  | 'prompting'
  | 'ready'
  | 'generating'
  | 'completed'
  | 'error';

export interface ClarificationState {
  workflowState: WorkflowState;
  sessionId: string | null;
  currentPrompt: ClarificationPrompt | null;
  selectionsByPromptId: Record<string, string>;
  history: ClarificationPrompt[];
  validationError: string | null;
  error: { message: string; recoverable: boolean } | null;
}

const initialState: ClarificationState = {
  workflowState: 'idle',
  sessionId: null,
  currentPrompt: null,
  selectionsByPromptId: {},
  history: [],
  validationError: null,
  error: null,
};

const VALID_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  idle: ['loading'],
  loading: ['prompting', 'error'],
  prompting: ['loading', 'ready', 'error'],
  ready: ['generating', 'prompting'],
  generating: ['completed', 'error'],
  completed: ['loading'],
  error: ['loading', 'idle'],
};

@Injectable({ providedIn: 'root' })
export class ClarificationStore extends ComponentStore<ClarificationState> {
  readonly workflowState$ = this.select((state) => state.workflowState);
  readonly currentPrompt$ = this.select((state) => state.currentPrompt);
  readonly history$ = this.select((state) => state.history);
  readonly validationError$ = this.select((state) => state.validationError);
  readonly error$ = this.select((state) => state.error);
  readonly errorMessage$ = this.select((state) => state.error?.message ?? null);
  readonly sessionId$ = this.select((state) => state.sessionId);

  readonly isLoading$ = this.select(
    (state) => state.workflowState === 'loading' || state.workflowState === 'generating',
  );

  readonly isReadyToGenerate$ = this.select((state) => state.workflowState === 'ready');

  readonly hasPrompt$ = this.currentPrompt$.pipe(map((prompt) => prompt !== null));

  readonly currentSelection$ = this.select((state) => {
    if (!state.currentPrompt) return null;
    return state.selectionsByPromptId[state.currentPrompt.id] ?? null;
  });

  readonly selectionCount$ = this.select((state) => Object.keys(state.selectionsByPromptId).length);

  readonly selectedOptionIds$ = this.select((state) => Object.values(state.selectionsByPromptId));

  constructor() {
    super(initialState);
  }

  private isValidTransition(from: WorkflowState, to: WorkflowState): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  readonly reset = this.updater(() => initialState);

  readonly setSessionId = this.updater((state, sessionId: string | null) => ({
    ...state,
    sessionId,
  }));

  readonly transitionTo = this.updater((state, nextState: WorkflowState) => {
    if (!this.isValidTransition(state.workflowState, nextState)) {
      console.warn(`[store] Invalid transition: ${state.workflowState} → ${nextState}`);
      return state;
    }
    return { ...state, workflowState: nextState };
  });

  readonly forceTransition = this.updater((state, nextState: WorkflowState) => ({
    ...state,
    workflowState: nextState,
  }));

  readonly setPrompt = this.updater((state, prompt: ClarificationPrompt) => {
    const optionCount = prompt.options.length;
    if (optionCount < 2 || optionCount > 5) {
      throw new Error('Clarification prompts must supply between 2 and 5 options.');
    }

    const nextWorkflowState: WorkflowState =
      state.workflowState === 'loading' || state.workflowState === 'idle'
        ? 'prompting'
        : state.workflowState;

    return {
      ...state,
      currentPrompt: prompt,
      history: [...state.history, prompt],
      validationError: null,
      workflowState: nextWorkflowState,
    };
  });

  readonly recordSelection = this.updater((state, optionId: string) => {
    const prompt = state.currentPrompt;
    if (!prompt) {
      return state;
    }

    if (state.workflowState !== 'prompting' && state.workflowState !== 'ready') {
      console.warn(`[store] recordSelection called in invalid state: ${state.workflowState}`);
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
    const selectionCount = Object.keys(newSelections).length;
    const nextWorkflowState = selectionCount >= 2 ? 'ready' : 'prompting';

    return {
      ...state,
      selectionsByPromptId: newSelections,
      validationError: null,
      workflowState: nextWorkflowState,
    };
  });

  readonly setLoading = this.updater((state) => {
    console.log('[DEBUG-STORE] setLoading called, current state:', state.workflowState);
    if (!this.isValidTransition(state.workflowState, 'loading')) {
      console.warn('[DEBUG-STORE] setLoading - invalid transition from:', state.workflowState);
      return state;
    }
    console.log('[DEBUG-STORE] setLoading - transitioning to loading state');
    return { ...state, workflowState: 'loading', error: null };
  });

  readonly setGenerating = this.updater((state) => {
    if (!this.isValidTransition(state.workflowState, 'generating')) {
      return state;
    }
    return { ...state, workflowState: 'generating', error: null };
  });

  readonly setCompleted = this.updater((state) => {
    if (!this.isValidTransition(state.workflowState, 'completed')) {
      return state;
    }
    return { ...state, workflowState: 'completed' };
  });

  readonly setError = this.updater(
    (state, error: string | { message: string; recoverable: boolean } | null) => {
      const errorObj = typeof error === 'string' ? { message: error, recoverable: true } : error;
      return {
        ...state,
        error: errorObj,
        workflowState: errorObj ? 'error' : state.workflowState,
      };
    },
  );

  readonly clearError = this.updater((state) => ({
    ...state,
    error: null,
  }));

  readonly setValidationError = this.updater((state, message: string | null) => ({
    ...state,
    validationError: message,
  }));

  readonly markReady = this.updater((state, ready: boolean) => ({
    ...state,
    workflowState: ready ? 'ready' : state.workflowState,
  }));
}
