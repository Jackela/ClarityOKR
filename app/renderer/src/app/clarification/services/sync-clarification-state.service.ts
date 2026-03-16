import { Injectable, signal, computed } from '@angular/core';
import { Logger } from '../../core/services/logger.service';
import type { ClarificationPrompt } from '@clarityokr/contracts';

/**
 * Error information for error state
 */
export interface ErrorInfo {
  message: string;
  recoverable: boolean;
}

/**
 * Workflow state types
 */
export type WorkflowState =
  | 'idle'
  | 'loading'
  | 'prompting'
  | 'ready'
  | 'generating'
  | 'completed'
  | 'error';

/**
 * Sync Clarification State using Angular Signals
 * Provides synchronous, immediate state updates for better DOM response
 *
 * Migration from ComponentStore complete - all state now managed via Signals
 */
@Injectable({ providedIn: 'root' })
export class SyncClarificationState {
  // Core signals
  private readonly _currentPrompt = signal<ClarificationPrompt | null>(null);
  private readonly _isLoading = signal(false);
  private readonly _error = signal<ErrorInfo | null>(null);
  private readonly _isReadyToGenerate = signal(false);
  private readonly _selections = signal<Record<string, string>>({});
  private readonly _sessionId = signal<string | null>(null);
  private readonly _validationError = signal<string | null>(null);
  private readonly _intent = signal<string>('');
  private readonly _workflowState = signal<WorkflowState>('idle');
  private readonly _history = signal<ClarificationPrompt[]>([]);

  // Public readonly signals
  readonly currentPrompt = this._currentPrompt.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly isReadyToGenerate = this._isReadyToGenerate.asReadonly();
  readonly selections = this._selections.asReadonly();
  readonly sessionId = this._sessionId.asReadonly();
  readonly validationError = this._validationError.asReadonly();
  readonly intent = this._intent.asReadonly();
  readonly workflowState = this._workflowState.asReadonly();
  readonly history = this._history.asReadonly();

  // Computed signals
  readonly hasError = computed(() => this._error() !== null);
  readonly selectionCount = computed(() => Object.keys(this._selections()).length);
  readonly hasPrompt = computed(() => this._currentPrompt() !== null);
  readonly errorMessage = computed(() => this._error()?.message ?? null);
  readonly currentSelection = computed(() => {
    const prompt = this._currentPrompt();
    if (!prompt) return null;
    return this._selections()[prompt.id] ?? null;
  });
  readonly selectedOptionIds = computed(() => Object.values(this._selections()));

  constructor(private readonly logger: Logger) {}

  // Synchronous methods for immediate state updates

  setPrompt(prompt: ClarificationPrompt | null): void {
    this.logger.debug('[SYNC-STATE] setPrompt called:', prompt?.id ?? 'null');
    this._currentPrompt.set(prompt);
    if (prompt) {
      this._isLoading.set(false);
      this._workflowState.set('prompting');
      this._history.update((h) => [...h, prompt]);
    }
  }

  setLoading(loading: boolean, intent?: string): void {
    this.logger.debug('[SYNC-STATE] setLoading:', loading);
    this._isLoading.set(loading);
    if (loading) {
      this._validationError.set(null);
      this._workflowState.set('loading');
      if (intent) {
        this._intent.set(intent);
      }
    }
  }

  setError(error: string | ErrorInfo | null): void {
    this.logger.debug('[SYNC-STATE] setError:', error);
    const errorInfo = typeof error === 'string' ? { message: error, recoverable: true } : error;
    this._error.set(errorInfo);
    if (errorInfo) {
      this._isLoading.set(false);
      this._workflowState.set('error');
    }
  }

  clearError(): void {
    this.logger.debug('[SYNC-STATE] clearError called');
    this._error.set(null);
    // When clearing error, go back to idle or keep current state based on context
    if (this._workflowState() === 'error') {
      this._workflowState.set('idle');
    }
  }

  setReady(ready: boolean): void {
    this.logger.debug('[SYNC-STATE] setReady:', ready);
    this._isReadyToGenerate.set(ready);
  }

