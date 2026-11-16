import { computed, type Signal } from '@angular/core';
import type { ClarificationPrompt } from '@clarityokr/contracts';

import type { ClarificationState, WorkflowState } from './clarification-state.types.js';
import { VALID_TRANSITIONS } from './clarification-state.constants.js';

/**
 * Derived read-only signals over a clarification state signal.
 * These are attached to ClarificationStateMachine so the public API stays unchanged.
 */
export function createClarificationSelectors(state: Signal<ClarificationState>) {
  return {
    /** Current workflow state of the clarification process. */
    workflowState: computed(() => state().workflowState),
    /** Current clarification prompt being displayed to the user. */
    currentPrompt: computed(() => state().currentPrompt),
    /** Loading state indicator. */
    isLoading: computed(() => state().isLoading),
    /** Error information when the workflow enters error state. */
    error: computed(() => state().error),
    /** Whether the clarification has gathered enough context to generate OKRs. */
    isReadyToGenerate: computed(() => state().isReadyToGenerate),
    /** Map of user selections keyed by prompt ID. */
    selections: computed(() => state().selections),
    /** Unique identifier for the current clarification session. */
    sessionId: computed(() => state().sessionId),
    /** Validation error message for form inputs. */
    validationError: computed(() => state().validationError),
    /** The original user intent that started the clarification process. */
    intent: computed(() => state().intent),
    /** History of prompts shown during the current session. */
    history: computed(() => state().history),
    /** Whether an error state is currently active. */
    hasError: computed(() => state().error !== null),
    /** Number of selections made by the user. */
    selectionCount: computed(() => Object.keys(state().selections).length),
    /** Whether a prompt is currently available for display. */
    hasPrompt: computed(() => state().currentPrompt !== null),
    /** Error message text for display, or null if no error. */
    errorMessage: computed(() => state().error?.message ?? null),
    /**
     * The user's current selection for the active prompt.
     * Null if no prompt is active or no selection made for current prompt.
     */
    currentSelection: computed(() => {
      const prompt = state().currentPrompt;
      if (!prompt) return null;
      return state().selections[prompt.id] ?? null;
    }),
    /** List of all selected option IDs. */
    selectedOptionIds: computed(() => Object.values(state().selections)),
  } as const;
}

export type ClarificationSelectors = ReturnType<typeof createClarificationSelectors>;

/** Retrieves the selected option ID for a specific prompt, or null. */
export function selectSelection(state: ClarificationState, promptId: string): string | null {
  return state.selections[promptId] ?? null;
}

/** Checks whether a selection exists for a specific prompt. */
export function selectHasSelection(state: ClarificationState, promptId: string): boolean {
  return promptId in state.selections;
}

/** Checks if a transition to the target workflow state is allowed. */
export function selectCanTransitionTo(
  state: ClarificationState,
  targetState: WorkflowState,
): boolean {
  return VALID_TRANSITIONS[state.workflowState].includes(targetState);
}

/**
 * Gets a deep-enough snapshot of the current state for debugging or testing.
 * Nested selections, history, currentPrompt options, and error are copied so
 * mutations of the snapshot cannot change live state.
 */
export function cloneClarificationState(state: ClarificationState): ClarificationState {
  const copyPrompt = (prompt: ClarificationPrompt): ClarificationPrompt => ({
    ...prompt,
    options: prompt.options.map((option) => ({ ...option })),
  });
  return {
    ...state,
    selections: { ...state.selections },
    history: state.history.map(copyPrompt),
    currentPrompt: state.currentPrompt ? copyPrompt(state.currentPrompt) : null,
    error: state.error ? { ...state.error } : null,
  };
}
