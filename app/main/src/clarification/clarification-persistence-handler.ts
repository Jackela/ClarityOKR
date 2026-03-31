import { createHash } from 'node:crypto';

import type { ClarificationSession } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import type { SessionRepository } from '../persistence/session-repository.js';
import type {
  IClarificationPersistenceHandler,
  PersistedSessionData,
} from './interfaces/persistence-handler.interface.js';
import { PersistenceError } from './types.js';

const CURRENT_VERSION = '1.0.0';

/**
 * ClarificationPersistenceHandler - 会话持久化操作
 * 职责：管理会话的保存、加载和恢复
 */
export class ClarificationPersistenceHandler implements IClarificationPersistenceHandler {
  constructor(private readonly sessionRepository: SessionRepository) {}

  /**
   * 持久化会话
   */
  async persistSession(session: ClarificationSession): Promise<void> {
    try {
      const _data: PersistedSessionData = {
    try {
      const data: PersistedSessionData = {
        session,
        version: CURRENT_VERSION,
        checksum: this.calculateChecksum(session),
        savedAt: new Date().toISOString(),
      };

      await this.sessionRepository.saveSession(session);

      Logger.info(`[Persistence] Session ${session.id} persisted`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`[Persistence] Failed to persist session:`, errorMsg);
      throw new PersistenceError(`Failed to persist session: ${errorMsg}`);
    }
  }

  /**
   * 恢复会话
   */
  async restoreSession(): Promise<ClarificationSession | null> {
    try {
      const persisted = await this.sessionRepository.load();

      if (!persisted.session) {
        return null;
      }

      // 验证数据完整性 (如果需要校验和，可以在此实现)
      // 当前 SessionRepository 不存储 checksum，如需添加可在 schema 中扩展

      Logger.info(`[Persistence] Session ${persisted.session.id} restored`);
      return persisted.session;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`[Persistence] Failed to restore session:`, errorMsg);
      throw new PersistenceError(`Failed to restore session: ${errorMsg}`);
    }
  }

  /**
   * 清除持久化数据
   */
  async clearPersistence(): Promise<void> {
    try {
      // 保存一个空会话来清除数据
      await this.sessionRepository.saveSession({} as ClarificationSession);
      Logger.info('[Persistence] Persistence cleared');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      Logger.error(`[Persistence] Failed to clear persistence:`, errorMsg);
      throw new PersistenceError(`Failed to clear persistence: ${errorMsg}`);
    }
  }

  /**
   * 计算会话数据的校验和
   */
  private calculateChecksum(session: ClarificationSession): string {
    const data = JSON.stringify(session);
    return createHash('sha256').update(data).digest('hex').slice(0, 16);
  }
}
