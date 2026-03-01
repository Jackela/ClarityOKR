import { Injectable } from '@angular/core';
import type { ClarificationPrompt } from '@clarityokr/contracts';
import { ComponentStore } from '@ngrx/component-store';
import { map } from 'rxjs';

export interface ClarificationState {
  currentPrompt: ClarificationPrompt | null;
  history: ClarificationPrompt[];
  selectedOptionIds: string[];
  isReadyToGenerate: boolean;
  validationError: string | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: ClarificationState = {
  currentPrompt: null,
  history: [],
  selectedOptionIds: [],
  isReadyToGenerate: false,
  validationError: null,
  isLoading: false,
  error: null,
};

@Injectable({ providedIn: 'root' })
export class ClarificationStore extends ComponentStore<ClarificationState> {
  readonly currentPrompt$ = this.select<ClarificationPrompt | null>((state) => state.currentPrompt);
  readonly validationError$ = this.select<string | null>((state) => state.validationError);
  readonly selectedOptionIds$ = this.select<string[]>((state) => state.selectedOptionIds);
  readonly isReadyToGenerate$ = this.select<boolean>((state) => state.isReadyToGenerate);
  readonly history$ = this.select<ClarificationPrompt[]>((state) => state.history);
  readonly hasPrompt$ = this.currentPrompt$.pipe(map((prompt) => prompt !== null));
  readonly isLoading$ = this.select<boolean>((state) => state.isLoading);
  readonly error$ = this.select<string | null>((state) => state.error);

  constructor() {
    super(initialState);
  }

  readonly reset = this.updater(() => initialState);

  readonly setPrompt = this.updater((state, prompt: ClarificationPrompt) => {
    const optionCount = prompt.options.length;
    if (optionCount < 2 || optionCount > 5) {
      throw new Error('Clarification prompts must supply between 2 and 5 options.');
    }

    return {
      ...state,
      currentPrompt: prompt,
      history: [...state.history, prompt],
      selectedOptionIds: [],
      validationError: null,
      isReadyToGenerate: false,
    };
  });

  readonly recordSelection = this.updater((state, optionId: string) => {
    const prompt = state.currentPrompt;
    if (!prompt) {
      return state;
    }

    const optionExists = prompt.options.some((option) => option.id === optionId);
    if (!optionExists) {
      return {
        ...state,
        validationError: `Option ${optionId} was not provided for prompt ${prompt.id}.`,
      };
    }

    const alreadySelected = state.selectedOptionIds.includes(optionId);
    const nextSelected = alreadySelected
      ? state.selectedOptionIds
      : [...state.selectedOptionIds, optionId];

    return {
      ...state,
      selectedOptionIds: nextSelected,
      validationError: null,
    };
  });

  readonly markReady = this.updater((state, ready: boolean) => ({
    ...state,
    isReadyToGenerate: ready,
  }));

  readonly setValidationError = this.updater((state, message: string | null) => ({
    ...state,
    validationError: message,
  }));

  readonly setLoading = this.updater((state, loading: boolean) => ({
    ...state,
    isLoading: loading,
  }));

  readonly setError = this.updater((state, error: string | null) => ({
    ...state,
    error,
  }));

  readonly clearError = this.updater((state) => ({
    ...state,
    error: null,
  }));
}
