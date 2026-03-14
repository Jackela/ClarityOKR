/**
 * LlmGateway Contract - Abstract interface for LLM operations
 *
 * This contract defines the interface for interacting with LLM services
 * in a platform-agnostic way, enabling dependency injection and testing.
 */

// ============================================================================
// Request/Response Types
// ============================================================================

export interface ClarificationTurn {
  questionId: string;
  optionId: string;
  timestamp: string;
}

export interface ClarificationContext {
  turns: ClarificationTurn[];
}

export interface LastChoice {
  questionId: string;
  optionId: string;
}

export interface NextQuestionOption {
  id: string;
  label: string;
  value?: string;
}

export interface NextQuestion {
  id: string;
  text: string;
  options: NextQuestionOption[];
}

export interface NextQuestionResponse {
  question: NextQuestion;
}

export interface DraftResponse {
  okr: unknown;
  session: unknown;
}

// ============================================================================
// Abstract Interface
// ============================================================================

/**
 * Abstract interface for LLM gateway operations.
 *
 * Implementations should handle:
 * - Getting the next question based on context
 * - Generating OKR drafts from context
 * - Error handling and timeouts
 *
 * Note: This interface is generic over the return type (T) to support both
 * Promise-based and Observable-based implementations.
 */
export interface LlmGateway {
  /**
   * Get the next clarification question based on current context
   * @param context - Current clarification context with previous turns
   * @param lastChoice - The last option selected by the user
   * @returns Response resolving to the next question
   */
  getNextQuestion(
    context: ClarificationContext,
    lastChoice: LastChoice,
  ): Promise<NextQuestionResponse>;

  /**
   * Generate an OKR draft from the current clarification context
   * @param context - Current clarification context with all turns
   * @returns Response resolving to the draft
   */
  generateDraft(context: ClarificationContext): Promise<DraftResponse>;
}

/**
 * Observable-based LlmGateway interface for Angular applications.
 * 
 * Note: This interface uses a generic type parameter for Observable
to avoid a direct dependency on rxjs in the contracts package.
 */
export interface LlmGatewayObservable<T = unknown> {
  /**
   * Get the next clarification question based on current context
   * @param context - Current clarification context with previous turns
   * @param lastChoice - The last option selected by the user
   * @returns Observable emitting the next question response
   */
  getNextQuestion(context: ClarificationContext, lastChoice: LastChoice): T;

  /**
   * Generate an OKR draft from the current clarification context
   * @param context - Current clarification context with all turns
   * @returns Observable emitting the draft response
   */
  generateDraft(context: ClarificationContext): T;
}

// ============================================================================
// Factory Pattern
// ============================================================================

/**
 * Factory interface for creating LlmGateway instances.
 * Useful for creating different implementations based on environment.
 */
export interface LlmGatewayFactory {
  create(): LlmGateway;
}

// ============================================================================
// Injection Token
// ============================================================================

/**
 * Injection token for LlmGateway in Angular DI system.
 *
 * Usage:
 * ```typescript
 * providers: [
 *   { provide: LLM_GATEWAY_TOKEN, useClass: IpcLlmGateway }
 * ]
 * ```
 */
export const LLM_GATEWAY_TOKEN = Symbol('LlmGateway');

/**
 * Alternative string-based injection token for Angular compatibility
 */
export const LLM_GATEWAY_INJECTION_TOKEN = 'LlmGateway';
