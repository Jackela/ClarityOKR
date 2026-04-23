/**
 * LLM Gateway Service - Angular Service for LLM Communication via IPC
 *
 * This service provides a bridge between the Angular renderer and the Electron main
 * process for LLM operations. It wraps IPC calls as RxJS Observables for Angular
 * compatibility and includes telemetry tracking for performance monitoring.
 *
 * Key Responsibilities:
 * - Wraps IPC calls to main process LLM services
 * - Returns Observables for reactive Angular patterns
 * - Records telemetry metrics for each LLM operation
 * - Handles timeout and error scenarios with appropriate telemetry
 *
 * Dependencies:
 * - @clarityokr/contracts: Type definitions for contexts and responses
 * - TelemetryService: Performance and usage tracking
 * - Electron IPC bridge (exposed via window.clarifyOkr)
 *
 * @module clarification/services/llm-gateway.service
 *
 * @example
 * ```typescript
 * // In a component or service
 * constructor(private llmGateway: LlmGatewayService) {}
 *
 * // Get next clarification question
 * this.llmGateway.getNextQuestion(context, lastChoice).subscribe({
 *   next: (response) => console.log('Question:', response),
 *   error: (err) => console.error('Failed:', err)
 * });
 *
 * // Generate OKR draft
 * this.llmGateway.generateDraft(context).subscribe({
 *   next: (draft) => console.log('Draft:', draft),
 *   error: (err) => console.error('Generation failed:', err)
 * });
 * ```
 */

import { Injectable } from '@angular/core';
import { defer } from 'rxjs';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { BridgeUnavailableError } from '@clarityokr/contracts';
import type { ClarificationContext, LastChoice } from '@clarityokr/contracts';

import type { TelemetryService } from '../../services/telemetry.service';
import { IPC_CHANNELS } from '../../shared/ipc-channel.tokens';
import type { ClarifyOkrApi } from '../../shared/window';

/**
 * Retrieves the Electron IPC bridge from the global window object.
 *
 * @returns The ClarifyOkrApi bridge for IPC communication
 * @throws Error if the bridge is not available (e.g., not running in Electron)
 *
 * @example
 * ```typescript
 * const bridge = bridgeOrThrow();
 * const result = await bridge.invoke('channel', data);
 * ```
 */
function bridgeOrThrow(): ClarifyOkrApi {
  const candidate = window.clarifyOkr;
  if (!candidate) throw new BridgeUnavailableError();
  return candidate;
}

/**
 * Service for communicating with LLM functionality through Electron IPC.
 *
 * This service wraps IPC calls to the main process and exposes them as RxJS
 * Observables, making it easy to integrate with Angular's reactive patterns.
 * It automatically tracks telemetry for each operation to monitor performance
 * and reliability.
 *
 * The service uses the Electron contextBridge API exposed via window.clarifyOkr
 * to securely communicate with the main process without exposing Node.js APIs
 * to the renderer.
 *
 * @example
 * ```typescript
 * @Component({...})
 * export class ClarificationComponent {
 *   constructor(private llmGateway: LlmGatewayService) {}
 *
 *   loadNextQuestion(context: ClarificationContext, choice: LastChoice) {
 *     this.llmGateway.getNextQuestion(context, choice).subscribe({
 *       next: (question) => this.displayQuestion(question),
 *       error: (err) => this.handleError(err)
 *     });
 *   }
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class LlmGatewayService {
  /**
   * Creates a new LLM gateway service instance.
   *
   * @param telemetry - Service for recording performance metrics and call statistics
   */
  constructor(private readonly telemetry: TelemetryService) {}

  /**
   * Requests the next clarification question from the LLM via IPC.
   *
   * Sends the current clarification context and the user's last choice to the
   * main process, which forwards the request to the LLM service. Returns an
   * Observable that emits the next question response.
   *
   * This method records telemetry for successful calls to track performance.
   *
   * @param context - Current clarification session context containing turn history
   * @param lastChoice - The user's most recent selection (questionId and optionId)
   * @returns Observable that emits the next question response from the LLM
   *
   * @example
   * ```typescript
   * const context: ClarificationContext = {
   *   turns: [{ questionId: 'q1', optionId: 'opt1', timestamp: '2024-01-15T10:00:00Z' }]
   * };
   * const lastChoice: LastChoice = { questionId: 'q1', optionId: 'opt1' };
   *
   * this.llmGateway.getNextQuestion(context, lastChoice).subscribe({
   *   next: (response) => {
   *     console.log('Next question:', response.question);
   *     console.log('Options:', response.options);
   *   },
   *   error: (err) => console.error('Failed to get question:', err)
   * });
   * ```
   */
  getNextQuestion(context: ClarificationContext, lastChoice: LastChoice): Observable<unknown> {
    const bridge = bridgeOrThrow();
    const started = performance.now();
    return defer(() => bridge.invoke(IPC_CHANNELS.LLM_NEXT_QUESTION, { context, lastChoice })).pipe(
      tap(() => this.telemetry.recordCall('next-question', 'success', performance.now() - started)),
    );
  }

  /**
   * Generates an OKR draft based on the completed clarification context via IPC.
   *
   * Sends the complete clarification context to the main process, which forwards
   * the request to the LLM service for OKR generation. Returns an Observable
   * that emits the generated draft response.
   *
   * This method records telemetry for both successful calls and failures,
   * including timeout detection based on error message patterns.
   *
   * @param context - Complete clarification session context with all user turns
   * @returns Observable that emits the OKR draft response from the LLM
   *
   * @example
   * ```typescript
   * const context: ClarificationContext = {
   *   turns: [
   *     { questionId: 'q1', optionId: 'opt1', timestamp: '2024-01-15T10:00:00Z' },
   *     { questionId: 'q2', optionId: 'opt3', timestamp: '2024-01-15T10:05:00Z' }
   *   ]
   * };
   *
   * this.llmGateway.generateDraft(context).subscribe({
   *   next: (draft) => {
   *     console.log('Generated objective:', draft.objective);
   *     console.log('Key results:', draft.keyResults);
   *   },
   *   error: (err) => {
   *     if (err.message.includes('timeout')) {
   *       console.error('Request timed out');
   *     } else {
   *       console.error('Generation failed:', err);
   *     }
   *   }
   * });
   * ```
   */
  generateDraft(context: ClarificationContext): Observable<unknown> {
    const bridge = bridgeOrThrow();
    const started = performance.now();
    return defer(() => bridge.invoke(IPC_CHANNELS.LLM_GENERATE_DRAFT, { context })).pipe(
      tap({
        next: () => this.telemetry.recordCall('draft', 'success', performance.now() - started),
        error: (e) =>
          this.telemetry.recordCall(
            'draft',
            /timeout/i.test(String(e)) ? 'timeout' : 'error',
            performance.now() - started,
          ),
      }),
    );
  }
}
