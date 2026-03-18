import { clarificationOptionSelectionSchema } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import type { SessionManager } from '../services/session-manager.service.js';

/**
 * ClarificationRespondHandler - 处理CLARIFICATION_RESPOND IPC请求
 * 职责：记录用户的选项选择
 */
export class ClarificationRespondHandler {
  constructor(private readonly sessionManager: SessionManager) {}

  async handle(payload: unknown): Promise<void> {
    const response = clarificationOptionSelectionSchema.parse(payload);

    Logger.info('[main] handleResponse: recording selection', {
      sessionId: response.sessionId,
      promptId: response.promptId,
      optionId: response.optionId,
    });

    // 从内存缓存或持久化存储获取会话
    const session = await this.sessionManager.getSession(response.sessionId);

    if (!session) {
      Logger.warn('[main] handleResponse: session not found', {
        requestedId: response.sessionId,
      });
      throw new Error('Cannot record selection without an active clarification session.');
    }

    // 记录选择
    await this.sessionManager.recordSelection(session, response.optionId);

    Logger.info('[ClarificationRespondHandler] handleResponse: selection saved', {
      sessionId: session.id,
      selectedOptionCount: session.selectedOptionIds.length,
    });
  }
}
