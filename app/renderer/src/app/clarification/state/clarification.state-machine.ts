import type { ClarificationPrompt } from '@clarityokr/contracts';

/**
 * Error information for error state
 */
export interface ErrorInfo {
  message: string;
  recoverable: boolean;
}

/**
 * Clarification context containing selections and history
 */
export interface ClarificationContext {
  selections: Array<{ promptId: string; optionId: string }>;
  history: ClarificationPrompt[];
}

/**
 * OKR Document structure (minimal for state machine)
 */
export interface OKRDocument {
  objectives: unknown[];
}

/**
 * Discriminated union of all possible clarification states
 */
export type ClarificationState =
  | { type: 'idle' }
  | { type: 'loading'; intent: string }
  | { type: 'prompting'; prompt: ClarificationPrompt; history: ClarificationPrompt[] }
  | { type: 'ready'; context: ClarificationContext }
  | { type: 'generating'; context: ClarificationContext }
  | { type: 'completed'; okr: OKRDocument }
  | { type: 'error'; error: ErrorInfo; previousState: ClarificationState };

/**
 * Discriminated union of all possible events
 */
export type ClarificationEvent =
  | { type: 'START'; intent: string }
  | { type: 'PROMPT_RECEIVED'; prompt: ClarificationPrompt }
  | { type: 'OPTION_SELECTED'; optionId: string }
  | { type: 'GENERATE' }
  | { type: 'OKR_GENERATED'; okr: OKRDocument }
  | { type: 'RESET' }
  | { type: 'ERROR'; error: ErrorInfo };

/**
 * Type guard for idle state
 */
export function isIdleState(
  state: ClarificationState,
): state is Extract<ClarificationState, { type: 'idle' }> {
  return state.type === 'idle';
}

/**
 * Type guard for loading state
 */
export function isLoadingState(
  state: ClarificationState,
): state is Extract<ClarificationState, { type: 'loading' }> {
  return state.type === 'loading';
}

/**
 * Type guard for prompting state
 */
export function isPromptingState(
  state: ClarificationState,
): state is Extract<ClarificationState, { type: 'prompting' }> {
  return state.type === 'prompting';
}

/**
 * Type guard for ready state
 */
export function isReadyState(
  state: ClarificationState,
): state is Extract<ClarificationState, { type: 'ready' }> {
  return state.type === 'ready';
}

/**
 * Type guard for generating state
 */
export function isGeneratingState(
  state: ClarificationState,
): state is Extract<ClarificationState, { type: 'generating' }> {
  return state.type === 'generating';
}

/**
 * Type guard for completed state
 */
export function isCompletedState(
  state: ClarificationState,
): state is Extract<ClarificationState, { type: 'completed' }> {
  return state.type === 'completed';
}

/**
 * Type guard for error state
 */
export function isErrorState(
  state: ClarificationState,
): state is Extract<ClarificationState, { type: 'error' }> {
  return state.type === 'error';
}

/**
 * Helper to throw invalid transition error
 */
function throwInvalidTransition(state: ClarificationState, event: ClarificationEvent): never {
  throw new Error(
    `Invalid transition: cannot process event '${event.type}' in state '${state.type}'`,
  );
}

/**
 * Handle idle state transitions
 */
function handleIdleState(
  state: Extract<ClarificationState, { type: 'idle' }>,
  event: ClarificationEvent,
): ClarificationState {
  switch (event.type) {
    case 'START':
      return { type: 'loading', intent: event.intent };
    case 'RESET':
      return { type: 'idle' };
    default:
      throwInvalidTransition(state, event);
  }
}

/**
 * Handle loading state transitions
 */
function handleLoadingState(
  state: Extract<ClarificationState, { type: 'loading' }>,
  event: ClarificationEvent,
): ClarificationState {
  switch (event.type) {
    case 'PROMPT_RECEIVED':
      return {
        type: 'prompting',
        prompt: event.prompt,
        history: [event.prompt],
      };
    case 'ERROR':
      return {
        type: 'error',
        error: event.error,
        previousState: state,
      };
    case 'RESET':
      return { type: 'idle' };
    default:
      throwInvalidTransition(state, event);
  }
}

/**
 * Handle prompting state transitions
 */
function handlePromptingState(
  state: Extract<ClarificationState, { type: 'prompting' }>,
  event: ClarificationEvent,
): ClarificationState {
  switch (event.type) {
    case 'PROMPT_RECEIVED':
      return {
        type: 'prompting',
        prompt: event.prompt,
        history: [...state.history, event.prompt],
      };
    case 'OPTION_SELECTED':
      return handleOptionSelectedInPromptingState(state, event.optionId);
    case 'ERROR':
      return {
        type: 'error',
        error: event.error,
        previousState: state,
      };
    case 'RESET':
      return { type: 'idle' };
    default:
      throwInvalidTransition(state, event);
  }
}

/**
 * Handle option selection in prompting state
 */
