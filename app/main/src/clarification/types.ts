/**
 * 错误基类
 */
export class ClarificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * 验证错误
 */
export class ValidationError extends ClarificationError {
  constructor(message: string) {
    super(message);
  }
}

/**
 * 会话未找到错误
 */
export class SessionNotFoundError extends ClarificationError {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
  }
}

/**
 * 无效选择错误
 */
export class InvalidSelectionError extends ClarificationError {
  constructor(message: string) {
    super(message);
  }
}

/**
 * 草案验证错误
 */
export class DraftValidationError extends ClarificationError {
  constructor(message: string) {
    super(message);
  }
}

/**
 * 持久化错误
 */
export class PersistenceError extends ClarificationError {
  constructor(message: string) {
    super(message);
  }
}

/**
 * 状态转换错误
 */
export class StateTransitionError extends ClarificationError {
  constructor(fromState: string, toState: string) {
    super(`Invalid state transition from "${fromState}" to "${toState}"`);
  }
}

/**
 * LLM服务错误
 */
export class LLMError extends ClarificationError {
  constructor(message: string) {
    super(message);
  }
}

/**
 * 用户意图请求
 */
export interface ClarificationPromptRequest {
  sessionId: string;
  intent: string;
}

/**
 * 用户选项选择
 */
export interface ClarificationOptionSelection {
  sessionId: string;
  promptId: string;
  optionId: string;
}

// Re-export types from contracts
export type {
  ClarificationSession,
  ClarificationPrompt,
  OKRDocument,
  KeyResult,
} from '@clarityokr/contracts';
