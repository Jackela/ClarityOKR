/**
 * Clarification Orchestrator Service - Manages Clarification Flow State and IPC Communication
 *
 * This service orchestrates the clarification wizard flow, managing the communication
 * between the Angular renderer and the Electron main process. It handles prompting,
 * option selection, and state synchronization for the OKR clarification process.
 *
 * Key Responsibilities:
 * - Manages clarification session lifecycle through IPC
 * - Validates and transforms user input using Zod schemas
 * - Synchronizes state with SyncClarificationState service
 * - Registers and manages IPC event listeners for real-time updates
 * - Handles loading states and error recovery
 *
 * Dependencies:
 * - @clarityokr/contracts: Zod schemas and type definitions
 * - SyncClarificationState: State management for clarification sessions
 * - Electron IPC bridge (exposed via window.clarifyOkr)
 *
 * @module clarification/services/clarification-orchestrator.service
 *
 * @example
 * ```typescript
 * // In a component
 * constructor(private orchestrator: ClarificationOrchestratorService) {}
 *
 * // Start a new clarification session
 * this.orchestrator.requestPrompt('session-123', '提高团队效率')
 *   .subscribe({
 *     next: () => console.log('First prompt loaded'),
 *     error: (err) => console.error('Request failed:', err)
 *   });
 *
 * // Record a user's selection
 * this.orchestrator.recordSelection('session-123', 'prompt-1', 'option-a')
 *   .subscribe(() => console.log('Selection recorded'));
 * ```
 */

import { Injectable } from '@angular/core';
import type { OnDestroy, NgZone } from '@angular/core';
import {
  BridgeUnavailableError,
  clarificationOptionSelectionSchema,
  clarificationPromptRequestSchema,
  clarificationPromptResponseSchema,
} from '@clarityokr/contracts';
import type { ClarificationContext, LastChoice } from '@clarityokr/contracts';
import { from, of, throwError } from 'rxjs';
import type { Observable } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import type { Logger } from '../../core/services/logger.service';
import { IPC_CHANNELS } from '../../shared/ipc-channel.tokens';
import type { ClarifyOkrApi } from '../../shared/window';

import type { ClarificationStateMachine } from './clarification-state-machine.service';