function handleOptionSelectedInPromptingState(
  state: Extract<ClarificationState, { type: 'prompting' }>,
  optionId: string,
): ClarificationState {
  const currentPrompt = state.prompt;

  // Build selections array from history
  const selections = buildSelectionsFromHistory(state.history, currentPrompt.id, optionId);

  // Check if we have enough selections to be ready (need 2+ unique prompts)
  const uniquePromptCount = new Set(selections.map((s) => s.promptId)).size;

  if (uniquePromptCount >= 2) {
    return {
      type: 'ready',
      context: {
        selections,
        history: state.history,
      },
    };
  }

  // Stay in prompting state
  return {
    type: 'prompting',
    prompt: currentPrompt,
    history: state.history,
  };
}

/**
 * Build selections array from history and current selection
 * This is a simplified version - in practice, selections are tracked separately
 */
function buildSelectionsFromHistory(
  history: ClarificationPrompt[],
  currentPromptId: string,
  currentOptionId: string,
): Array<{ promptId: string; optionId: string }> {
  // Create a selection for each prompt in history
  // In the full implementation, selections would be tracked separately
  return history.map((prompt) => ({
    promptId: prompt.id,
    optionId: prompt.id === currentPromptId ? currentOptionId : 'pending',
  }));
}

/**
 * Handle ready state transitions
 */
function handleReadyState(
  state: Extract<ClarificationState, { type: 'ready' }>,
  event: ClarificationEvent,
): ClarificationState {
  switch (event.type) {
    case 'GENERATE':
      return {
        type: 'generating',
        context: state.context,
      };
    case 'PROMPT_RECEIVED':
      return {
        type: 'prompting',
        prompt: event.prompt,
        history: [...state.context.history, event.prompt],
      };
    case 'ERROR':
      return {
        type: 'error',
        error: event.error,
        previousState: state,
      };
    case 'RESET':
      return { type: 'idle' };
    default:
      throwInvalidTransition(state, event);
  }
}

/**
 * Handle generating state transitions
 */
function handleGeneratingState(
  state: Extract<ClarificationState, { type: 'generating' }>,
  event: ClarificationEvent,
): ClarificationState {
  switch (event.type) {
    case 'OKR_GENERATED':
      return {
        type: 'completed',
        okr: event.okr,
      };
    case 'ERROR':
      return {
        type: 'error',
        error: event.error,
        previousState: state,
      };
    case 'RESET':
      return { type: 'idle' };
    default:
      throwInvalidTransition(state, event);
  }
}

/**
 * Handle completed state transitions
 */
function handleCompletedState(
  state: Extract<ClarificationState, { type: 'completed' }>,
  event: ClarificationEvent,
): ClarificationState {
  switch (event.type) {
    case 'START':
      return { type: 'loading', intent: event.intent };
    case 'RESET':
      return { type: 'idle' };
    default:
      throwInvalidTransition(state, event);
  }
}

/**
 * Handle error state transitions
 */
function handleErrorState(
  state: Extract<ClarificationState, { type: 'error' }>,
  event: ClarificationEvent,
): ClarificationState {
  switch (event.type) {
    case 'START':
      return { type: 'loading', intent: event.intent };
    case 'RESET':
      return { type: 'idle' };
    case 'ERROR':
      // Stay in error state but update error message if provided
      return event.error
        ? { type: 'error', error: event.error, previousState: state.previousState }
        : state;
    default:
      throwInvalidTransition(state, event);
  }
}

/**
 * Pure reducer function for Clarification state machine.
 *
 * State Machine Diagram:
 * ```
 *                    START
 *    ┌─────────────────┐
 *    │                 ▼
 *    │  ┌──────────┐  loading  ┌───────────┐
 *    │  │   idle   │──────────▶│  loading  │
 *    │  └──────────┘           └─────┬─────┘
 *    │       ▲                       │ PROMPT_RECEIVED
 *    │       │ RESET                 ▼
 *    │       │               ┌───────────┐
 *    │       │               │ prompting │◀──────────────┐
 *    │       │               └─────┬─────┘               │
 *    │       │                     │ OPTION_SELECTED     │ PROMPT_RECEIVED
 *    │       │                     │ (x2 prompts)        │
 *    │       │                     ▼                     │
 *    │       │               ┌───────────┐               │
 *    │       └───────────────│   ready   │───────────────┘
 *    │                       └─────┬─────┘
 *    │                             │ GENERATE
 *    │                             ▼
 *    │                       ┌───────────┐
 *    │                       │ generating│
 *    │                       └─────┬─────┘
 *    │                             │ OKR_GENERATED
 *    │                             ▼
 *    │  RESET              ┌───────────┐     START
 *    └─────────────────────│ completed │──────────▶ loading
 *                          └───────────┘
 * ```
 *
 * @param state - Current state
 * @param event - Event to process
 * @returns New state
 * @throws Error if transition is invalid
 */
export function clarificationReducer(
  state: ClarificationState,
  event: ClarificationEvent,
): ClarificationState {
  switch (state.type) {
    case 'idle':
      return handleIdleState(state, event);
    case 'loading':
      return handleLoadingState(state, event);
    case 'prompting':
      return handlePromptingState(state, event);
    case 'ready':
      return handleReadyState(state, event);
    case 'generating':
      return handleGeneratingState(state, event);
    case 'completed':
      return handleCompletedState(state, event);
    case 'error':
      return handleErrorState(state, event);
    default:
      throwInvalidTransition(state, event);
  }
}
