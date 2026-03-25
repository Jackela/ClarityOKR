import type { ClarificationSession } from '@clarityokr/contracts';

/**
 * 持久化数据格式
 */
export interface PersistedSessionData {
  session: ClarificationSession;
  version: string;
  checksum: string;
  savedAt: string;
}

/**
 * 持久化处理接口
 * 职责：管理会话的保存、加载和恢复
 */
export interface IClarificationPersistenceHandler {
  /**
   * 持久化会话
   * @param session - 要保存的会话
   * @throws {PersistenceError} 如果保存失败
   */
  persistSession(session: ClarificationSession): Promise<void>;

  /**
   * 恢复会话
   * @returns 恢复的会话或null
   * @throws {PersistenceError} 如果加载失败
   */
  restoreSession(): Promise<ClarificationSession | null>;

  /**
   * 清除持久化数据
   * @throws {PersistenceError} 如果清除失败
   */
  clearPersistence(): Promise<void>;
}
