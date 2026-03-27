/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * MockLlmGateway - Test implementation of LlmGateway
 *
 * Features:
 * - Queue responses for controlled testing
 * - Record all method calls for assertions
 * - Clear state between tests
 * - Support for error simulation
 * - Observable-based API (compatible with Angular)
 */

import type {
  ClarificationContext,
  DraftResponse,
  LastChoice,
  NextQuestionResponse,
} from '@clarityokr/contracts';
import { Observable } from 'rxjs';

export interface MockLlmGateway {
  getNextQuestion(
    context: ClarificationContext,
    lastChoice: LastChoice,
  ): Observable<NextQuestionResponse>;
  generateDraft(context: ClarificationContext): Observable<DraftResponse>;
  queueNextQuestionResponse(response: NextQuestionResponse): void;
  queueDraftResponse(response: DraftResponse): void;
  queueNextQuestionError(error: Error): void;
  queueDraftError(error: Error): void;
  getNextQuestionCalls(): Array<{ context: ClarificationContext; lastChoice: LastChoice }>;
  getGenerateDraftCalls(): Array<{ context: ClarificationContext }>;
  clear(): void;
}

type QueueItem =
  | { type: 'nextQuestion'; response: NextQuestionResponse }
  | { type: 'draft'; response: DraftResponse }
  | { type: 'nextQuestionError'; error: Error }
  | { type: 'draftError'; error: Error };

function of<T>(value: T) {
  return new Observable((observer) => {
    observer.next(value);
    observer.complete();
  });
}

function throwError(errorFn: () => Error) {
  return new Observable((observer) => {
    observer.error(errorFn());
  });
}

export class MockLlmGatewayImpl implements MockLlmGateway {
  private nextQuestionQueue: QueueItem[] = [];
  private draftQueue: QueueItem[] = [];
  private nextQuestionCalls: Array<{ context: ClarificationContext; lastChoice: LastChoice }> = [];
  private generateDraftCalls: Array<{ context: ClarificationContext }> = [];

  queueNextQuestionResponse(response: NextQuestionResponse): void {
    this.nextQuestionQueue.push({ type: 'nextQuestion', response });
  }

  queueDraftResponse(response: DraftResponse): void {
    this.draftQueue.push({ type: 'draft', response });
  }

  queueNextQuestionError(error: Error): void {
    this.nextQuestionQueue.push({ type: 'nextQuestionError', error });
  }

  queueDraftError(error: Error): void {
    this.draftQueue.push({ type: 'draftError', error });
  }

  getNextQuestionCalls(): Array<{ context: ClarificationContext; lastChoice: LastChoice }> {
    return [...this.nextQuestionCalls];
  }

  getGenerateDraftCalls(): Array<{ context: ClarificationContext }> {
    return [...this.generateDraftCalls];
  }

  clear(): void {
    this.nextQuestionQueue = [];
    this.draftQueue = [];
    this.nextQuestionCalls = [];
    this.generateDraftCalls = [];
  }

  getNextQuestion(
    context: ClarificationContext,
    lastChoice: LastChoice,
  ): Observable<NextQuestionResponse> {
    this.nextQuestionCalls.push({ context, lastChoice });

    const item = this.nextQuestionQueue.shift();
    if (!item) {
      return throwError(() => new Error('No queued response for getNextQuestion'));
    }

    if (item.type === 'nextQuestionError') {
      return throwError(() => item.error);
    }

    if (item.type === 'nextQuestion') {
      return of(item.response);
    }

    return throwError(() => new Error('Invalid queue item type'));
  }

  generateDraft(context: ClarificationContext): Observable<DraftResponse> {
    this.generateDraftCalls.push({ context });

    const item = this.draftQueue.shift();
    if (!item) {
      return throwError(() => new Error('No queued response for generateDraft'));
    }

    if (item.type === 'draftError') {
      return throwError(() => item.error);
    }

    if (item.type === 'draft') {
      return of(item.response);
    }

    return throwError(() => new Error('Invalid queue item type'));
  }
}

/**
 * Factory function to create a new MockLlmGateway instance
 */
export function createMockLlmGateway(): MockLlmGateway {
  return new MockLlmGatewayImpl();
}

/**
 * Angular-compatible factory class
 */
export class MockLlmGatewayFactory {
  create(): MockLlmGateway {
    return createMockLlmGateway();
  }
}
