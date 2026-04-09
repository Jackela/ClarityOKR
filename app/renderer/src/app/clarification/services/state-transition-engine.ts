import { Injectable, signal, computed } from '@angular/core';
import type { ClarificationPrompt } from '@clarityokr/contracts';

import type { Logger } from '@core/services/logger.service';
import type { ClarificationState, WorkflowState, StateAction, ErrorInfo } from './state-types.js';
import { INITIAL_STATE } from './state-types.js';
import { StateValidator } from './state-validator.js';
import { ActionReducer } from './action-reducer.js';

/**
 * StateTransitionEngine - Unified state machine for clarification workflow
 *
 * Architecture: StateMachine as single source of truth, Signals as derived views
 * - All state transitions via dispatch(action)
 * - Reducer ensures state consistency
 * - Computed signals provide derived state
 *
 * This class coordinates between:
 * - StateValidator: Validates state transitions
 * - ActionReducer: Pure function state reduction
 * - Angular Signals: Reactive state exposure to components
 *
 * @example
 * ```typescript
 * // Use in component
 * constructor(private stateMachine: StateTransitionEngine) {}
 *
 * // Read derived state
 * const prompt = this.stateMachine.currentPrompt();
 * const isReady = this.stateMachine.isReadyToGenerate();
 *
 * // Trigger state transitions
 * this.stateMachine.start('Improve team efficiency');
 * this.stateMachine.recordSelection('prompt-1', 'option-a');
 * ```
 */
@Injectable({ providedIn: 'root' })
export class StateTransitionEngine {
  // === 核心状态 (单一数据源) ===
  private readonly _state = signal<ClarificationState>(INITIAL_STATE);
  private readonly validator: StateValidator;
  private readonly reducer: ActionReducer;

  // === 派生的只读 Signals ===
  readonly workflowState = computed(() => this._state().workflowState);
  readonly currentPrompt = computed(() => this._state().currentPrompt);
  readonly isLoading = computed(() => this._state().isLoading);
  readonly error = computed(() => this._state().error);
  readonly isReadyToGenerate = computed(() => this._state().isReadyToGenerate);
  readonly selections = computed(() => this._state().selections);
  readonly sessionId = computed(() => this._state().sessionId);
  readonly validationError = computed(() => this._state().validationError);
  readonly intent = computed(() => this._state().intent);
  readonly history = computed(() => this._state().history);

  // === 计算属性 Signals ===
  readonly hasError = computed(() => this._state().error !== null);
  readonly selectionCount = computed(() => Object.keys(this._state().selections).length);
  readonly hasPrompt = computed(() => this._state().currentPrompt !== null);
  readonly errorMessage = computed(() => this._state().error?.message ?? null);
  readonly currentSelection = computed(() => {
    const prompt = this._state().currentPrompt;
    if (!prompt) return null;
    return this._state().selections[prompt.id] ?? null;
  });
  readonly selectedOptionIds = computed(() => Object.values(this._state().selections));

  constructor(private readonly logger: Logger) {
    this.validator = new StateValidator(logger);
    this.reducer = new ActionReducer(logger, this.validator);
    this.logger.debug('[STATE-MACHINE] Initialized');
  }

  // === State transition methods (business logic layer) ===

  /**
   * Starts a new clarification workflow.
   * Triggers: START action -> loading state
   * @param intent - User's initial goal/intent description
   */
  start(intent: string): void {
    this.logger.debug('[STATE-MACHINE] Action: START', { intent });
    this.dispatch({ type: 'START', payload: { intent } });
  }

