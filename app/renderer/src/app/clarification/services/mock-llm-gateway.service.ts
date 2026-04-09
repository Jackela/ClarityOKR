/**
 * MockLlmGateway - Test Implementation of LlmGateway
 *
 * This module provides a mock implementation of the LlmGateway interface designed
 * for unit and integration testing. It allows precise control over LLM responses
 * through a queue-based system and records all method calls for test assertions.
 *
 * Key Features:
 * - Queue responses for controlled, deterministic testing
 * - Record all method calls for verification in tests
 * - Clear state between tests to ensure isolation
 * - Simulate errors to test error handling paths
 * - Observable-based API compatible with Angular's reactive patterns
 *
 * Testing Patterns:
 * - Queue expected responses before invoking methods
 * - Verify calls were made with expected arguments
 * - Simulate network errors and timeouts
 * - Reset state between tests using clear()
 *
 * Dependencies:
 * - @clarityokr/contracts: Type definitions for contexts and responses
 * - RxJS: Observable-based API for Angular compatibility
 *
 * @module clarification/services/mock-llm-gateway.service
 *
 * @example
 * ```typescript
 * // Setup in a test
 * const mockGateway = createMockLlmGateway();
 *
 * // Queue a successful response
 * mockGateway.queueNextQuestionResponse({
 *   question: 'What is your timeline?',
 *   options: [
 *     { id: 'opt1', label: 'This quarter' },
 *     { id: 'opt2', label: 'This year' }
 *   ]
 * });
 *
 * // Use in your test
 * mockGateway.getNextQuestion(context, lastChoice).subscribe({
 *   next: (response) => {
 *     expect(response.question).toBe('What is your timeline?');
 *   }
 * });
 *
 * // Verify the call was made
 * expect(mockGateway.getNextQuestionCalls()).toHaveLength(1);
 * expect(mockGateway.getNextQuestionCalls()[0].lastChoice).toEqual(lastChoice);
 * ```
 */

import type {
  ClarificationContext,
  DraftResponse,
  LastChoice,
  NextQuestionResponse,
} from '@clarityokr/contracts';
import type { Observable } from 'rxjs';
import { of, throwError } from 'rxjs';

/**
 * Interface defining the contract for mock LLM gateway implementations.
 *
 * This interface extends the basic gateway functionality with methods for
 * test control and verification. Implementations provide queue-based response
 * management and call recording.
 *
 * @example
 * ```typescript
 * // Use in a test provider override
 * TestBed.configureTestingModule({
 *   providers: [
 *     { provide: LLM_GATEWAY_TOKEN, useValue: createMockLlmGateway() }
 *   ]
 * });
 * ```
 */
export interface MockLlmGateway {
  /**
   * Gets the next clarification question from the queued responses.
   *
   * Records the call arguments for later verification. Returns an Observable
   * that emits the queued response or throws an error if no response is queued.
   *
   * @param context - Current clarification session context
   * @param lastChoice - The user's most recent selection
   * @returns Observable emitting the queued NextQuestionResponse
   * @throws Error if no response is queued for this method
   */
  getNextQuestion(
    context: ClarificationContext,
    lastChoice: LastChoice,
  ): Observable<NextQuestionResponse>;

  /**
   * Generates an OKR draft from the queued responses.
   *
   * Records the call arguments for later verification. Returns an Observable
   * that emits the queued response or throws an error if no response is queued.
   *
   * @param context - Complete clarification session context
   * @returns Observable emitting the queued DraftResponse
   * @throws Error if no response is queued for this method
   */
  generateDraft(context: ClarificationContext): Observable<DraftResponse>;

  /**
   * Queues a response for the next getNextQuestion call.
   *
   * The queued response will be returned in FIFO order when getNextQuestion
   * is invoked. Multiple responses can be queued for sequential calls.
   *
   * @param response - The NextQuestionResponse to return on next call
   *
   * @example
   * ```typescript
   * mockGateway.queueNextQuestionResponse({
   *   question: 'What is your goal?',
   *   options: [{ id: 'opt1', label: 'Option 1' }]
   * });
   * ```
   */
  queueNextQuestionResponse(response: NextQuestionResponse): void;

  /**
   * Queues a response for the next generateDraft call.
   *
   * The queued response will be returned in FIFO order when generateDraft
   * is invoked. Multiple responses can be queued for sequential calls.
   *
   * @param response - The DraftResponse to return on next call
   *
   * @example
   * ```typescript
   * mockGateway.queueDraftResponse({
   *   objective: 'Improve team efficiency',
   *   keyResults: [
   *     { id: 'kr1', statement: 'Reduce cycle time by 20%', ... }
   *   ]
   * });
   * ```
   */
  queueDraftResponse(response: DraftResponse): void;

