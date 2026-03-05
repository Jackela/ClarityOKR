/**
 * IpcLlmGateway - Production implementation of LlmGateway using Electron IPC
 *
 * This implementation communicates with the main process via Electron's IPC bridge.
 * It wraps Promise-based calls as Observables for Angular compatibility.
 */

import { Injectable } from '@angular/core';
import { defer, Observable } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';

import type {
  ClarificationContext,
  DraftResponse,
  LastChoice,
  LlmGateway,
  NextQuestionResponse,
} from '@clarityokr/contracts';

import { IPC_CHANNELS } from '../../shared/ipc-channel.tokens';
import type { ClarifyOkrApi } from '../../shared/window';

import { TelemetryService } from '../../services/telemetry.service';

function bridgeOrThrow(): ClarifyOkrApi {
  const candidate = (window as Window & { clarifyOkr?: ClarifyOkrApi }).clarifyOkr;
  if (!candidate) throw new Error('ClarifyOKR bridge is unavailable.');
  return candidate;
}

/**
 * Injectable service that implements LlmGateway interface using IPC.
 *
 * Usage in Angular:
 * ```typescript
 * providers: [
 *   { provide: LLM_GATEWAY_TOKEN, useClass: IpcLlmGateway }
 * ]
 * ```
 */
@Injectable({ providedIn: 'root' })
export class IpcLlmGateway implements LlmGateway {
  constructor(private readonly telemetry: TelemetryService) {}

  /**
   * Get the next question via IPC (returns Observable for Angular compatibility)
   * This is the primary method used by components.
   */
  getNextQuestion(
    context: ClarificationContext,
    lastChoice: LastChoice,
  ): Observable<NextQuestionResponse> {
    const bridge = bridgeOrThrow();
    const started = performance.now();

    return defer(() => bridge.invoke(IPC_CHANNELS.LLM_NEXT_QUESTION, { context, lastChoice })).pipe(
      tap(() => this.telemetry.recordCall('next-question', 'success', performance.now() - started)),
      finalize(() => void 0),
    ) as Observable<NextQuestionResponse>;
  }

  /**
   * Generate draft via IPC (returns Observable for Angular compatibility)
   * This is the primary method used by components.
   */
  generateDraft(context: ClarificationContext): Observable<DraftResponse> {
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
      finalize(() => void 0),
    ) as Observable<DraftResponse>;
  }
}

/**
 * Factory for creating IpcLlmGateway instances
 */
export class IpcLlmGatewayFactory {
  constructor(private readonly telemetry: TelemetryService) {}

  create(): IpcLlmGateway {
    return new IpcLlmGateway(this.telemetry);
  }
}
