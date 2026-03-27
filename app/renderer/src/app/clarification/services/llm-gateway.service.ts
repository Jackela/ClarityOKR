import { Injectable } from '@angular/core';
import { defer } from 'rxjs';
import type { Observable } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';
import type { ClarificationContext, LastChoice } from '@clarityokr/contracts';

import type { TelemetryService } from '../../services/telemetry.service';
import { IPC_CHANNELS } from '../../shared/ipc-channel.tokens';
import type { ClarifyOkrApi } from '../../shared/window';

function bridgeOrThrow(): ClarifyOkrApi {
  const candidate = window.clarifyOkr;
  if (!candidate) throw new Error('ClarifyOKR bridge is unavailable.');
  return candidate;
}

@Injectable({ providedIn: 'root' })
export class LlmGatewayService {
  constructor(private readonly telemetry: TelemetryService) {}

  getNextQuestion(context: ClarificationContext, lastChoice: LastChoice): Observable<unknown> {
    const bridge = bridgeOrThrow();
    const started = performance.now();
    return defer(() => bridge.invoke(IPC_CHANNELS.LLM_NEXT_QUESTION, { context, lastChoice })).pipe(
      tap(() => this.telemetry.recordCall('next-question', 'success', performance.now() - started)),
      finalize(() => void 0),
    );
  }

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
      finalize(() => void 0),
    );
  }
}