  /**
   * Queues an error for the next getNextQuestion call.
   *
   * When getNextQuestion is invoked, it will throw this error instead of
   * returning a success response. Useful for testing error handling.
   *
   * @param error - The Error to throw on next getNextQuestion call
   *
   * @example
   * ```typescript
   * mockGateway.queueNextQuestionError(new Error('Network timeout'));
   *
   * mockGateway.getNextQuestion(context, choice).subscribe({
   *   error: (err) => {
   *     expect(err.message).toBe('Network timeout');
   *   }
   * });
   * ```
   */
  queueNextQuestionError(error: Error): void;

  /**
   * Queues an error for the next generateDraft call.
   *
   * When generateDraft is invoked, it will throw this error instead of
   * returning a success response. Useful for testing error handling.
   *
   * @param error - The Error to throw on next generateDraft call
   *
   * @example
   * ```typescript
   * mockGateway.queueDraftError(new Error('LLM service unavailable'));
   *
   * mockGateway.generateDraft(context).subscribe({
   *   error: (err) => {
   *     expect(err.message).toBe('LLM service unavailable');
   *   }
   * });
   * ```
   */
  queueDraftError(error: Error): void;

  /**
   * Gets all recorded calls to getNextQuestion.
   *
   * Returns a copy of the call history, preserving the original order.
   * Each entry contains the context and lastChoice arguments passed to the method.
   *
   * @returns Array of call records with context and lastChoice for each invocation
   *
   * @example
   * ```typescript
   * mockGateway.getNextQuestion(context1, choice1);
   * mockGateway.getNextQuestion(context2, choice2);
   *
   * const calls = mockGateway.getNextQuestionCalls();
   * expect(calls).toHaveLength(2);
   * expect(calls[0].lastChoice).toEqual(choice1);
   * expect(calls[1].lastChoice).toEqual(choice2);
   * ```
   */
  getNextQuestionCalls(): Array<{ context: ClarificationContext; lastChoice: LastChoice }>;

  /**
   * Gets all recorded calls to generateDraft.
   *
   * Returns a copy of the call history, preserving the original order.
   * Each entry contains the context argument passed to the method.
   *
   * @returns Array of call records with context for each invocation
   *
   * @example
   * ```typescript
   * mockGateway.generateDraft(context1);
   * mockGateway.generateDraft(context2);
   *
   * const calls = mockGateway.getGenerateDraftCalls();
   * expect(calls).toHaveLength(2);
   * expect(calls[0].context).toEqual(context1);
   * ```
   */
  getGenerateDraftCalls(): Array<{ context: ClarificationContext }>;

  /**
   * Clears all queued responses and recorded calls.
   *
   * Should be called in beforeEach or afterEach to ensure test isolation.
   * Resets the mock to its initial state.
   *
   * @example
   * ```typescript
   * beforeEach(() => {
   *   mockGateway.clear();
   * });
   * ```
   */
  clear(): void;
}

/**
 * Union type representing items that can be queued for responses.
 *
 * Each item type corresponds to a specific method and outcome:
 * - 'nextQuestion': Successful response for getNextQuestion
 * - 'draft': Successful response for generateDraft
 * - 'nextQuestionError': Error thrown by getNextQuestion
 * - 'draftError': Error thrown by generateDraft
 *
 * @internal
 */
type QueueItem =
  | { type: 'nextQuestion'; response: NextQuestionResponse }
  | { type: 'draft'; response: DraftResponse }
  | { type: 'nextQuestionError'; error: Error }
  | { type: 'draftError'; error: Error };

/**
 * Implementation of the MockLlmGateway interface.
 *
 * This class provides the actual mock implementation with queue management
 * and call recording. It maintains separate queues for each method and
 * tracks all invocations for verification.
 *
 * The implementation uses RxJS Observables to match the production gateway
 * interface, ensuring tests exercise the same async patterns as production code.
 *
 * @example
 * ```typescript
 * // Create and use directly
 * const mock = new MockLlmGatewayImpl();
 * mock.queueNextQuestionResponse({ question: 'Q?', options: [] });
 *
 * // Or use the factory function
 * const mock = createMockLlmGateway();
 * ```
 */
export class MockLlmGatewayImpl implements MockLlmGateway {
  /** Queue for getNextQuestion responses and errors */
  private nextQuestionQueue: QueueItem[] = [];