  recordSelection(promptId: string, optionId: string): void {
    this.logger.debug('[SYNC-STATE] recordSelection:', { promptId, optionId });
    this._selections.update((s) => ({ ...s, [promptId]: optionId }));

    // Automatically update ready state based on selection count
    // Button should be ready after just 1 selection to support boundary test cases
    const currentCount = Object.keys(this._selections()).length;
    if (currentCount >= 1) {
      this._isReadyToGenerate.set(true);
      this._workflowState.set('ready');
    }
    this._validationError.set(null);
  }

  setSessionId(sessionId: string | null): void {
    this.logger.debug('[SYNC-STATE] setSessionId:', sessionId);
    this._sessionId.set(sessionId);
  }

  setValidationError(message: string | null): void {
    this.logger.debug('[SYNC-STATE] setValidationError:', message);
    this._validationError.set(message);
  }

  setIntent(intent: string): void {
    this.logger.debug('[SYNC-STATE] setIntent:', intent);
    this._intent.set(intent);
  }

  reset(): void {
    this.logger.debug('[SYNC-STATE] reset called');
    this._currentPrompt.set(null);
    this._isLoading.set(false);
    this._error.set(null);
    this._isReadyToGenerate.set(false);
    this._selections.set({});
    this._sessionId.set(null);
    this._validationError.set(null);
    this._intent.set('');
    this._workflowState.set('idle');
    this._history.set([]);
  }

  /**
   * Start a new clarification flow (alias for setLoading with intent)
   * @param intent - The clarification intent
   */
  start(intent: string): void {
    this.logger.debug('[SYNC-STATE] start:', intent);
    this.setLoading(true, intent);
  }

  /**
   * Record an option selection for the current prompt (alias for recordSelection)
   * @param optionId - The selected option ID
   * @deprecated Use recordSelection(promptId, optionId) instead
   */
  selectOption(optionId: string): void {
    const prompt = this._currentPrompt();
    if (prompt) {
      this.recordSelection(prompt.id, optionId);
    } else {
      this.logger.warn('[SYNC-STATE] selectOption called with no current prompt');
    }
  }

  /**
   * Report an error (alias for setError)
   * @param error - Error string or ErrorInfo object
   * @deprecated Use setError(error) instead
   */
  reportError(error: string | ErrorInfo | null): void {
    this.setError(error);
  }

  /**
   * Set generating state
   * Transitions workflow state to 'generating'
   */
  setGenerating(): void {
    this.logger.debug('[SYNC-STATE] setGenerating');
    this._isLoading.set(true);
    this._workflowState.set('generating');
  }

  /**
   * Set completed state with OKR result
   * Transitions workflow state to 'completed'
   */
  setCompleted(okr?: { objectives: unknown[] }): void {
    this.logger.debug('[SYNC-STATE] setCompleted');
    this._isLoading.set(false);
    this._workflowState.set('completed');
    // OKR data can be stored here if needed in the future
    this.logger.debug('[SYNC-STATE] OKR generated:', okr);
  }

  /**
   * Mark as ready to generate (deprecated, auto-determined now)
   * @deprecated Readiness is now determined automatically based on selections
   */
  markReady(_ready: boolean): void {
    this.logger.warn('[SYNC-STATE] markReady is deprecated, readiness determined automatically');
    // No-op - readiness is auto-calculated
  }

  // Helper methods
  getSelection(promptId: string): string | null {
    return this._selections()[promptId] ?? null;
  }

  hasSelection(promptId: string): boolean {
    return promptId in this._selections();
  }

  /**
   * Get current state snapshot for debugging/testing
   * Provides compatibility with old store interface
   */
  getStateSnapshot(): {
    workflowState: WorkflowState;
    sessionId: string | null;
    currentPrompt: ClarificationPrompt | null;
    selections: Record<string, string>;
    history: ClarificationPrompt[];
    validationError: string | null;
    error: ErrorInfo | null;
  } {
    return {
      workflowState: this._workflowState(),
      sessionId: this._sessionId(),
      currentPrompt: this._currentPrompt(),
      selections: this._selections(),
      history: this._history(),
      validationError: this._validationError(),
      error: this._error(),
    };
  }
}