/**
 * Service that orchestrates the clarification flow between renderer and main process.
 *
 * This service acts as the primary coordinator for the OKR clarification wizard.
 * It manages IPC communication, validates all inputs using Zod schemas, and keeps
 * the UI state synchronized with the main process through the SyncClarificationState
 * service. The service automatically registers IPC listeners on construction and
 * cleans them up on destruction.
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class ClarificationWizardComponent implements OnDestroy {
 *   constructor(private orchestrator: ClarificationOrchestratorService) {}
 *
 *   startClarification(intent: string) {
 *     this.orchestrator.requestPrompt('session-123', intent)
 *       .subscribe({
 *         next: () => this.showPrompt(),
 *         error: (err) => this.showError(err.message)
 *       });
 *   }
 *
 *   ngOnDestroy() {
 *     // Service handles its own cleanup via ngOnDestroy
 *   }
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class ClarificationOrchestratorService implements OnDestroy {
  private isListenerRegistered = false;
  private promptListenerUnsubscribe?: () => void;

  /**
   * Creates a new clarification orchestrator service instance.
   *
   * Automatically registers the IPC prompt listener on construction.
   *
   * @param state - Service for managing clarification session state
   * @param zone - Angular NgZone for running callbacks in Angular context
   * @param logger - Logger service for debugging and error reporting
   */
  constructor(
    private readonly state: ClarificationStateMachine,
    private readonly zone: NgZone,
    private readonly logger: Logger,
  ) {
    this.registerPromptListener();
  }

  /**
   * Cleans up IPC listeners when the service is destroyed.
   *
   * Called automatically by Angular when the service is no longer needed.
   * Unsubscribes from IPC events and resets listener registration state.
   */
  ngOnDestroy(): void {
    if (this.promptListenerUnsubscribe) {
      this.promptListenerUnsubscribe();
      this.promptListenerUnsubscribe = undefined;
      this.isListenerRegistered = false;
      this.logger.debug('[ORCHESTRATOR] IPC listener cleaned up');
    }
  }

  /**
   * Starts the clarification flow and requests the first prompt.
   *
   * Validates the session ID and intent, sets the loading state, then calls the
   * Electron IPC channel to request the LLM to return the first clarification prompt.
   * Updates the state to prompting on success.
   *
   * @param sessionId - Unique identifier for the clarification session
   * @param intent - The user's initial goal or objective description
   * @returns Observable that completes after successfully setting the prompt, throws on error
   * @throws Error when validation fails or IPC call fails
   *
   * @example
   * ```typescript
   * orchestrator.requestPrompt('session-123', 'Improve team efficiency')
   *   .subscribe({
   *     next: () => console.log('First prompt loaded'),
   *     error: (err) => console.error('Request failed:', err)
   *   });
   * ```
   */
  requestPrompt(sessionId: string, intent: string): Observable<void> {
    this.logger.debug('[ORCHESTRATOR] requestPrompt called', { sessionId, intent });
    const bridge = this.ensureBridge();
    const parsed = clarificationPromptRequestSchema.safeParse({ sessionId, intent });
    if (!parsed.success) {
      const message = parsed.error.message;
      this.logger.debug('[ORCHESTRATOR] Validation error:', message);
      this.state.setValidationError(message);
      return throwError(() => new Error(message));
    }

    this.state.setSessionId(sessionId);
    this.logger.debug('[ORCHESTRATOR] Setting loading state with intent:', intent);
    this.state.start(intent);

    return from(bridge.invoke(IPC_CHANNELS.CLARIFICATION_PROMPT, parsed.data)).pipe(
      map((response) => clarificationPromptResponseSchema.safeParse(response)),
      tap((result) => {
        if (!result.success) {
          throw result.error;
        }
        this.logger.debug('[ORCHESTRATOR] Setting prompt:', result.data.prompt.id);
        this.state.setPrompt(result.data.prompt);
      }),
      map(() => void 0),
      catchError((error) => {
        const message = error instanceof Error ? error.message : String(error);
        const safeError = error instanceof Error ? error : new Error(String(error));
        this.logger.debug('[ORCHESTRATOR] Caught error in requestPrompt:', message, {
          error: safeError,
        });
        // Set error state synchronously
        this.state.setError({ message, recoverable: true });
        return throwError(() => (error instanceof Error ? error : new Error(message)));
      }),
    );
  }

  /**
   * Handles user selection of a clarification prompt option.
   *
   * Updates state synchronously to record the user's selection, then sends the
   * selection to the main process via the IPC channel. The main process decides
   * the next prompt or triggers OKR generation based on the selection.
   *
   * @param sessionId - Unique identifier for the current session
   * @param promptId - Unique identifier for the current prompt
   * @param optionId - ID of the option selected by the user
   * @returns Observable that completes when the selection has been sent
   * @throws Error when validation fails
   *
   * @example
   * ```typescript
   * orchestrator.recordSelection('session-123', 'prompt-1', 'option-a')
   *   .subscribe(() => console.log('Selection recorded'));
   * ```
   */
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

  requestNextQuestion(_questionId: string, _optionId: string): Observable<void> {
    this.logger.debug('[ORCHESTRATOR] requestNextQuestion called', { _questionId, _optionId });
    const bridge = this.ensureBridge();

    const snapshot = this.state.getStateSnapshot();
    const turns = Object.entries(snapshot.selections).map(([questionId, optionId]) => ({
      questionId,
      optionId,
      timestamp: new Date().toISOString(),
    }));
    const context: ClarificationContext = { turns };

    const lastChoice: LastChoice = {
      questionId: _questionId,
      optionId: _optionId,
    };

    this.state.setLoading(true);

    return from(bridge.invoke(IPC_CHANNELS.LLM_NEXT_QUESTION, { context, lastChoice })).pipe(
      map((response) => clarificationPromptResponseSchema.safeParse(response)),
      tap((result) => {
        if (!result.success) {
          throw result.error;
        }
        this.logger.debug('[ORCHESTRATOR] Setting prompt:', result.data.prompt.id);
        this.state.setPrompt(result.data.prompt);
      }),
      map(() => void 0),
      catchError((error) => {
        const message = error instanceof Error ? error.message : String(error);
        const safeError = error instanceof Error ? error : new Error(String(error));
        this.logger.debug('[ORCHESTRATOR] Caught error in requestNextQuestion:', message, {
          error: safeError,
        });
        this.state.setError({ message, recoverable: true });
        return throwError(() => (error instanceof Error ? error : new Error(message)));
      }),
    );
  }

  /**
   * Clears the current error state.
   *
   * Resets any error or validation error state in the clarification session,
   * allowing the user to retry failed operations or continue after an error.
   *
   * @example
   * ```typescript
   * // After displaying an error message with a retry button
   * orchestrator.clearError();
   * ```
   */
  clearError(): void {
    this.logger.debug('[ORCHESTRATOR] clearError called');
    this.state.clearError();
    this.logger.debug('[ORCHESTRATOR] clearError completed');
  }

  private registerPromptListener(): void {
    if (this.isListenerRegistered) {
      return;
    }

    const bridge = this.bridgeOrUndefined();
    if (!bridge) {
      return;
    }

    this.promptListenerUnsubscribe = bridge.on(
      IPC_CHANNELS.CLARIFICATION_PROMPT,
      (_event, payload) => {
        this.logger.debug('[ORCHESTRATOR] Received CLARIFICATION_PROMPT event', payload);
        this.zone.run(() => {
          const parsed = clarificationPromptResponseSchema.safeParse(payload);
          if (!parsed.success) {
            const message = parsed.error.message;
            this.logger.debug('[ORCHESTRATOR] Parse error in prompt listener:', message);
            this.state.setError({ message, recoverable: true });
            return;
          }
          this.logger.debug('[ORCHESTRATOR] Setting prompt from listener:', parsed.data.prompt.id);
          this.state.setPrompt(parsed.data.prompt);
        });
      },
    );

    this.isListenerRegistered = true;
    this.logger.debug('[ORCHESTRATOR] IPC listener registered');
  }

  private ensureBridge(): ClarifyOkrApi {
    const bridge = this.bridgeOrUndefined();
    if (!bridge) {
      this.logger.error('[renderer] clarifyOkr bridge missing');
        throw new BridgeUnavailableError();
    }
    this.logger.info('[renderer] clarifyOkr bridge established');
    return bridge;
  }

  private bridgeOrUndefined(): ClarifyOkrApi | undefined {
    if (typeof window === 'undefined') {
      return undefined;
    }
    return window.clarifyOkr;
  }
}
