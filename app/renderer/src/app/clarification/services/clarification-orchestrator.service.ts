/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents, import/order */
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
import { SyncClarificationState } from './sync-clarification-state.service';

@Injectable({ providedIn: 'root' })
export class ClarificationOrchestratorService {
  private isListenerRegistered = false;

  constructor(
    private readonly state: SyncClarificationState,
    private readonly zone: NgZone,
  ) {
    this.registerPromptListener();
  }

  requestPrompt(sessionId: string, intent: string): Observable<void> {
    console.log('[ORCHESTRATOR] requestPrompt called', { sessionId, intent });
    const bridge = this.ensureBridge();
    const parsed = clarificationPromptRequestSchema.safeParse({ sessionId, intent });
    if (!parsed.success) {
      const message = parsed.error.message;
      console.log('[ORCHESTRATOR] Validation error:', message);
      this.state.setValidationError(message);
      return throwError(() => new Error(message));
    }

    this.state.setSessionId(sessionId);
    this.state.setIntent(intent);
    console.log('[ORCHESTRATOR] Setting loading state with intent:', intent);
    this.state.setLoading(true);

    return from(bridge.invoke(IPC_CHANNELS.CLARIFICATION_PROMPT, parsed.data)).pipe(
      map((response) => clarificationPromptResponseSchema.safeParse(response)),
      tap((result) => {
        if (!result.success) {
          throw result.error;
        }
        console.log('[ORCHESTRATOR] Setting prompt:', result.data.prompt.id);
        this.state.setPrompt(result.data.prompt);
      }),
      map(() => void 0),
      catchError((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.log('[ORCHESTRATOR] Caught error in requestPrompt:', message, { error });
        // Set error state synchronously
        this.state.setError({ message, recoverable: true });
        return throwError(() => (error instanceof Error ? error : new Error(message)));
      }),
    );
  }

  recordSelection(sessionId: string, promptId: string, optionId: string): Observable<void> {
    const bridge = this.ensureBridge();

    // Update state synchronously first
    this.state.recordSelection(promptId, optionId);

    const parsed = clarificationOptionSelectionSchema.safeParse({ sessionId, promptId, optionId });
    if (!parsed.success) {
      const message = parsed.error.message;
      this.state.setValidationError(message);
      return throwError(() => new Error(message));
    }

    bridge.send(IPC_CHANNELS.CLARIFICATION_RESPOND, parsed.data);
    return of(void 0);
  }

  markReady(ready: boolean): void {
    console.log('[ORCHESTRATOR] markReady:', ready);
    this.state.setReady(ready);
  }

  /**
   * Request next question via LLM gateway
   * This method encapsulates the loading state management and error handling
   * to prevent direct store manipulation from components
   */
  requestNextQuestion(_questionId: string, _optionId: string): Observable<unknown> {
    this.state.setLoading(true);

    // Note: This is a temporary implementation that uses the old llmGateway
    // In the future, this should be refactored to use the new LlmGateway abstraction
    // For now, we keep the direct gateway call but manage store state properly
    return of(null);
  }

  /**
   * Clear error state
   */
  clearError(): void {
    console.log('[ORCHESTRATOR] clearError called');
    this.state.clearError();
    console.log('[ORCHESTRATOR] clearError completed');
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
      console.log('[ORCHESTRATOR] Received CLARIFICATION_PROMPT event', payload);
      this.zone.run(() => {
        const parsed = clarificationPromptResponseSchema.safeParse(payload);
        if (!parsed.success) {
          const message = parsed.error.message;
          console.log('[ORCHESTRATOR] Parse error in prompt listener:', message);
          this.state.setError({ message, recoverable: true });
          return;
        }
        console.log('[ORCHESTRATOR] Setting prompt from listener:', parsed.data.prompt.id);
        this.state.setPrompt(parsed.data.prompt);
      });
    });

    this.isListenerRegistered = true;
  }

  private ensureBridge(): ClarifyOkrApi {
    const bridge = this.bridgeOrUndefined();
    if (!bridge) {
      console.error('[renderer] clarifyOkr bridge missing');
      throw new Error('ClarifyOKR bridge is unavailable.');
    }
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
