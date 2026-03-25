import type { ClarificationSession } from '@clarityokr/contracts';

/**
 * 响应处理接口
 * 职责：处理用户选择响应并记录选择
 */
export interface IClarificationResponseHandler {
  /**
   * 处理用户响应
   * @param sessionId - 会话ID
   * @param promptId - 提示ID
   * @param optionId - 选项ID
   * @throws {SessionNotFoundError} 如果会话不存在
   * @throws {InvalidSelectionError} 如果选择无效
   */
  handleResponse(sessionId: string, promptId: string, optionId: string): Promise<void>;

  /**
   * 记录用户选择
   * @param session - 当前会话
   * @param optionId - 选项ID
   */
  recordSelection(session: ClarificationSession, optionId: string): Promise<void>;
}
