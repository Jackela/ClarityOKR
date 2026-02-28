import { Injectable, NgZone } from '@angular/core';
import {
  clarificationOptionSelectionSchema,
  clarificationPromptRequestSchema,
  clarificationPromptResponseSchema,
} from '@clarityokr/contracts';
import { from, Observable, of, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { getClarityBridge, getClarityBridgeOrUndefined } from '../../shared/bridge';
import { IPC_CHANNELS } from '../../shared/ipc-channel.tokens';
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
    const bridge = getClarityBridge();
    const parsed = clarificationPromptRequestSchema.safeParse({ sessionId, intent });
    if (!parsed.success) {
      const message = parsed.error.message;
      this.store.setValidationError(message);
      return throwError(() => new Error(message));
    }

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
        this.store.setValidationError(message);
        return throwError(() => (error instanceof Error ? error : new Error(message)));
      }),
    );
  }

  recordSelection(sessionId: string, promptId: string, optionId: string): Observable<void> {
    const bridge = getClarityBridge();
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

  private registerPromptListener(): void {
    if (this.isListenerRegistered) {
      return;
    }

    const bridge = getClarityBridgeOrUndefined();
    if (!bridge) {
      return;
    }

    bridge.on(IPC_CHANNELS.CLARIFICATION_PROMPT, (_event, payload) => {
      this.zone.run(() => {
        const parsed = clarificationPromptResponseSchema.safeParse(payload);
        if (!parsed.success) {
          const message = parsed.error.message;
          this.store.setValidationError(message);
          return;
        }
        this.store.setPrompt(parsed.data.prompt);
      });
    });

    this.isListenerRegistered = true;
  }
}
