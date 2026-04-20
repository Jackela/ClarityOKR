/**
 * ClarificationResponseHandler - Processes user selection responses
 *
 * Responsibilities:
 * - Validates user selections against available options
 * - Records user choices in the session
 * - Triggers state machine transitions based on selections
 * - Ensures data integrity between prompts and selections
 */

import { Logger } from '../core/logger.js';
import type { ClarificationPrompt } from '@clarityokr/contracts';
import type { IClarificationResponseHandler } from './interfaces/response-handler.interface.js';
import type { IClarificationSessionManager } from './interfaces/session-manager.interface.js';
import type { IClarificationStateMachine } from './interfaces/state-machine.interface.js';
import type { ClarificationSession } from './types.js';
import { SessionNotFoundError, InvalidSelectionError } from './types.js';

/**
 * ClarificationResponseHandler - 处理用户选择响应
 * 职责：处理用户选择响应并记录选择
 */
export class ClarificationResponseHandler implements IClarificationResponseHandler {
  constructor(
    private readonly sessionManager: IClarificationSessionManager,
    private readonly stateMachine: IClarificationStateMachine,
  ) {}

  /**
   * Handles user response by validating and recording the selection.
   *
   * @param sessionId - The active session identifier
   * @param promptId - ID of the prompt/question being answered
   * @param optionId - ID of the selected option
   * @returns Promise that resolves when selection is recorded
   * @throws {InvalidSelectionError} If parameters are missing or invalid
   * @throws {SessionNotFoundError} If session does not exist
   */


  async handleResponse(sessionId: string, promptId: string, optionId: string): Promise<void> {
    // 验证参数
    if (!sessionId || !promptId || !optionId) {
      throw new InvalidSelectionError('SessionId, promptId, and optionId are required');
    }

    Logger.info('[ResponseHandler] Recording selection', {
      sessionId,
      promptId,
      optionId,
    });

    // 获取会话
    const session = await this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    // 验证选择
    this.validateSelection(session, promptId, optionId);

    // 记录选择
    await this.recordSelection(session, optionId);

    Logger.info('[ResponseHandler] Selection recorded', {
      sessionId,
      selectedOptionCount: session.selectedOptions.length,
    });
  }

  /**
   * Records a user selection in the session and updates state.
   *
   * @param session - The current clarification session
   * @param optionId - ID of the selected option
   * @returns Promise that resolves when selection is saved
   */


  async recordSelection(session: ClarificationSession, optionId: string): Promise<void> {
    session.selectedOptions = [
      ...session.selectedOptions,
      { promptId: session.pendingQuestionId ?? '', optionId, selectedAt: new Date().toISOString() },
    ];
    session.pendingQuestionId = null;
    session.updatedAt = new Date().toISOString();

    await this.sessionManager.saveSession(session);

    // 状态转换：ready -> collecting
    if (this.stateMachine.canTransition(session.status, 'collecting')) {
      await this.stateMachine.transition(session, 'collecting');
    }
  }

  /**
   * Validates that the selection matches available options.
   *
   * @param session - The current clarification session
   * @param promptId - ID of the prompt being answered
   * @param optionId - ID of the selected option
   * @throws {InvalidSelectionError} If prompt or option not found
   */


  private validateSelection(
    session: ClarificationSession,
    promptId: string,
    optionId: string,
  ): void {
    // 验证 prompt 存在
    const prompt = session.steps.find((s: ClarificationPrompt) => s.id === promptId);
    if (!prompt) {
      throw new InvalidSelectionError(`Prompt ${promptId} not found in session`);
    }

    // 验证 option 存在
    const option = prompt.options.find((o: { id: string }) => o.id === optionId);
    if (!option) {
      throw new InvalidSelectionError(`Option ${optionId} not found in prompt ${promptId}`);
    }
  }
}