  /** Queue for generateDraft responses and errors */
  private draftQueue: QueueItem[] = [];

  /** History of getNextQuestion calls for verification */
  private nextQuestionCalls: Array<{ context: ClarificationContext; lastChoice: LastChoice }> = [];

  /** History of generateDraft calls for verification */
  private generateDraftCalls: Array<{ context: ClarificationContext }> = [];

  /**
   * Queues a successful response for getNextQuestion.
   *
   * @param response - The NextQuestionResponse to return
   */
  queueNextQuestionResponse(response: NextQuestionResponse): void {
    this.nextQuestionQueue.push({ type: 'nextQuestion', response });
  }

  /**
   * Queues a successful response for generateDraft.
   *
   * @param response - The DraftResponse to return
   */
  queueDraftResponse(response: DraftResponse): void {
    this.draftQueue.push({ type: 'draft', response });
  }

  /**
   * Queues an error to be thrown by getNextQuestion.
   *
   * @param error - The Error to throw
   */
  queueNextQuestionError(error: Error): void {
    this.nextQuestionQueue.push({ type: 'nextQuestionError', error });
  }

  /**
   * Queues an error to be thrown by generateDraft.
   *
   * @param error - The Error to throw
   */
  queueDraftError(error: Error): void {
    this.draftQueue.push({ type: 'draftError', error });
  }

  /**
   * Gets recorded calls to getNextQuestion.
   *
   * @returns Copy of the call history array
   */
  getNextQuestionCalls(): Array<{ context: ClarificationContext; lastChoice: LastChoice }> {
    return [...this.nextQuestionCalls];
  }

  /**
   * Gets recorded calls to generateDraft.
   *
   * @returns Copy of the call history array
   */
  getGenerateDraftCalls(): Array<{ context: ClarificationContext }> {
    return [...this.generateDraftCalls];
  }

  /**
   * Resets all queues and call history.
   */
  clear(): void {
    this.nextQuestionQueue = [];
    this.draftQueue = [];
    this.nextQuestionCalls = [];
    this.generateDraftCalls = [];
  }

  /**
   * Gets the next question from the queue.
   *
   * Records the call, dequeues the next item, and returns either a success
   * Observable or throws an error based on the queued item type.
   *
   * @param context - Clarification context
   * @param lastChoice - User's last choice
   * @returns Observable with NextQuestionResponse or error
   * @throws Error if queue is empty or item type is invalid
   */
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

  /**
   * Generates a draft from the queue.
   *
   * Records the call, dequeues the next item, and returns either a success
   * Observable or throws an error based on the queued item type.
   *
   * @param context - Clarification context
   * @returns Observable with DraftResponse or error
   * @throws Error if queue is empty or item type is invalid
   */
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
 * Factory function to create a new MockLlmGateway instance.
 *
 * This is the preferred way to create mock gateways in tests. It provides
 * a clean, functional interface for test setup.
 *
 * @returns A new MockLlmGateway instance ready for configuration
 *
 * @example
 * ```typescript
 * describe('MyComponent', () => {
 *   let mockGateway: MockLlmGateway;
 *
 *   beforeEach(() => {
 *     mockGateway = createMockLlmGateway();
 *     TestBed.configureTestingModule({
 *       providers: [
 *         { provide: LLM_GATEWAY_TOKEN, useValue: mockGateway }
 *       ]
 *     });
 *   });
 *
 *   it('should fetch question', () => {
 *     mockGateway.queueNextQuestionResponse({
 *       question: 'Test question?',
 *       options: []
 *     });
 *
 *     // ... test code
 *   });
 * });
 * ```
 */
export function createMockLlmGateway(): MockLlmGateway {
  return new MockLlmGatewayImpl();
}

/**
 * Angular-compatible factory class for creating MockLlmGateway instances.
 *
 * This factory class can be used with Angular's dependency injection system
 * when you need to provide mock gateways through factories.
 *
 * @example
 * ```typescript
 * // In test module configuration
 * providers: [
 *   {
 *     provide: LLM_GATEWAY_TOKEN,
 *     useFactory: () => new MockLlmGatewayFactory().create()
 *   }
 * ]
 * ```
 */
export class MockLlmGatewayFactory {
  /**
   * Creates a new MockLlmGateway instance.
   *
   * @returns A fresh MockLlmGateway ready for test configuration
   */
  create(): MockLlmGateway {
    return createMockLlmGateway();
  }
}
