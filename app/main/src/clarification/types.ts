/**
 * Re-export unified domain errors from contracts package.
 * Local errors extend ClarificationError for domain-specific behavior.
 */

import {
  DomainError,
  ClarificationError,
  ValidationError,
  PersistenceError,
  LLMError,
  SessionNotFoundError,
} from '@clarityokr/contracts';

export {
  DomainError,
  ClarificationError,
  ValidationError,
  PersistenceError,
  LLMError,
  SessionNotFoundError,
};

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
 * 状态转换错误
 */
export class StateTransitionError extends ClarificationError {
  constructor(fromState: string, toState: string) {
    super(`Invalid state transition from "${fromState}" to "${toState}"`);
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