  /**
   * Sets the current clarification prompt.
   * Triggers: SET_PROMPT action -> prompting state
   * @param prompt - The clarification prompt to display
   */
  setPrompt(prompt: ClarificationPrompt | null): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_PROMPT', { promptId: prompt?.id ?? 'null' });
    this.dispatch({ type: 'SET_PROMPT', payload: { prompt } });
  }

  /**
   * Sets the loading state.
   * @param loading - Whether data is loading
   * @param intent - Optional intent (set only when starting load)
   */
  setLoading(loading: boolean, intent?: string): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_LOADING', { loading, intent });
    this.dispatch({ type: 'SET_LOADING', payload: { loading } });
    if (loading && intent) {
      this.dispatch({ type: 'SET_INTENT', payload: { intent } });
    }
  }

  /**
   * Sets error state.
   * Triggers: SET_ERROR action -> error state
   * @param error - Error message string or object
   */
  setError(error: string | ErrorInfo | null): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_ERROR', { error });
    const errorInfo = typeof error === 'string' ? { message: error, recoverable: true } : error;
    this.dispatch({ type: 'SET_ERROR', payload: { error: errorInfo } });
  }

  /**
   * Clears error state.
   * Triggers: CLEAR_ERROR action
   * Automatically returns to previous valid state or idle
   */
  clearError(): void {
    this.logger.debug('[STATE-MACHINE] Action: CLEAR_ERROR');
    this.dispatch({ type: 'CLEAR_ERROR' });
  }

  /**
   * Records user selection.
   * Triggers: RECORD_SELECTION action
   * Automatically checks if ready to generate (at least 1 selection)
   * @param promptId - The prompt ID
   * @param optionId - The selected option ID
   */
  recordSelection(promptId: string, optionId: string): void {
    this.logger.debug('[STATE-MACHINE] Action: RECORD_SELECTION', { promptId, optionId });
    this.dispatch({ type: 'RECORD_SELECTION', payload: { promptId, optionId } });
  }

  /**
   * Sets the session ID.
   * @param sessionId - The session ID or null
   */
  setSessionId(sessionId: string | null): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_SESSION_ID', { sessionId });
    this.dispatch({ type: 'SET_SESSION_ID', payload: { sessionId } });
  }

  /**
   * Sets validation error.
   * @param message - Error message or null
   */
  setValidationError(message: string | null): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_VALIDATION_ERROR', { message });
    this.dispatch({ type: 'SET_VALIDATION_ERROR', payload: { message } });
  }

  /**
   * Sets user intent.
   * @param intent - User intent
   */
  setIntent(intent: string): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_INTENT', { intent });
    this.dispatch({ type: 'SET_INTENT', payload: { intent } });
  }

  /**
   * Sets state to generating.
   * Triggers: SET_GENERATING action -> generating state
   */
  setGenerating(): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_GENERATING');
    this.dispatch({ type: 'SET_GENERATING' });
  }

  /**
   * Sets state to completed.
   * Triggers: SET_COMPLETED action -> completed state
   * @param okr - Optional OKR result
   */
  setCompleted(okr?: { objectives: unknown[] }): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_COMPLETED', { okr });
    this.dispatch({ type: 'SET_COMPLETED', payload: { okr } });
  }

  /**
   * Resets the state machine to initial state.
   * Triggers: RESET action -> back to initial state
   */
  reset(): void {
    this.logger.debug('[STATE-MACHINE] Action: RESET');
    this.dispatch({ type: 'RESET' });
  }

  // === Helper methods ===

  /**
   * Gets selection for a specific prompt.
   * @param promptId - The prompt ID
   * @returns Selected option ID or null
   */
  getSelection(promptId: string): string | null {
    return this._state().selections[promptId] ?? null;
  }

  /**
   * Checks if there is a selection for a specific prompt.
   * @param promptId - The prompt ID
   * @returns Whether a selection exists
   */
  hasSelection(promptId: string): boolean {
    return promptId in this._state().selections;
  }

  /**
   * Checks if can transition from current state to target state.
   * @param targetState - The target state
   * @returns Whether transition is allowed
   */
  canTransitionTo(targetState: WorkflowState): boolean {
    const currentState = this._state().workflowState;
    return this.validator.canTransition(currentState, targetState);
  }

  /**
   * Gets current state snapshot (for debugging/testing).
   * @returns Complete state object
   */
  getStateSnapshot(): ClarificationState {
    return { ...this._state() };
  }

  /**
   * Dispatches action.
   * @param action - Action to execute
   */
  private dispatch(action: StateAction): void {
    this._state.update((currentState) => this.reducer.reduce(currentState, action));
  }
}
