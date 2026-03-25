import type { ClarificationSession, OKRDocument } from '@clarityokr/contracts';

/**
 * OKR草案响应
 */
export interface OkrDraftResponse {
  okr: OKRDocument;
  session: ClarificationSession;
}

/**
 * 草稿处理接口
 * 职责：调用LLM生成OKR草案并验证
 */
export interface IClarificationDraftHandler {
  /**
   * 生成OKR草案
   * @param sessionId - 会话ID
   * @returns 包含OKR和会话的响应
   * @throws {SessionNotFoundError} 如果会话不存在
   * @throws {DraftValidationError} 如果草案验证失败
   * @throws {LLMError} 如果LLM调用失败
   */
  generateDraft(sessionId: string): Promise<OkrDraftResponse>;

  /**
   * 验证草案
   * @param draft - LLM返回的草案数据
   * @returns 是否有效
   */
  validateDraft(draft: unknown): boolean;
}
