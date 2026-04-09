import { Injectable, signal, computed } from '@angular/core';
import type { ClarificationPrompt } from '@clarityokr/contracts';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Logger } from '../../core/services/logger.service';
import { environment } from '../../../environments/environment';
import {
  type WorkflowState,
  type StateAction,
  type ErrorInfo,
  type ClarificationState,
} from './clarification-state.types.js';
import { INITIAL_STATE, VALID_TRANSITIONS } from './clarification-state.constants.js';

/**
 * Clarification State Machine Service - Centralized State Management for OKR Clarification
 *
 * This service implements a finite state machine pattern for managing the OKR clarification
 * workflow. It provides a single source of truth for the clarification process state,
 * with signals serving as derived views for reactive Angular components.
 *
 * Key Responsibilities:
 * - Manages workflow state transitions (idle, loading, prompting, ready, generating, completed, error)
 * - Tracks user selections and session data
 * - Provides computed signals for UI state derivation
 * - Validates state transitions to prevent invalid operations
 * - Handles error states with recovery capabilities
 *
 * Architecture Pattern:
 * - StateMachine serves as the single source of truth
 * - All state transitions flow through dispatch(action)
 * - Reducer ensures state consistency and immutability
 * - Computed signals provide derived state for components
 *
 * Dependencies:
 * - Logger: Debug and error logging
 * - Angular Signals: Reactive state management
 * - Clarification types and constants from local module
 *
 * @module clarification/services/clarification-state-machine.service
 *
 * @example
 * ```typescript
 * // In a component
 * constructor(private stateMachine: ClarificationStateMachine) {}
 *
 * // Start a new clarification session
 * this.stateMachine.start('Improve team productivity');
 *
 * // React to state changes in template
 * @if (stateMachine.isLoading()) {
 *   <loading-spinner />
 * }
 *
 * // Access current prompt
 * const prompt = this.stateMachine.currentPrompt();
 *
 * // Record user selection
 * this.stateMachine.recordSelection('prompt-1', 'option-a');
 *
 * // Check if ready to generate OKRs
 * if (this.stateMachine.isReadyToGenerate()) {
 *   this.generateOkrs();
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class ClarificationStateMachine {
  /** Core state signal - single source of truth for all clarification state */
  private readonly _state = signal<ClarificationState>(INITIAL_STATE);

  // === Derived Read-Only Signals ===

  /**
   * Current workflow state of the clarification process.
   * States: idle, loading, prompting, ready, generating, completed, error
   */
  readonly workflowState = computed(() => this._state().workflowState);

  /**
   * Current clarification prompt being displayed to the user.
   * Null when no prompt is active.
   */
  readonly currentPrompt = computed(() => this._state().currentPrompt);

  /**
   * Loading state indicator.
   * True when waiting for LLM responses or other async operations.
   */
  readonly isLoading = computed(() => this._state().isLoading);

  /**
   * Error information when the workflow enters error state.
   * Null when no error is present.
   */
  readonly error = computed(() => this._state().error);

  /**
   * Whether the clarification has gathered enough context to generate OKRs.
   * True when at least one selection has been made.
   */
  readonly isReadyToGenerate = computed(() => this._state().isReadyToGenerate);

  /**
   * Map of user selections keyed by prompt ID.
   * Tracks all choices made during the clarification process.
   */
  readonly selections = computed(() => this._state().selections);

  /**
   * Unique identifier for the current clarification session.
   * Null when no session is active.
   */
  readonly sessionId = computed(() => this._state().sessionId);

  /**
   * Validation error message for form inputs.
   * Null when no validation error exists.
   */
  readonly validationError = computed(() => this._state().validationError);

  /**
   * The original user intent that started the clarification process.
   */
  readonly intent = computed(() => this._state().intent);

  /**
   * History of prompts shown during the current session.
   */
  readonly history = computed(() => this._state().history);

  // === Computed Property Signals ===

  /**
   * Whether an error state is currently active.
   */
  readonly hasError = computed(() => this._state().error !== null);

  /**
   * Number of selections made by the user.
   */
  readonly selectionCount = computed(() => Object.keys(this._state().selections).length);

  /**
   * Whether a prompt is currently available for display.
   */
  readonly hasPrompt = computed(() => this._state().currentPrompt !== null);

  /**
   * Error message text for display, or null if no error.
   */
  readonly errorMessage = computed(() => this._state().error?.message ?? null);

  /**
   * The user's current selection for the active prompt.
   * Null if no prompt is active or no selection made for current prompt.
   */
  readonly currentSelection = computed(() => {
    const prompt = this._state().currentPrompt;
    if (!prompt) return null;
    return this._state().selections[prompt.id] ?? null;
  });

  /**
   * List of all selected option IDs.
   */
  readonly selectedOptionIds = computed(() => Object.values(this._state().selections));

  /**
   * Creates a new ClarificationStateMachine instance.
   *
   * Initializes the state machine with default state and sets up logging.
   *
   * @param logger - Service for debug and error logging
   *
   * @example
   * ```typescript
   * // Typically injected by Angular DI
   * constructor(private stateMachine: ClarificationStateMachine) {}
   *
   * // The service is automatically initialized with root-level scope
   * ```
   */
  constructor(private readonly logger: Logger) {
    this.logger.debug('[STATE-MACHINE] Initialized');
  }

  // === State Transition Methods (Business Logic Layer) ===

  /**
   * Starts a new clarification workflow with the user's initial intent.
   *
   * Transitions the state machine from 'idle' to 'loading' and records
   * the user's goal. This clears any previous session state.
   *
   * @param intent - The user's natural language goal description
   *
   * @example
   * ```typescript
   * // Start clarifying a productivity goal
   * this.stateMachine.start('Improve team productivity by 20%');
   *
   * // UI should react to loading state
   * @if (stateMachine.isLoading()) {
   *   <div>Clarifying your intent...</div>
   * }
   * ```
   */
  start(intent: string): void {
    this.logger.debug('[STATE-MACHINE] Action: START', { intent });
    this.dispatch({ type: 'START', payload: { intent } });
  }

  /**
   * Sets the current clarification prompt for user interaction.
   *
   * Transitions from 'loading' to 'prompting' state. The prompt contains
   * a question and mutually exclusive options for the user to choose from.
   *
   * @param prompt - The clarification prompt to display, or null to clear
   *
   * @example
   * ```typescript
   * // Display a new question to the user
   * this.stateMachine.setPrompt({
   *   id: 'goal-type',
   *   question: 'What type of goal is this?',
   *   options: [
   *     { id: 'personal', label: 'Personal Development' },
   *     { id: 'team', label: 'Team Objective' },
   *     { id: 'company', label: 'Company Initiative' }
   *   ]
   * });
   *
   * // Access the prompt in template
   * @if (stateMachine.currentPrompt(); as prompt) {
   *   <h3>{{ prompt.question }}</h3>
   *   @for (option of prompt.options; track option.id) {
   *     <button (click)="select(option.id)">{{ option.label }}</button>
   *   }
   * }
   * ```
   */
  setPrompt(prompt: ClarificationPrompt | null): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_PROMPT', { promptId: prompt?.id ?? 'null' });
    this.dispatch({ type: 'SET_PROMPT', payload: { prompt } });
  }

  /**
   * Sets the loading state for async operations.
   *
   * Controls the loading indicator while waiting for LLM responses
   * or other asynchronous operations.
   *
   * @param loading - Whether loading is active
   * @param intent - Optional intent to set when starting loading (only used when loading is true)
   *
   * @example
   * ```typescript
   * // Show loading before API call
   * this.stateMachine.setLoading(true);
   * await this.llmService.getNextQuestion();
   * this.stateMachine.setLoading(false);
   *
   * // Or set intent while loading
   * this.stateMachine.setLoading(true, 'Improve code quality');
   * ```
   */
  setLoading(loading: boolean, intent?: string): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_LOADING', { loading, intent });
    this.dispatch({ type: 'SET_LOADING', payload: { loading } });
    if (loading && intent) {
      this.dispatch({ type: 'SET_INTENT', payload: { intent } });
    }
  }

  /**
   * Sets an error state with optional recovery capability.
   *
   * Transitions to 'error' state. Errors can be recoverable (user can retry)
   * or non-recoverable (requires reset).
   *
   * @param error - Error message string or ErrorInfo object
   *
   * @example
   * ```typescript
   * // Simple error message (recoverable by default)
   * this.stateMachine.setError('Network connection failed');
   *
   * // Detailed error with recovery flag
   * this.stateMachine.setError({
   *   message: 'LLM service unavailable',
   *   recoverable: false
   * });
   *
   * // Check error in template
   * @if (stateMachine.hasError()) {
   *   <error-display [message]="stateMachine.errorMessage()" />
   * }
   * ```
   */
  setError(error: string | ErrorInfo | null): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_ERROR', { error });
    const errorInfo = typeof error === 'string' ? { message: error, recoverable: true } : error;
    this.dispatch({ type: 'SET_ERROR', payload: { error: errorInfo } });
  }

  /**
   * Clears the current error state.
   *
   * Attempts to recover from error by transitioning back to 'idle'
   * or the previous valid state.
   *
   * @example
   * ```typescript
   * // User clicks "Try Again" button
   * onRetryClick() {
   *   this.stateMachine.clearError();
   *   this.stateMachine.start(this.previousIntent);
   * }
   * ```
   */
  clearError(): void {
    this.logger.debug('[STATE-MACHINE] Action: CLEAR_ERROR');
    this.dispatch({ type: 'CLEAR_ERROR' });
  }

  /**
   * Records a user's selection for a specific prompt.
   *
   * Stores the selection and automatically checks if enough context
   * has been gathered to generate OKRs (at least one selection).
   * Transitions to 'ready' state when ready to generate.
   *
   * @param promptId - The ID of the prompt being answered
   * @param optionId - The ID of the selected option
   *
   * @example
   * ```typescript
   * // User selects an option
   * onOptionSelect(optionId: string) {
   *   const promptId = this.stateMachine.currentPrompt()?.id;
   *   if (promptId) {
   *     this.stateMachine.recordSelection(promptId, optionId);
   *
   *     // Check if ready to generate
   *     if (this.stateMachine.isReadyToGenerate()) {
   *       this.showGenerateButton();
   *     }
   *   }
   * }
   * ```
   */
  recordSelection(promptId: string, optionId: string): void {
    this.logger.debug('[STATE-MACHINE] Action: RECORD_SELECTION', { promptId, optionId });
    this.dispatch({ type: 'RECORD_SELECTION', payload: { promptId, optionId } });
  }

  /**
   * Sets the session ID for the current clarification session.
   *
   * Links the state machine state to a persistent backend session.
   *
   * @param sessionId - The session identifier, or null to clear
   *
   * @example
   * ```typescript
   * // After creating a backend session
   * const session = await this.sessionService.create();
   * this.stateMachine.setSessionId(session.id);
   *
   * // Later, to clear
   * this.stateMachine.setSessionId(null);
   * ```
   */
  setSessionId(sessionId: string | null): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_SESSION_ID', { sessionId });
    this.dispatch({ type: 'SET_SESSION_ID', payload: { sessionId } });
  }

  /**
   * Sets a validation error for form input.
   *
   * Used to display inline validation errors without entering
   * the error workflow state.
   *
   * @param message - The validation error message, or null to clear
   *
   * @example
   * ```typescript
   * // Validate user input
   * validateIntent(intent: string) {
   *   if (intent.length < 5) {
   *     this.stateMachine.setValidationError('Intent must be at least 5 characters');
   *     return false;
   *   }
   *   this.stateMachine.setValidationError(null);
   *   return true;
   * }
   *
   * // Display in template
   * @if (stateMachine.validationError(); as error) {
   *   <span class="error">{{ error }}</span>
   * }
   * ```
   */
  setValidationError(message: string | null): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_VALIDATION_ERROR', { message });
    this.dispatch({ type: 'SET_VALIDATION_ERROR', payload: { message } });
  }

  /**
   * Updates the user intent description.
   *
   * Allows updating the goal after initial entry, useful for
   * refining or correcting the user's objective.
   *
   * @param intent - The updated intent description
   *
   * @example
   * ```typescript
   * // User edits their goal
   * onIntentEdit(newIntent: string) {
   *   this.stateMachine.setIntent(newIntent);
   * }
   *
   * // Display current intent
   * <p>Goal: {{ stateMachine.intent() }}</p>
   * ```
   */
  setIntent(intent: string): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_INTENT', { intent });
    this.dispatch({ type: 'SET_INTENT', payload: { intent } });
  }

  /**
   * Transitions to the generating state.
   *
   * Called when the user initiates OKR generation. Transitions
   * from 'ready' to 'generating' state and shows loading.
   *
   * @example
   * ```typescript
   * // User clicks generate button
   * onGenerateClick() {
   *   if (this.stateMachine.isReadyToGenerate()) {
   *     this.stateMachine.setGenerating();
   *     this.generateOkrs().then(okrs => {
   *       this.stateMachine.setCompleted(okrs);
   *     });
   *   }
   * }
   *
   * // Show generating UI
   * @if (stateMachine.workflowState() === 'generating') {
   *   <generating-animation />
   * }
   * ```
   */
  setGenerating(): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_GENERATING');
    this.dispatch({ type: 'SET_GENERATING' });
  }

  /**
   * Marks the clarification workflow as completed.
   *
   * Transitions to 'completed' state with optional OKR results.
   * This is the final state of the workflow.
   *
   * @param okr - Optional generated OKR result containing objectives
   *
   * @example
   * ```typescript
   * // After successful OKR generation
   * const generatedOkrs = await this.llmService.generateDraft(context);
   * this.stateMachine.setCompleted({
   *   objectives: generatedOkrs.objectives
   * });
   *
   * // Show completion UI
   * @if (stateMachine.workflowState() === 'completed') {
   *   <okr-display [okrs]="generatedOkrs" />
   * }
   * ```
   */
  setCompleted(okr?: { objectives: unknown[] }): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_COMPLETED', { okr });
    this.dispatch({ type: 'SET_COMPLETED', payload: { okr } });
  }

  /**
   * Resets the state machine to initial state.
   *
   * Clears all session data, selections, and returns to 'idle' state.
   * Use this to start a completely new clarification workflow.
   *
   * @example
   * ```typescript
   * // User clicks "Start Over"
   * onStartOverClick() {
   *   this.stateMachine.reset();
   *   this.router.navigate(['/clarify']);
   * }
   *
   * // Or after completing one OKR set
   * onCreateAnotherClick() {
   *   this.stateMachine.reset();
   *   this.showIntentInput();
   * }
   * ```
   */
  reset(): void {
    this.logger.debug('[STATE-MACHINE] Action: RESET');
    this.dispatch({ type: 'RESET' });
  }

  // === Helper Methods ===

  /**
   * Retrieves the selected option ID for a specific prompt.
   *
   * @param promptId - The prompt ID to look up
   * @returns The selected option ID, or null if no selection exists
   *
   * @example
   * ```typescript
   * // Check if user has answered a specific question
   * const previousAnswer = this.stateMachine.getSelection('goal-type');
   * if (previousAnswer === 'team') {
   *   this.showTeamSpecificPrompts();
   * }
   * ```
   */
  getSelection(promptId: string): string | null {
    return this._state().selections[promptId] ?? null;
  }

  /**
   * Checks whether a selection exists for a specific prompt.
   *
   * @param promptId - The prompt ID to check
   * @returns True if the user has made a selection for this prompt
   *
   * @example
   * ```typescript
   * // Show checkmark for answered questions
   * @for (prompt of prompts; track prompt.id) {
   *   <div>
   *     {{ prompt.question }}
   *     @if (stateMachine.hasSelection(prompt.id)) {
   *       <checkmark-icon />
   *     }
   *   </div>
   * }
   * ```
   */
  hasSelection(promptId: string): boolean {
    return promptId in this._state().selections;
  }

  /**
   * Checks if a transition to the target workflow state is allowed.
   *
   * Validates against the state machine's transition rules to prevent
   * invalid state changes.
   *
   * @param targetState - The desired target workflow state
   * @returns True if the transition is valid from the current state
   *
   * @example
   * ```typescript
   * // Guard a transition
   * if (this.stateMachine.canTransitionTo('generating')) {
   *   this.startGeneration();
   * } else {
   *   this.showError('Cannot generate OKRs in current state');
   * }
   *
   * // Check multiple possibilities
   * const canComplete = this.stateMachine.canTransitionTo('completed');
   * const canPrompt = this.stateMachine.canTransitionTo('prompting');
   * ```
   */
  canTransitionTo(targetState: WorkflowState): boolean {
    const currentState = this._state().workflowState;
    return VALID_TRANSITIONS[currentState].includes(targetState);
  }

  /**
   * Gets a snapshot of the current state for debugging or testing.
   *
   * Returns a copy of the full state object. Useful for debugging,
   * testing, or persisting state.
   *
   * @returns A copy of the complete ClarificationState object
   *
   * @example
   * ```typescript
   * // Debug current state
   * console.log('Current state:', this.stateMachine.getStateSnapshot());
   *
   * // Save state for restoration
   * const snapshot = this.stateMachine.getStateSnapshot();
   * localStorage.setItem('clarificationState', JSON.stringify(snapshot));
   *
   * // Use in tests
   * expect(stateMachine.getStateSnapshot().workflowState).toBe('ready');
   * expect(stateMachine.getStateSnapshot().selections).toHaveLength(2);
   * ```
   */
  getStateSnapshot(): ClarificationState {
    return { ...this._state() };
  }

  // === Private Methods: Reducer ===

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
   * @returns New state
   *
   * @example
   * ```typescript
   * // Not typically called directly - use dispatch()
   * // The reducer handles all state changes immutably
   * const newState = this.reducer(currentState, {
   *   type: 'RECORD_SELECTION',
   *   payload: { promptId: 'q1', optionId: 'opt1' }
   * });
   * ```
   */
  private reducer(state: ClarificationState, action: StateAction): ClarificationState {
    this.logger.debug('[STATE-MACHINE] Reducer processing:', action.type);

    switch (action.type) {
      case 'START': {
        const newState: ClarificationState = {
          ...INITIAL_STATE,
          workflowState: 'loading',
          isLoading: true,
          intent: action.payload.intent,
        };
        return this.validateTransition(state, newState);
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
        return this.validateTransition(state, newState);
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
        return this.validateTransition(state, newState);
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
        return this.validateTransition(state, newState);
      }

      case 'SET_COMPLETED': {
        const newState: ClarificationState = {
          ...state,
          isLoading: false,
          workflowState: 'completed',
        };
        return this.validateTransition(state, newState);
      }

      case 'RESET': {
        return INITIAL_STATE;
      }

      default:
        return state;
    }
  }

  /**
   * Validates a state transition according to the state machine rules.
   *
   * Checks if the transition from oldState to newState is allowed.
   * In development, throws an error for invalid transitions.
   * In production, falls back to the old state gracefully.
   *
   * @param oldState - The current state before transition
   * @param newState - The proposed new state
   * @returns The new state if valid, or old state if invalid (in production)
   * @throws Error in development mode if transition is invalid
   *
   * @example
   * ```typescript
   * // Validation happens automatically in reducer
   * const newState = this.validateTransition(currentState, proposedState);
   *
   * // Invalid transitions throw in development
   * // Valid: 'loading' -> 'prompting'
   * // Invalid: 'idle' -> 'ready' (throws in dev)
   * ```
   */
  private validateTransition(
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

  /**
   * Dispatches an action to the reducer to update state.
   *
   * This is the internal entry point for all state changes.
   * The reducer processes the action and returns the new state.
   *
   * @param action - The action to dispatch
   *
   * @example
   * ```typescript
   * // Internal usage - not typically called directly
   * this.dispatch({ type: 'START', payload: { intent: 'Improve team' } });
   * this.dispatch({ type: 'RESET' });
   * ```
   */
  private dispatch(action: StateAction): void {
    this._state.update((currentState) => this.reducer(currentState, action));
  }
}
