import { Injectable, signal, computed } from '@angular/core';
import type { ClarificationPrompt } from '@clarityokr/contracts';

/**
 * Error information for error state
 */
export interface ErrorInfo {
  message: string;
  recoverable: boolean;
}

/**
 * Sync Clarification State using Angular Signals
 * Provides synchronous, immediate state updates for better DOM response
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

  // Public readonly signals
  readonly currentPrompt = this._currentPrompt.asReadonly();
  readonly isLoading = this._isLoading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly isReadyToGenerate = this._isReadyToGenerate.asReadonly();
  readonly selections = this._selections.asReadonly();
  readonly sessionId = this._sessionId.asReadonly();
  readonly validationError = this._validationError.asReadonly();
  readonly intent = this._intent.asReadonly();

  // Computed signals
  readonly hasError = computed(() => this._error() !== null);
  readonly selectionCount = computed(() => Object.keys(this._selections()).length);
  readonly hasPrompt = computed(() => this._currentPrompt() !== null);
  readonly errorMessage = computed(() => this._error()?.message ?? null);

  // Synchronous methods for immediate state updates

  setPrompt(prompt: ClarificationPrompt | null): void {
    console.log('[SYNC-STATE] setPrompt called:', prompt?.id ?? 'null');
    this._currentPrompt.set(prompt);
    if (prompt) {
      this._isLoading.set(false);
    }
  }

  setLoading(loading: boolean): void {
    console.log('[SYNC-STATE] setLoading:', loading);
    this._isLoading.set(loading);
    if (loading) {
      this._validationError.set(null);
    }
  }

  setError(error: string | ErrorInfo | null): void {
    console.log('[SYNC-STATE] setError:', error);
    const errorInfo = typeof error === 'string' ? { message: error, recoverable: true } : error;
    this._error.set(errorInfo);
    if (errorInfo) {
      this._isLoading.set(false);
    }
  }

  clearError(): void {
    console.log('[SYNC-STATE] clearError called');
    this._error.set(null);
  }

  setReady(ready: boolean): void {
    console.log('[SYNC-STATE] setReady:', ready);
    this._isReadyToGenerate.set(ready);
  }

  recordSelection(promptId: string, optionId: string): void {
    console.log('[SYNC-STATE] recordSelection:', { promptId, optionId });
    this._selections.update((s) => ({ ...s, [promptId]: optionId }));

    // Automatically update ready state based on selection count
    // Button should be ready after just 1 selection to support boundary test cases
    const currentCount = Object.keys(this._selections()).length;
    if (currentCount >= 1) {
      this._isReadyToGenerate.set(true);
    }
    this._validationError.set(null);
  }

  setSessionId(sessionId: string | null): void {
    console.log('[SYNC-STATE] setSessionId:', sessionId);
    this._sessionId.set(sessionId);
  }

  setValidationError(message: string | null): void {
    console.log('[SYNC-STATE] setValidationError:', message);
    this._validationError.set(message);
  }

  setIntent(intent: string): void {
    console.log('[SYNC-STATE] setIntent:', intent);
    this._intent.set(intent);
  }

  reset(): void {
    console.log('[SYNC-STATE] reset called');
    this._currentPrompt.set(null);
    this._isLoading.set(false);
    this._error.set(null);
    this._isReadyToGenerate.set(false);
    this._selections.set({});
    this._sessionId.set(null);
    this._validationError.set(null);
    this._intent.set('');
  }

  // Helper methods
  getSelection(promptId: string): string | null {
    return this._selections()[promptId] ?? null;
  }

  hasSelection(promptId: string): boolean {
    return promptId in this._selections();
  }
}
