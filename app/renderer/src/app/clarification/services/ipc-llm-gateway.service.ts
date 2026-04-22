/**
 * IpcLlmGateway - Production Implementation of LlmGateway using Electron IPC
 *
 * This module provides the production-ready implementation of the LlmGateway interface,
 * communicating with the Electron main process via secure IPC channels. It wraps
 * Promise-based IPC calls as RxJS Observables for seamless Angular integration.
 *
 * Key Responsibilities:
 * - Implements LlmGatewayObservable interface for type-safe LLM communication
 * - Wraps IPC calls as Observables for reactive Angular patterns
 * - Records telemetry metrics for performance monitoring
 * - Handles both success and error scenarios with appropriate telemetry
 *
 * Architecture:
 * - Uses Electron's contextBridge API for secure main-renderer communication
 * - Leverages RxJS operators for reactive error handling and telemetry
 * - Implements the LlmGatewayObservable interface from shared contracts
 *
 * Dependencies:
 * - @clarityokr/contracts: Type definitions and interfaces
 * - TelemetryService: Performance tracking and call statistics
 * - Electron IPC bridge (exposed via window.clarifyOkr)
 *
 * @module clarification/services/ipc-llm-gateway.service
 *
 * @example
 * ```typescript
 * // Register as a provider in your Angular module or component
 * providers: [
 *   { provide: LLM_GATEWAY_TOKEN, useClass: IpcLlmGateway }
 * ]
 *
 * // Inject and use in a component
 * constructor(@Inject(LLM_GATEWAY_TOKEN) private llmGateway: LlmGatewayObservable) {}
 *
 * // Get next question
 * this.llmGateway.getNextQuestion(context, lastChoice).subscribe({
 *   next: (response) => console.log('Question:', response),
 *   error: (err) => console.error('Error:', err)
 * });
 * ```
 */

import { Injectable } from '@angular/core';
import {
  BridgeUnavailableError,
  type ClarificationContext,
  type DraftResponse,
  type LastChoice,
  type LlmGatewayObservable,
  type NextQuestionResponse,
} from '@clarityokr/contracts';
import { defer } from 'rxjs';
import type { Observable } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';

import type { TelemetryService } from '../../services/telemetry.service';
import { IPC_CHANNELS } from '../../shared/ipc-channel.tokens';
import type { ClarifyOkrApi } from '../../shared/window';

/**
 * Retrieves the Electron IPC bridge from the global window object.
 *
 * The ClarifyOkrApi bridge is injected into the renderer window by the preload
 * script using Electron's contextBridge API. This provides a secure, type-safe
 * way to communicate with the main process without exposing Node.js APIs.
 *
 * @returns The ClarifyOkrApi bridge for IPC communication
 * @throws Error if the bridge is not available (e.g., not running in Electron,
 *         or preload script failed to initialize)
 *
 * @example
 * ```typescript
 * try {
 *   const bridge = bridgeOrThrow();
 *   const result = await bridge.invoke(IPC_CHANNELS.LLM_NEXT_QUESTION, data);
 * } catch (e) {
 *   console.error('Bridge unavailable:', e.message);
 * }
 * ```
 */
function bridgeOrThrow(): ClarifyOkrApi {
  const candidate = window.clarifyOkr;
  if (!candidate) throw new BridgeUnavailableError();
  return candidate;
}

