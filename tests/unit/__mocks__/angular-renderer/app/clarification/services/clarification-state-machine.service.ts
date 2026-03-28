// Mock for ClarificationStateMachine service from renderer
// Replicates the API using simple implementations instead of Angular signals

import { Injectable } from '@angular/core';
import type { ClarificationPrompt, WorkflowState } from '@clarityokr/contracts';

import type { Logger } from '../../core/services/logger.service';

export interface ErrorInfo {

export type WorkflowState =
  | 'idle'
  | 'loading'
  | 'prompting'
  | 'ready'
  | 'generating'
  | 'completed'
  | 'error';

export interface ErrorInfo {
  message: string;
  recoverable: boolean;
}

export interface ClarificationState {
  workflowState: WorkflowState;
  currentPrompt: ClarificationPrompt | null;
  isLoading: boolean;
  error: ErrorInfo | null;
  isReadyToGenerate: boolean;
  selections: Record<string, string>;
  sessionId: string | null;
  validationError: string | null;
  intent: string;
  history: ClarificationPrompt[];
}

const INITIAL_STATE: ClarificationState = {
  workflowState: 'idle',
  currentPrompt: null,
  isLoading: false,
  error: null,
  isReadyToGenerate: false,
  selections: {},
  sessionId: null,
  validationError: null,
  intent: '',
  history: [],
};

const VALID_TRANSITIONS: Record<WorkflowState, readonly WorkflowState[]> = {
  idle: ['loading'],
  loading: ['prompting', 'error', 'generating'],
  prompting: ['loading', 'ready', 'error', 'generating'],
  ready: ['generating', 'loading', 'error'],
  generating: ['completed', 'error'],
  completed: ['idle'],
  error: ['idle', 'loading', 'prompting'],
};

@Injectable({ providedIn: 'root' })
export class ClarificationStateMachine {
  private _state = { ...INITIAL_STATE };

  workflowState(): WorkflowState {
    return this._state.workflowState;
  }

  currentPrompt(): ClarificationPrompt | null {
    return this._state.currentPrompt;
  }

  isLoading(): boolean {
    return this._state.isLoading;
  }

  error(): ErrorInfo | null {
    return this._state.error;
  }

  isReadyToGenerate(): boolean {
    return this._state.isReadyToGenerate;
  }

  selections(): Record<string, string> {
    return { ...this._state.selections };
  }

  sessionId(): string | null {
    return this._state.sessionId;
  }

  validationError(): string | null {
    return this._state.validationError;
  }

  intent(): string {
    return this._state.intent;
  }

  history(): ClarificationPrompt[] {
    return [...this._state.history];
  }

  hasError(): boolean {
    return this._state.error !== null;
  }

  selectionCount(): number {
    return Object.keys(this._state.selections).length;
  }

  hasPrompt(): boolean {
    return this._state.currentPrompt !== null;
  }

  errorMessage(): string | null {
    return this._state.error?.message ?? null;
  }

  currentSelection(): string | null {
    const prompt = this._state.currentPrompt;
    if (!prompt) return null;
    return this._state.selections[prompt.id] ?? null;
  }

  selectedOptionIds(): string[] {
    return Object.values(this._state.selections);
  }

  constructor(private readonly logger: Logger) {
    this.logger.debug('[STATE-MACHINE] Initialized');
  }

  start(intent: string): void {
    this.logger.debug('[STATE-MACHINE] Action: START', { intent });
    this._state = {
      ...INITIAL_STATE,
      workflowState: 'loading',
      isLoading: true,
      intent,
    };
  }

  setPrompt(prompt: ClarificationPrompt | null): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_PROMPT', { promptId: prompt?.id ?? 'null' });
    if (!prompt) {
      this._state.currentPrompt = null;
      return;
    }
    this._state = {
      ...this._state,
      currentPrompt: prompt,
      isLoading: false,
      workflowState: 'prompting',
      history: [...this._state.history, prompt],
    };
  }

  setLoading(loading: boolean, intent?: string): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_LOADING', { loading, intent });
    this._state.isLoading = loading;
    if (loading) {
      this._state.workflowState = 'loading';
      this._state.validationError = null;
      if (intent) {
        this._state.intent = intent;
      }
    }
  }

  setError(error: string | ErrorInfo | null): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_ERROR', { error });
    const errorInfo = typeof error === 'string' ? { message: error, recoverable: true } : error;
    this._state = {
      ...this._state,
      error: errorInfo,
      isLoading: false,
      workflowState: 'error',
    };
  }

  clearError(): void {
    this.logger.debug('[STATE-MACHINE] Action: CLEAR_ERROR');
    if (this._state.workflowState === 'error') {
      this._state.workflowState = 'idle';
    }
    this._state.error = null;
  }

  recordSelection(promptId: string, optionId: string): void {
    this.logger.debug('[STATE-MACHINE] Action: RECORD_SELECTION', { promptId, optionId });
    const newSelections = { ...this._state.selections, [promptId]: optionId };
    const selectionCount = Object.keys(newSelections).length;
    const isReadyToGenerate = selectionCount >= 1;
    const newWorkflowState = isReadyToGenerate ? 'ready' : this._state.workflowState;

    this._state = {
      ...this._state,
      selections: newSelections,
      isReadyToGenerate,
      workflowState: newWorkflowState,
      validationError: null,
    };
  }

  setSessionId(sessionId: string | null): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_SESSION_ID', { sessionId });
    this._state.sessionId = sessionId;
  }

  setValidationError(message: string | null): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_VALIDATION_ERROR', { message });
    this._state.validationError = message;
  }

  setIntent(intent: string): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_INTENT', { intent });
    this._state.intent = intent;
  }

  setGenerating(): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_GENERATING');
    this._state = {
      ...this._state,
      isLoading: true,
      workflowState: 'generating',
    };
  }

  setCompleted(okr?: { objectives: unknown[] }): void {
    this.logger.debug('[STATE-MACHINE] Action: SET_COMPLETED', { okr });
    this._state = {
      ...this._state,
      isLoading: false,
      workflowState: 'completed',
    };
  }

  reset(): void {
    this.logger.debug('[STATE-MACHINE] Action: RESET');
    this._state = { ...INITIAL_STATE };
  }

  selectOption(optionId: string): void {
    const prompt = this._state.currentPrompt;
    if (prompt) {
      this.recordSelection(prompt.id, optionId);
    } else {
      this.logger.warn('[STATE-MACHINE] selectOption called with no current prompt');
    }
  }

  reportError(error: string | ErrorInfo | null): void {
    this.setError(error);
  }

  setReady(_ready: boolean): void {
    this.logger.warn('[STATE-MACHINE] setReady is deprecated, readiness determined automatically');
  }

  markReady(_ready: boolean): void {
    this.logger.warn('[STATE-MACHINE] markReady is deprecated, use recordSelection instead');
  }

  getSelection(promptId: string): string | null {
    return this._state.selections[promptId] ?? null;
  }

  hasSelection(promptId: string): boolean {
    return promptId in this._state.selections;
  }

  canTransitionTo(targetState: WorkflowState): boolean {
    const currentState = this._state.workflowState;
    return VALID_TRANSITIONS[currentState].includes(targetState);
  }

  getStateSnapshot(): ClarificationState {
    return { ...this._state };
  }
}
