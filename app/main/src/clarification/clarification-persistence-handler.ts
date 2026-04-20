import { createHash } from 'node:crypto';

import type { ClarificationSession } from '@clarityokr/contracts';

import { Logger } from '../core/logger.js';
import type { ISessionRepository } from '../persistence/interfaces/index.js';
import type { IClarificationPersistenceHandler } from './interfaces/persistence-handler.interface.js';
import { PersistenceError } from './types.js';

/**
 * ClarificationPersistenceHandler - 会话持久化操作
 * 职责：管理会话的保存、加载和恢复
 */
export class ClarificationPersistenceHandler implements IClarificationPersistenceHandler {
  constructor(private readonly sessionRepository: ISessionRepository) {}

  /**
   * 持久化会话
   */
  async persistSession(session: ClarificationSession): Promise<void> {
    try {
      await this.sessionRepository.save(session);

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
      const sessions = await this.sessionRepository.getAll();

      if (sessions.length === 0) {
        return null;
      }

      const latestSession = sessions.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )[0];

      Logger.info(`[Persistence] Session ${latestSession.id} restored`);
      return latestSession;
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
      const sessions = await this.sessionRepository.getAll();
      await Promise.all(sessions.map((s) => this.sessionRepository.delete(s.id)));
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
