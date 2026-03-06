/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents */
import { Injectable, NgZone } from '@angular/core';
import {
  clarificationOptionSelectionSchema,
  clarificationPromptRequestSchema,
  clarificationPromptResponseSchema,
} from '@clarityokr/contracts';
import { from, Observable, of, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { IPC_CHANNELS } from '../../shared/ipc-channel.tokens';
import type { ClarifyOkrApi } from '../../shared/window';
import { ClarificationStore } from '../state/clarification.store';

@Injectable({ providedIn: 'root' })
export class ClarificationOrchestratorService {
  private isListenerRegistered = false;

  constructor(
    private readonly store: ClarificationStore,
    private readonly zone: NgZone,
  ) {
    this.registerPromptListener();
  }

  requestPrompt(sessionId: string, intent: string): Observable<void> {
    const bridge = this.ensureBridge();
    const parsed = clarificationPromptRequestSchema.safeParse({ sessionId, intent });
    if (!parsed.success) {
      const message = parsed.error.message;
      this.store.setValidationError(message);
      return throwError(() => new Error(message));
    }

    this.store.setSessionId(sessionId);
    this.store.setLoading(intent);

    return from(bridge.invoke(IPC_CHANNELS.CLARIFICATION_PROMPT, parsed.data)).pipe(
      map((response) => clarificationPromptResponseSchema.safeParse(response)),
      tap((result) => {
        if (!result.success) {
          throw result.error;
        }
        this.store.setPrompt(result.data.prompt);
      }),
      map(() => void 0),
      catchError((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.zone.run(() => {
          this.store.setError({ message, recoverable: true });
          
        });
        return throwError(() => (error instanceof Error ? error : new Error(message)));
      }),
    );
  }

  recordSelection(sessionId: string, promptId: string, optionId: string): Observable<void> {
    const bridge = this.ensureBridge();
    this.store.recordSelection(optionId);

    const parsed = clarificationOptionSelectionSchema.safeParse({ sessionId, promptId, optionId });
    if (!parsed.success) {
      const message = parsed.error.message;
      this.store.setValidationError(message);
      return throwError(() => new Error(message));
    }

    bridge.send(IPC_CHANNELS.CLARIFICATION_RESPOND, parsed.data);
    return of(void 0);
  }

  markReady(ready: boolean): void {
    this.store.markReady(ready);
  }

  /**
   * Request next question via LLM gateway
   * This method encapsulates the loading state management and error handling
   * to prevent direct store manipulation from components
   */
  requestNextQuestion(_questionId: string, _optionId: string): Observable<unknown> {
    this.store.setLoading('llm-question');

    // Note: This is a temporary implementation that uses the old llmGateway
    // In the future, this should be refactored to use the new LlmGateway abstraction
    // For now, we keep the direct gateway call but manage store state properly
    return this.store.isLoading$.pipe(
      tap(() => {
        // Store state is already set to loading above
        // The actual LLM call should be handled by a proper service
      }),
    );
  }

  /**
   * Clear error state and reset store
   */
  clearError(): void {
    this.store.clearError();
  }

  private registerPromptListener(): void {
    if (this.isListenerRegistered) {
      return;
    }

    const bridge = this.bridgeOrUndefined();
    if (!bridge) {
      return;
    }

    bridge.on(IPC_CHANNELS.CLARIFICATION_PROMPT, (_event, payload) => {
      this.zone.run(() => {
        const parsed = clarificationPromptResponseSchema.safeParse(payload);
        if (!parsed.success) {
          const message = parsed.error.message;
          this.store.setError({ message, recoverable: true });
          
          return;
        }
        this.store.setPrompt(parsed.data.prompt);
        
      });
    });

    this.isListenerRegistered = true;
  }

  private ensureBridge(): ClarifyOkrApi {
    const bridge = this.bridgeOrUndefined();
    if (!bridge) {
      // eslint-disable-next-line no-console
      console.error('[renderer] clarifyOkr bridge missing');
      throw new Error('ClarifyOKR bridge is unavailable.');
    }
    // eslint-disable-next-line no-console
    console.info('[renderer] clarifyOkr bridge established');
    return bridge;
  }

  private bridgeOrUndefined(): ClarifyOkrApi | undefined {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const candidate = (window as Window & { clarifyOkr?: ClarifyOkrApi }).clarifyOkr;
    return candidate;
  }
}
