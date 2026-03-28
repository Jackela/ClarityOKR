/**
 * LLM Gateway Service - Communicates with LLM via IPC
 *
 * This service provides an Observable-based interface for interacting
 * with the LLM service in the main process. It handles:
 * - Fetching next clarification questions
 * - Generating OKR drafts from context
 * - Telemetry tracking for performance monitoring
 *
 * Uses Electron IPC channels to communicate with the main process.
 */
import { defer } from 'rxjs';
import type { Observable } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';
import type { ClarificationContext, LastChoice } from '@clarityokr/contracts';

import type { TelemetryService } from '@services/telemetry.service';
import { IPC_CHANNELS } from '@shared/ipc-channel.tokens';
import type { ClarifyOkrApi } from '@shared/window';

function bridgeOrThrow(): ClarifyOkrApi {
  const candidate = window.clarifyOkr;
  if (!candidate) throw new Error('ClarifyOKR bridge is unavailable.');
  return candidate;
}

@Injectable({ providedIn: 'root' })
/**
 * Service for LLM communication via IPC bridge
 */
export class LlmGatewayService {
  constructor(private readonly telemetry: TelemetryService) {}

  getNextQuestion(context: ClarificationContext, lastChoice: LastChoice): Observable<unknown> {
/**
 * Gets the next clarification question based on current context.
 *
 * @param context - Current clarification context with previous turns
 * @param lastChoice - The last option selected by the user
 * @returns Observable emitting the next question response
 */
    const bridge = bridgeOrThrow();
    const started = performance.now();
    return defer(() => bridge.invoke(IPC_CHANNELS.LLM_NEXT_QUESTION, { context, lastChoice })).pipe(
      tap(() => this.telemetry.recordCall('next-question', 'success', performance.now() - started)),
      finalize(() => void 0),
    );
  }

  generateDraft(context: ClarificationContext): Observable<unknown> {
/**
 * Generates an OKR draft from the current clarification context.
 *
 * @param context - Current clarification context with all turns
 * @returns Observable emitting the draft response
 */
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
    );
  }
}
