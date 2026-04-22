import type { ClarificationSession } from '@clarityokr/contracts';

/**
 * 会话生命周期管理接口
 * 职责：统一管理会话的创建、获取、保存和重置
 */
export interface IClarificationSessionManager {
  /**
   * 创建新会话
   * @param sessionId - 会话ID
   * @param initialIntent - 初始意图
   * @returns 创建的会话对象
   */
  createSession(sessionId: string, initialIntent: string): ClarificationSession;

  /**
   * 获取会话（优先从内存，其次从持久化存储）
   * @param sessionId - 会话ID
   * @returns 会话对象或null
   */
  getSession(sessionId: string): Promise<ClarificationSession | null>;

  /**
   * 结束会话
   * @param sessionId - 会话ID
   */
  endSession(sessionId: string): Promise<void>;

  /**
   * 保存会话到持久化存储
   * @param session - 要保存的会话
   */
  saveSession(session: ClarificationSession): Promise<void>;

  /**
   * 从持久化存储加载会话到内存
   * @returns 加载的会话或null
   */
  loadFromPersistence(): Promise<ClarificationSession | null>;
}

/**
 * 会话管理器测试扩展接口
 * 职责：提供测试和调试所需的会话内省方法
 */
export interface ISessionManagerTestExtensions {
  /**
   * 获取所有会话（用于测试模式）
   * @returns 会话映射
   */
  getAllSessions(): Map<string, ClarificationSession>;

  /**
   * 获取当前会话ID（用于测试模式）
   * @returns 当前会话ID或null
   */
  getCurrentSessionId(): string | null;

  /**
   * 获取会话数量（用于测试模式）
   * @returns 会话数量
   */
  getSessionCount(): number;
}