/**
 * Injectable service that implements LlmGateway interface using IPC.
 *
 * This is the production implementation used in the Electron environment. It
 * communicates with the main process through the secure IPC bridge exposed via
 * window.clarifyOkr. All LLM operations are wrapped as RxJS Observables for
 * compatibility with Angular's reactive patterns.
 *
 * The service implements the LlmGatewayObservable interface, making it suitable
 * for dependency injection using the LLM_GATEWAY_TOKEN provider token.
 *
 * Usage in Angular:
 * ```typescript
 * // In app.config.ts or a module
 * providers: [
 *   { provide: LLM_GATEWAY_TOKEN, useClass: IpcLlmGateway }
 * ]
 * ```
 *
 * @example
 * ```typescript
 * @Component({
 *   selector: 'app-clarification',
 *   template: `...`
 * })
 * export class ClarificationComponent {
 *   constructor(
 *     @Inject(LLM_GATEWAY_TOKEN) private llmGateway: LlmGatewayObservable
 *   ) {}
 *
 *   fetchNextQuestion(context: ClarificationContext, choice: LastChoice) {
 *     this.llmGateway.getNextQuestion(context, choice).pipe(
 *       tap(response => console.log('Received:', response)),
 *       catchError(err => {
 *         console.error('Failed:', err);
 *         return EMPTY;
 *       })
 *     ).subscribe();
 *   }
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class IpcLlmGateway implements LlmGatewayObservable<Observable<unknown>> {
  /**
   * Creates a new IpcLlmGateway instance.
   *
   * @param telemetry - Service for recording performance metrics and telemetry data.
   *                    Tracks call duration and outcomes (success/error/timeout).
   */
  constructor(private readonly telemetry: TelemetryService) {}

  /**
   * Requests the next clarification question from the LLM via IPC.
   *
   * Sends the current clarification context and the user's most recent choice
   * to the main process, which forwards the request to the LLM service. The
   * response is wrapped as an Observable for Angular compatibility.
   *
   * Telemetry is recorded for all successful calls to track performance metrics
   * such as latency and throughput.
   *
   * @param context - Current clarification session context containing the full
   *                  turn history (questions and user selections)
   * @param lastChoice - The user's most recent selection, containing the
   *                     questionId and optionId that was chosen
   * @returns Observable emitting the next question response, including the
   *          question text and available options
   *
   * @example
   * ```typescript
   * const context: ClarificationContext = {
   *   turns: [
   *     { questionId: 'q1', optionId: 'opt1', timestamp: '2024-01-15T10:00:00Z' }
   *   ]
   * };
   * const lastChoice: LastChoice = { questionId: 'q1', optionId: 'opt1' };
   *
   * this.llmGateway.getNextQuestion(context, lastChoice).subscribe({
   *   next: (response: NextQuestionResponse) => {
   *     console.log('Question:', response.question);
   *     console.log('Options:', response.options);
   *     // Update UI with new question
   *   },
   *   error: (err) => {
   *     console.error('Failed to get next question:', err);
   *     // Handle error (show message, retry, etc.)
   *   }
   * });
   * ```
   */
  getNextQuestion(
    context: ClarificationContext,
    lastChoice: LastChoice,
  ): Observable<NextQuestionResponse> {
    const bridge = bridgeOrThrow();
    const started = performance.now();

    return defer(
      () =>
        bridge.invoke(IPC_CHANNELS.LLM_NEXT_QUESTION, {
          context,
          lastChoice,
        }) as Promise<NextQuestionResponse>,
    ).pipe(
      tap(() => this.telemetry.recordCall('next-question', 'success', performance.now() - started)),
      finalize(() => void 0),
    );
  }

  /**
   * Generates an OKR draft based on the completed clarification context via IPC.
   *
   * Sends the complete clarification context to the main process, which forwards
   * the request to the LLM service for OKR generation. The response is wrapped
   * as an Observable for Angular compatibility.
   *
   * Telemetry is recorded for both successful calls and failures, with special
   * handling for timeout detection based on error message patterns.
   *
   * @param context - Complete clarification session context containing all user
   *                  turns from the entire clarification flow
   * @returns Observable emitting the OKR draft response, including the objective
   *          and array of key results
   *
   * @example
   * ```typescript
   * const context: ClarificationContext = {
   *   turns: [
   *     { questionId: 'q1', optionId: 'opt1', timestamp: '2024-01-15T10:00:00Z' },
   *     { questionId: 'q2', optionId: 'opt2', timestamp: '2024-01-15T10:05:00Z' },
   *     { questionId: 'q3', optionId: 'opt4', timestamp: '2024-01-15T10:10:00Z' }
   *   ]
   * };
   *
   * this.llmGateway.generateDraft(context).subscribe({
   *   next: (response: DraftResponse) => {
   *     console.log('Objective:', response.objective);
   *     console.log('Key Results:', response.keyResults);
   *     // Display draft to user
   *   },
   *   error: (err) => {
   *     console.error('Draft generation failed:', err);
   *     // Check if it was a timeout
   *     if (err.message?.includes('timeout')) {
   *       // Show timeout-specific message
   *     }
   *   }
   * });
   * ```
   */
  generateDraft(context: ClarificationContext): Observable<DraftResponse> {
    const bridge = bridgeOrThrow();
    const started = performance.now();

    return defer(
      () => bridge.invoke(IPC_CHANNELS.LLM_GENERATE_DRAFT, { context }) as Promise<DraftResponse>,
    ).pipe(
      tap({
        next: () => this.telemetry.recordCall('draft', 'success', performance.now() - started),
        error: (e) =>
          this.telemetry.recordCall(
            'draft',
            /timeout/i.test(String(e)) ? 'timeout' : 'error',
            performance.now() - started,
          ),
      }),
      finalize(() => void 0),
    );
  }
}

/**
 * Factory class for creating IpcLlmGateway instances.
 *
 * This factory is useful for testing scenarios where you need to create
 * gateway instances with specific dependencies, or when configuring
 * the service with custom telemetry implementations.
 *
 * @example
 * ```typescript
 * // In a test setup
 * const factory = new IpcLlmGatewayFactory(mockTelemetry);
 * const gateway = factory.create();
 *
 * // In production code with custom telemetry
 * const factory = new IpcLlmGatewayFactory(customTelemetryService);
 * const gateway = factory.create();
 * ```
 */
export class IpcLlmGatewayFactory {
  /**
   * Creates a new IpcLlmGatewayFactory instance.
   *
   * @param telemetry - Telemetry service to inject into created gateways
   */
  constructor(private readonly telemetry: TelemetryService) {}

  /**
   * Creates a new IpcLlmGateway instance.
   *
   * @returns A new IpcLlmGateway configured with the factory's telemetry service
   */
  create(): IpcLlmGateway {
    return new IpcLlmGateway(this.telemetry);
  }
}
