import type { ClarificationPrompt } from '@clarityokr/contracts';

/**
 * 提示处理接口
 * 职责：处理用户意图输入并生成初始澄清提示
 */
export interface IClarificationPromptHandler {
  /**
   * 处理用户意图输入
   * @param sessionId - 会话ID
   * @param intent - 用户意图
   * @returns 生成的澄清提示
   * @throws {ValidationError} 如果意图无效
   * @throws {LLMError} 如果LLM调用失败
   */
  handlePrompt(sessionId: string, intent: string): Promise<ClarificationPrompt>;

  /**
   * 验证用户意图
   * @param intent - 用户意图
   * @returns 是否有效
   */
  validateIntent(intent: string): boolean;

  /**
   * 获取下一个问题
   * @param sessionId - 会话ID
   * @param currentQuestionId - 当前问题ID
   * @param context - 对话上下文
   * @returns 下一个澄清提示
   * @throws {ValidationError} 如果会话不存在
   * @throws {LLMError} 如果LLM调用失败
   */
  getNextQuestion(
    sessionId: string,
    currentQuestionId: string,
    context: { turns: Array<{ questionId: string; optionId: string; timestamp: string }> },
  ): Promise<ClarificationPrompt>;
}
