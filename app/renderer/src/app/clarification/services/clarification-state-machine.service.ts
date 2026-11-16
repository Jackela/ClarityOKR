import { Injectable, signal } from '@angular/core';
import type { ClarificationPrompt } from '@clarityokr/contracts';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { Logger } from '../../core/services/logger.service';
import {
  type WorkflowState,
  type StateAction,
  type ErrorInfo,
  type ClarificationState,
} from './clarification-state.types.js';
import { INITIAL_STATE } from './clarification-state.constants.js';
import { reduceClarificationState } from './clarification-state.reducer.js';
import {
  createClarificationSelectors,
  selectCanTransitionTo,
  selectHasSelection,
  selectSelection,
  cloneClarificationState,
} from './clarification-state.selectors.js';
import { createClarificationEffects } from './clarification-state.effects.js';

/**
 * Clarification State Machine Service - Centralized State Management for OKR Clarification
 *
 * Finite state machine for the OKR clarification workflow. The Injectable class
 * remains the public API at this module path; reducer, effects, and selectors
 * live in sibling files. All state transitions still flow through dispatch(action).
 *
 * @module clarification/services/clarification-state-machine.service
 */
@Injectable({ providedIn: 'root' })
export class ClarificationStateMachine {
  /** Core state signal - single source of truth for all clarification state */
  private readonly _state = signal<ClarificationState>(INITIAL_STATE);

  private readonly selectors = createClarificationSelectors(this._state);
  private readonly effects: ReturnType<typeof createClarificationEffects>;

  readonly workflowState = this.selectors.workflowState;
  readonly currentPrompt = this.selectors.currentPrompt;
  readonly isLoading = this.selectors.isLoading;
  readonly error = this.selectors.error;
  readonly isReadyToGenerate = this.selectors.isReadyToGenerate;
  readonly selections = this.selectors.selections;
  readonly sessionId = this.selectors.sessionId;
  readonly validationError = this.selectors.validationError;
  readonly intent = this.selectors.intent;
  readonly history = this.selectors.history;
  readonly hasError = this.selectors.hasError;
  readonly selectionCount = this.selectors.selectionCount;
  readonly hasPrompt = this.selectors.hasPrompt;
  readonly errorMessage = this.selectors.errorMessage;
  readonly currentSelection = this.selectors.currentSelection;
  readonly selectedOptionIds = this.selectors.selectedOptionIds;

  /**
   * Creates a new ClarificationStateMachine instance.
   *
   * @param logger - Service for debug and error logging
   */
  constructor(private readonly logger: Logger) {
    // Initialize effects in the constructor so `this.logger` is assigned first
    // (`useDefineForClassFields` / ES2022 would otherwise leave it undefined
    // during field initializers).
    this.effects = createClarificationEffects(
      (action) => this.dispatch(action),
      this.logger,
    );
    this.logger.debug('[STATE-MACHINE] Initialized');
  }

  start(intent: string): void {
    this.effects.start(intent);
  }

  setPrompt(prompt: ClarificationPrompt | null): void {
    this.effects.setPrompt(prompt);
  }

  setLoading(loading: boolean, intent?: string): void {
    this.effects.setLoading(loading, intent);
  }

  setError(error: string | ErrorInfo | null): void {
    this.effects.setError(error);
  }

  clearError(): void {
    this.effects.clearError();
  }

  recordSelection(promptId: string, optionId: string): void {
    this.effects.recordSelection(promptId, optionId);
  }

  setSessionId(sessionId: string | null): void {
    this.effects.setSessionId(sessionId);
  }

  setValidationError(message: string | null): void {
    this.effects.setValidationError(message);
  }

  setIntent(intent: string): void {
    this.effects.setIntent(intent);
  }

  setGenerating(): void {
    this.effects.setGenerating();
  }

  setCompleted(okr?: { objectives: unknown[] }): void {
    this.effects.setCompleted(okr);
  }

  /**
   * #116 (S3§12.9): puts a wizard draft back as it was left, from the saved questions and answers
   * only (no model call, no loading state). The last step is shown; `ready` shows the
   * 「可以生成」 screen instead.
   */
  restore(payload: Extract<StateAction, { type: 'RESTORE' }>['payload']): void {
    this.effects.restore(payload);
  }

  /** #116: puts back a snapshot taken before a restore (S3-05 rollback). */
  loadSnapshot(state: ClarificationState): void {
    this.effects.loadSnapshot(state);
  }

  reset(): void {
    this.effects.reset();
  }

  getSelection(promptId: string): string | null {
    return selectSelection(this._state(), promptId);
  }

  hasSelection(promptId: string): boolean {
    return selectHasSelection(this._state(), promptId);
  }

  canTransitionTo(targetState: WorkflowState): boolean {
    return selectCanTransitionTo(this._state(), targetState);
  }

  getStateSnapshot(): ClarificationState {
    return cloneClarificationState(this._state());
  }

  /**
   * Dispatches an action to the reducer to update state.
   * This is the internal entry point for all state changes.
   */
  private dispatch(action: StateAction): void {
    this._state.update((currentState) =>
      reduceClarificationState(currentState, action, this.logger),
    );
  }
}
